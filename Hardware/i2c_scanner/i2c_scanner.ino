// I2C scanner: probes every 7-bit address and reports which ones respond.
// Wiring: SDA -> GPIO 21, SCL -> GPIO 22. The BNO055 should appear at 0x28.
#include <Wire.h>

const int SDA_PIN = 21;
const int SCL_PIN = 22;

void setup() {
  Serial.begin(115200);
  delay(1000);
  Wire.begin(SDA_PIN, SCL_PIN);
  Serial.println("\nI2C scanner starting...");
}

void loop() {
  int found = 0;
  for (uint8_t addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0) {
      Serial.printf("Found device at 0x%02X%s\n", addr,
                    addr == 0x28 ? "  <-- BNO055" : "");
      found++;
    }
  }
  if (found == 0) Serial.println("No I2C devices found. Check wiring and power.");
  Serial.println("Scan done.\n");
  delay(3000);
}
