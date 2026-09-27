// Slouch detector with BLE telemetry.
//
// Press BOOT while sitting upright to set the "upright" pitch (z). Leaning forward
// past THRESHOLD_DEG is a detected slouch; leaning back never counts. The red LED
// blinks when a 10-second lean qualifies and stops after 3 seconds upright.
// Qualification credits the initial 10 seconds and counts one episode; shorter
// leans count for neither. Recovery time stays in the same slouch episode.
//
// Results are published over BLE following docs/ble-protocol.md (draft v1) in the
// buzzbuzzlovers repo: a readable 16-byte device identity, plus a 20-byte session
// snapshot (read + notify) sent once per second and on every state change.
//
// Wiring: BNO055 on I2C (SDA = GPIO 21, SCL = GPIO 22, address 0x28),
//         red LED on GPIO 17 through a resistor to GND.
#include <atomic>
#include <Wire.h>
#include <Preferences.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLE2902.h>
#include <esp_random.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BNO055.h>
#include "posture_timing.h"

// --- Tuning ---
const float THRESHOLD_DEG = 10.0;          // how far forward you can lean before it counts
const unsigned long SETTLE_MS = 1000;      // pause after pressing BOOT so you can get still
const unsigned long CALIBRATE_MS = 3000;   // how long to average the baseline
const unsigned long PUBLISH_MS = 1000;     // BLE heartbeat interval
const uint16_t LOOP_DELAY_MS = 100;
const unsigned long BLINK_MS = 250;        // LED on/off time while alerting

const int CAL_BUTTON = 0;  // the BOOT button on the dev board; reads LOW when pressed
const int LED_PIN = 17;    // red LED (+ leg), through a resistor to GND
const uint8_t BNO_ADDR = 0x28;
const uint8_t BNO_OPR_MODE_REG = 0x3D;

// --- BLE contract (docs/ble-protocol.md) ---
const char *DEVICE_NAME = "bbl-posture";
const char *SERVICE_UUID = "caa153e1-8bec-412c-a7ea-570bf12cbd13";
const char *IDENTITY_UUID = "5a02ab16-022f-43a7-8b81-2d136526c605";
const char *CONTROL_UUID = "883c8f42-529b-47ef-ae21-278020ae5c55";
const char *WARNING_UUID = "9c052810-52d4-4fc9-9c03-f37e93874bc1";
const char *SNAPSHOT_UUID = "3ea72a7d-ef99-4f43-95d7-d6860687824e";
const uint8_t PROTOCOL_VERSION = 1;

enum State : uint8_t {
  STATE_IDLE = 0,
  STATE_CALIBRATING = 1,
  STATE_UPRIGHT = 2,
  STATE_SLOUCHING = 3,
  STATE_SENSOR_ERROR = 4,
  STATE_ENDED = 5,
};
const char *STATE_NAMES[] = {"idle", "calibrating", "upright", "slouching", "sensor_error", "ended"};

Adafruit_BNO055 bno = Adafruit_BNO055(55, BNO_ADDR, &Wire);
Preferences prefs;
BLECharacteristic *snapshotChar = nullptr;
BLECharacteristic *warningChar = nullptr;
std::atomic<bool> calibrationRequested{false};
bool bleConnected = false;
bool bnoReady = false;

uint8_t deviceId[16];

// Session snapshot fields
State state = STATE_IDLE;
uint32_t sessionId = 0;       // 0 = no session yet
uint32_t sequence = 0;
uint64_t trackedMs = 0;       // time spent upright or slouching
uint64_t slouchMs = 0;        // qualified slouch time, including entry/recovery windows
uint16_t episodeCount = 0;
bool stateChanged = true;
unsigned long lastPublish = 0;
unsigned long lastTick = 0;

// Calibration
float baseline = 0;
unsigned long calStart = 0;
bool calHaveFirst = false;
float calFirst = 0, calSum = 0;
int calCount = 0;

// Shared qualification, episode and recovery timing (decision 017).
PostureTiming postureTiming;

class ControlCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *characteristic) override {
    const auto value = characteristic->getValue();
    // Version 1, command 1: calibrate. Run sensor work only in loop().
    if (value.length() == 2 && value[0] == 1 && value[1] == 1) calibrationRequested.store(true);
  }
};

class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer *server) override {
    bleConnected = true;
    Serial.println("BLE: connected");
  }
  void onDisconnect(BLEServer *server) override {
    calibrationRequested.store(false);
    bleConnected = false;
    Serial.println("BLE: disconnected, advertising again");
    BLEDevice::startAdvertising();
  }
};

void setState(State s) {
  if (s != state) {
    state = s;
    stateChanged = true;
  }
}

// Blink the LED while alerting, off otherwise. Uses millis() so it never pauses the loop.
void updateLed() {
  bool on = postureTiming.slouching() && (millis() / BLINK_MS) % 2 == 0;
  digitalWrite(LED_PIN, on ? HIGH : LOW);
}

void clearDetection() {
  postureTiming.clear();
}

// Read one BNO055 register; returns -1 if the sensor doesn't answer.
int readBnoReg(uint8_t reg) {
  Wire.beginTransmission(BNO_ADDR);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0) return -1;
  if (Wire.requestFrom(BNO_ADDR, (uint8_t)1) != 1) return -1;
  return Wire.read();
}

// The sensor is usable only if it answers AND is still in IMU mode. If it resets
// (e.g. a power dip), it drops back to config mode where every reading is 0, so
// flag it and let loop() re-initialize it.
bool sensorOk() {
  int mode = readBnoReg(BNO_OPR_MODE_REG);
  if (mode < 0) return false;
  if ((mode & 0x0F) != OPERATION_MODE_IMUPLUS) {
    Serial.printf("BNO055 left IMU mode (mode=0x%02X); re-initializing\n", mode);
    bnoReady = false;
    return false;
  }
  return true;
}

float readPitch() {
  sensors_event_t event;
  bno.getEvent(&event, Adafruit_BNO055::VECTOR_EULER);
  return event.orientation.z;
}

