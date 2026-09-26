// Slouch detector: press BOOT while sitting upright to set the "upright" pitch (z),
// then flags SLOUCHING when you lean forward past a threshold for too long.
// Leaning back never counts as slouching.
// Wiring: BNO055 on I2C, SDA = GPIO 21, SCL = GPIO 22, address 0x28.
#include <Wire.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BNO055.h>

// --- Tuning ---
const float THRESHOLD_DEG = 10.0;          // how far forward you can lean before it counts
const unsigned long SLOUCH_MS = 10000;     // time leaning forward before SLOUCHING
const unsigned long RECOVER_MS = 3000;     // time back upright before OK again
const unsigned long SETTLE_MS = 1000;      // pause after pressing BOOT so you can get still
const unsigned long CALIBRATE_MS = 3000;   // how long to average the baseline
const uint16_t LOOP_DELAY_MS = 100;

const int CAL_BUTTON = 0;  // the BOOT button on the dev board; reads LOW when pressed

Adafruit_BNO055 bno = Adafruit_BNO055(55, 0x28, &Wire);

bool calibrated = false;
float baseline = 0;
bool outOfBand = false;
unsigned long outStart = 0;   // millis() when you first leaned too far forward
bool recovering = false;
unsigned long inStart = 0;    // millis() when you came back upright while slouching
bool slouching = false;

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

void calibrate() {
  Serial.println("Calibrating: sit upright and hold still...");
  delay(SETTLE_MS);

  // Average as offsets from the first reading so values near +/-180 don't cancel out.
  float first = readPitch();
  float sum = 0;
  int count = 0;
  unsigned long start = millis();
  while (millis() - start < CALIBRATE_MS) {
    sum += angleDiff(readPitch(), first);
    count++;
    delay(50);
  }
  baseline = first + sum / count;

  // Start fresh against the new baseline
  outOfBand = false;
  recovering = false;
  slouching = false;
  calibrated = true;

  Serial.printf("Upright baseline: %.2f deg (%d samples)\n", baseline, count);
  Serial.printf("Slouching = below %.2f deg for %lu s. Press BOOT anytime to recalibrate.\n",
                baseline - THRESHOLD_DEG, SLOUCH_MS / 1000);
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  pinMode(CAL_BUTTON, INPUT_PULLUP);
  Wire.begin(21, 22);

  // IMU mode: accelerometer + gyro fusion, magnetometer off
  if (!bno.begin(OPERATION_MODE_IMUPLUS)) {
    Serial.println("No BNO055 detected. Check wiring or I2C address.");
    while (1) delay(10);
  }
  delay(1000);

  Serial.println("Ready. Sit upright and press BOOT to calibrate.");
}

void loop() {
  if (digitalRead(CAL_BUTTON) == LOW) {
    while (digitalRead(CAL_BUTTON) == LOW) delay(10);   // wait for release
    calibrate();
    return;
  }

  if (!calibrated) {
    static unsigned long lastPrompt = 0;
    if (millis() - lastPrompt >= 2000) {
      Serial.println("Waiting: sit upright and press BOOT to calibrate.");
      lastPrompt = millis();
    }
    delay(LOOP_DELAY_MS);
    return;
  }

  float z = readPitch();
  float diff = angleDiff(z, baseline);   // negative = leaning forward
  unsigned long now = millis();

  if (diff < -THRESHOLD_DEG) {
    recovering = false;   // leaned forward again, restart the recovery timer
    if (!outOfBand) {
      outOfBand = true;
      outStart = now;
    }
    if (!slouching && now - outStart >= SLOUCH_MS) {
      slouching = true;
      Serial.println(">>> SLOUCHING");
    }
  } else {
    if (outOfBand && !slouching) Serial.println(">>> OK (timer reset)");
    outOfBand = false;
    if (slouching) {
      // Must stay upright (or leaning back) for RECOVER_MS before clearing SLOUCHING
      if (!recovering) {
        recovering = true;
        inStart = now;
      }
      if (now - inStart >= RECOVER_MS) {
        slouching = false;
        recovering = false;
        Serial.println(">>> OK (back upright)");
      }
    }
  }

  float outSec = outOfBand ? (now - outStart) / 1000.0 : 0;
  float backSec = recovering ? (now - inStart) / 1000.0 : 0;
  Serial.printf("z=%7.2f  diff=%+7.2f  out=%5.1fs  back=%3.1fs  state=%s\n",
                z, diff, outSec, backSec, slouching ? "SLOUCHING" : "OK");

  delay(LOOP_DELAY_MS);
}
