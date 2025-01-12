// https://github.com/atuline/FastLED-Demos/blob/master/rainbow_beat/rainbow_beat.ino

/* lightnings
 *
 * By: Daniel Wilson
 *
 * Modified by: Andrew Tuline
 *
 * Date: January, 2017
 *
 * Lightnings is a program that lets you make an LED strip look like a 1D cloud of lightning.
 * I wouldn't use this code in conjunction with any controls because it uses those nasty blocking delays which I haven't bothered to remove.
 *
 */

#include "FastLED.h"

#if FASTLED_VERSION < 3001000
#error "Requires FastLED 3.1 or later; check github for latest code."
#endif

// Fixed definitions cannot change on the fly.
#define DATA_PIN 3                                            // Data pin to connect to the strip.
#define NUM_LEDS 50                                           // Number of LED's.

// Global variables can be changed on the fly.
uint8_t max_bright = 255;                                     // Overall brightness definition. It can be changed on the fly.

struct CRGB leds[NUM_LEDS];                                   // Initialize our LED array.


void setup() {
  Serial.begin(115200);                                        // Initialize serial port for debugging.
  FastLED.addLeds<NEOPIXEL, DATA_PIN>(leds, NUM_LEDS);
  FastLED.setBrightness(max_bright);
}

void loop() {
  rainbow_beat();
  FastLED.show();
}

void rainbow_beat() { 
  uint8_t beatA = beatsin8(17, 0, 255);                        // Starting hue
  uint8_t beatB = beatsin8(13, 0, 255);
  fill_rainbow(leds, NUM_LEDS, (beatA+beatB)/2, 8);            // Use FastLED's fill_rainbow routine.

}