// Difference between two angles, wrapped to -180..180 so crossing +/-180 doesn't spike.
float angleDiff(float a, float b) {
  float d = a - b;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

// Identity is generated once and kept in flash. If the session counter is missing
// (flash erased), a fresh identity is generated so session IDs are never reused.
void loadIdentity() {
  prefs.begin("bbl", false);
  if (!prefs.isKey("sess") || prefs.getBytesLength("id") != sizeof(deviceId)) {
    esp_fill_random(deviceId, sizeof(deviceId));   // radio is on, so this is true random
    prefs.putBytes("id", deviceId, sizeof(deviceId));
    prefs.putUInt("sess", 0);
    Serial.println("Generated new device identity");
  } else {
    prefs.getBytes("id", deviceId, sizeof(deviceId));
  }
  Serial.print("Device ID: ");
  for (uint8_t b : deviceId) Serial.printf("%02x", b);
  Serial.println();
}

// Persist the new session ID before using it, so a reboot can never reuse it.
uint32_t allocateSession() {
  uint32_t id = prefs.getUInt("sess", 0) + 1;
  prefs.putUInt("sess", id);
  return id;
}

void putU16(uint8_t *p, uint16_t v) { p[0] = v; p[1] = v >> 8; }
void putU32(uint8_t *p, uint32_t v) { p[0] = v; p[1] = v >> 8; p[2] = v >> 16; p[3] = v >> 24; }

// Build one consistent 20-byte little-endian snapshot and send it.
void publish() {
  sequence++;
  uint8_t buf[20];
  buf[0] = PROTOCOL_VERSION;
  buf[1] = state;
  putU32(buf + 2, sessionId);
  putU32(buf + 6, sequence);
  putU32(buf + 10, (uint32_t)(trackedMs / 1000));   // whole seconds, rounded down
  putU32(buf + 14, (uint32_t)(slouchMs / 1000));
  putU16(buf + 18, episodeCount);

  snapshotChar->setValue(buf, sizeof(buf));
  if (bleConnected) snapshotChar->notify();
  uint8_t warning[14];
  warning[0] = 1;
  warning[1] = postureTiming.warningPhase();
  putU32(warning + 2, sessionId);
  putU32(warning + 6, sequence);
  putU16(warning + 10, postureTiming.warningElapsed(millis()));
  putU16(warning + 12, episodeCount);
  warningChar->setValue(warning, sizeof(warning));
  if (bleConnected) warningChar->notify();
  lastPublish = millis();
  stateChanged = false;
}

void setupBle() {
  BLEDevice::init(DEVICE_NAME);
  BLEServer *server = BLEDevice::createServer();
  server->setCallbacks(new ServerCallbacks());
  BLEService *service = server->createService(SERVICE_UUID);

  loadIdentity();   // after BLEDevice::init so the hardware RNG has the radio as entropy
  BLECharacteristic *identityChar =
      service->createCharacteristic(IDENTITY_UUID, BLECharacteristic::PROPERTY_READ);
  identityChar->setValue(deviceId, sizeof(deviceId));

  snapshotChar = service->createCharacteristic(
      SNAPSHOT_UUID, BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY);
  snapshotChar->addDescriptor(new BLE2902());   // lets the browser subscribe to notifications

  warningChar = service->createCharacteristic(
      WARNING_UUID, BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY);
  warningChar->addDescriptor(new BLE2902());
  BLECharacteristic *control = service->createCharacteristic(CONTROL_UUID, BLECharacteristic::PROPERTY_WRITE);
  control->setCallbacks(new ControlCallbacks());
  service->start();
  BLEAdvertising *advertising = BLEDevice::getAdvertising();
  advertising->addServiceUUID(SERVICE_UUID);
  advertising->setScanResponse(true);
  BLEDevice::startAdvertising();
  Serial.printf("BLE: advertising as \"%s\"\n", DEVICE_NAME);
}

void startCalibration() {
  if (state == STATE_ENDED) return;
  if (sessionId == 0) {
    // First calibration since power-on starts a new session with fresh counters.
    sessionId = allocateSession();
    sequence = 0;   // publish() makes the first snapshot of the session sequence 1
    trackedMs = slouchMs = 0;
    episodeCount = 0;
    Serial.printf("Started session %lu\n", (unsigned long)sessionId);
  }
  clearDetection();
  calStart = millis();
  calHaveFirst = false;
  calSum = 0;
  calCount = 0;
  setState(STATE_CALIBRATING);
  Serial.println("Calibrating: sit upright and hold still...");
}

void updateCalibration(unsigned long now, bool ok) {
  if (now - calStart < SETTLE_MS || !ok) return;
  if (now - calStart < SETTLE_MS + CALIBRATE_MS) {
    // Average as offsets from the first reading so values near +/-180 don't cancel out.
    float z = readPitch();
    if (!calHaveFirst) {
      calFirst = z;
      calHaveFirst = true;
    }
    calSum += angleDiff(z, calFirst);
    calCount++;
    return;
  }
  if (calCount == 0) return;   // sensor never answered; keep calibrating
  baseline = calFirst + calSum / calCount;
  setState(STATE_UPRIGHT);
  Serial.printf("Upright baseline: %.2f deg (%d samples)\n", baseline, calCount);
  Serial.printf("Slouch = below %.2f deg. Qualifies after %lu s, clears after %lu s upright. "
                "Press BOOT anytime to recalibrate.\n",
                baseline - THRESHOLD_DEG, (unsigned long)PostureTiming::SLOUCH_MS / 1000,
                (unsigned long)PostureTiming::RECOVER_MS / 1000);
}

void classify(unsigned long now, bool ok) {
  if (!ok) {
    // Interruptions end the current slouch; time does not accumulate while in error.
    clearDetection();
    setState(STATE_SENSOR_ERROR);
    return;
  }

  float z = readPitch();
  float diff = angleDiff(z, baseline);   // negative = leaning forward

  const uint8_t previousPhase = postureTiming.warningPhase();
  const PostureTiming::Update timing = postureTiming.update(now, diff < -THRESHOLD_DEG);
  if (previousPhase != postureTiming.warningPhase()) stateChanged = true;
  if (timing.episode && episodeCount == UINT16_MAX) {
    // Never wrap a counter: end the session before accepting a new episode.
    clearDetection();
    setState(STATE_ENDED);
    Serial.println("Episode counter full; session ended");
    return;
  }
  // No candidate time was credited before qualification. Add it exactly once;
  // loop() already accounts for subsequent time, including the recovery window.
  slouchMs += timing.qualifiedMs;
  if (timing.episode) {
    episodeCount++;
    Serial.printf(">>> episode %u counted\n", episodeCount);
  }
  setState(postureTiming.slouching() ? STATE_SLOUCHING : STATE_UPRIGHT);

  Serial.printf("z=%7.2f diff=%+7.2f lean=%5.1fs alert=%-3s | %-9s tracked=%lus slouch=%lus episodes=%u seq=%lu %s\n",
                z, diff, postureTiming.leanDuration(now) / 1000.0, postureTiming.slouching() ? "ON" : "off",
                STATE_NAMES[state], (unsigned long)(trackedMs / 1000),
                (unsigned long)(slouchMs / 1000), episodeCount, (unsigned long)sequence,
                bleConnected ? "BLE" : "-");
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  pinMode(CAL_BUTTON, INPUT_PULLUP);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);
  Wire.begin(21, 22);

  setupBle();

  // IMU mode: accelerometer + gyro fusion, magnetometer off
  bnoReady = bno.begin(OPERATION_MODE_IMUPLUS);
  if (!bnoReady) {
    Serial.println("No BNO055 detected. Check wiring; retrying.");
    state = STATE_SENSOR_ERROR;
  }
  delay(1000);

  lastTick = millis();
  publish();   // idle snapshot: session 0, zero counters
  Serial.println("Ready. Sit upright and press BOOT to calibrate.");
}

