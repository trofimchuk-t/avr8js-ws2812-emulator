#include "FastLED.h"

#define DATA_PIN 9                                     // D9 is PORTB bit 1.
#define ROWS 5
#define COLS 6
#define NUM_LEDS (ROWS * COLS)                         // 30 LEDs.
#define COLOR_ORDER RGB                                // Sent on the wire as R, G, B.

CRGB leds[NUM_LEDS];

void setup() {
  Serial.begin(115200);
  FastLED.addLeds<WS2812B, DATA_PIN, COLOR_ORDER>(leds, NUM_LEDS);
  Serial.println("FastLED initialized.");
}

void loop() {
  fill_solid(leds, NUM_LEDS, CRGB::Black);
  leds[0] = CRGB(255, 0, 0);
  leds[1] = CRGB(0, 255, 0);
  leds[2] = CRGB(0, 0, 255);
  leds[NUM_LEDS - 1] = CRGB(16, 32, 64);
  FastLED.show();
  delay(100);
}