void loop() {
  unsigned long now = millis();

  // Credit the time since the last tick to the state we were in during it.
  unsigned long dt = now - lastTick;
  lastTick = now;
  if (state == STATE_UPRIGHT || state == STATE_SLOUCHING) trackedMs += dt;
  if (state == STATE_SLOUCHING) slouchMs += dt;

  const bool softwareCalibration = calibrationRequested.exchange(false);
  if (!bnoReady) {
    static unsigned long lastRetry = 0;
    if (now - lastRetry >= 2000) {
      lastRetry = now;
      bnoReady = bno.begin(OPERATION_MODE_IMUPLUS);
      if (bnoReady) {
        Serial.println("BNO055 ready (IMU mode)");
        if (sessionId == 0) setState(STATE_IDLE);   // mid-session: classify() resumes it
      }
    }
  } else if (softwareCalibration && state != STATE_CALIBRATING && state != STATE_ENDED) {
    startCalibration();
  } else if (digitalRead(CAL_BUTTON) == LOW) {
    while (digitalRead(CAL_BUTTON) == LOW) delay(10);   // wait for release
    startCalibration();
  } else {
    bool ok = sensorOk();
    switch (state) {
      case STATE_CALIBRATING:
        updateCalibration(now, ok);
        break;
      case STATE_UPRIGHT:
      case STATE_SLOUCHING:
      case STATE_SENSOR_ERROR:
        if (sessionId != 0) classify(now, ok);
        break;
      case STATE_IDLE: {
        static unsigned long lastPrompt = 0;
        if (now - lastPrompt >= 2000) {
          if (ok) Serial.printf("Waiting: sit upright and press BOOT to calibrate. (z=%.2f)\n", readPitch());
          lastPrompt = now;
        }
        break;
      }
      case STATE_ENDED:
        break;
    }
  }

  if (stateChanged || millis() - lastPublish >= PUBLISH_MS) publish();
  updateLed();
  delay(LOOP_DELAY_MS);
}
