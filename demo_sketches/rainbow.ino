#include "FastLED.h"

#define DATA_PIN 3                                     // Data pin to connect to the strip.
#define NUM_LEDS 50                                    // Number of LED's.

uint8_t max_bright = 255;                              // Overall brightness definition. It can be changed on the fly.
struct CRGB leds[NUM_LEDS];                            // Initialize our LED array.

#define RAINBOW_TIMER_PERIOD 50                        // Freq of rainbow drawing
unsigned long rainbow_timer;
bool auto_change_direction = true;                     // Whether automatically change running direction of rainbow
#define RAINBOW_DIRECTION_CHANGE_TIMER_PERIOD 200      // Freq of changing direction
byte rainbow_direction_change_timer;

float rainbow_step;                                    // "Width" of rainbow wave (less value - wider width) - "full color ring"
byte hue = 0;                                          // Global hue variable as start color
byte hue_change_delta;                                 // Speed of rainbow "running" (less value - slower speed)
byte saturation;
byte brightness;

void setup() {
  Serial.begin(115200);                                // Initialize serial port for debugging.
  FastLED.addLeds<NEOPIXEL, DATA_PIN>(leds, NUM_LEDS);
  reset_values();
  Serial.println("FastLED initialized.");
}

void loop() {
  if (millis() - rainbow_timer > RAINBOW_TIMER_PERIOD)
  {
    rainbow_timer = millis();
    draw_rainbow();
  }
}

void reset_values()
{
    FastLED.setBrightness(max_bright);
    saturation = 255;
    brightness = 255;
    hue_change_delta = 2;
    rainbow_step = 100.0 / NUM_LEDS;

    LEDS.showColor(CRGB(255, 0, 0));
    delay(200);
    LEDS.showColor(CRGB(0, 255, 0));
    delay(200);
    LEDS.showColor(CRGB(0, 0, 255));
    delay(200);
    LEDS.showColor(CRGB(0, 0, 0));
}

void draw_rainbow()
{
    // calculate start color
    hue += hue_change_delta;

    // store start color into temp variable
    float hue_temp = hue;

    for (int i = 0; i < NUM_LEDS; i++)
    {
        leds[i] = CHSV(hue_temp, saturation, brightness);

        // change each LED hue value
        hue_temp += rainbow_step;

        if (hue_temp > 255)
        {
            hue_temp = hue_temp - 255;
        }

        if (hue_temp < 0)
        {
            hue_temp = hue_temp + 255;
        }
    }

    FastLED.show();
    FastLED.clear();

    if (auto_change_direction)
    {
        update_rainbow_direction();
    }
}

void update_rainbow_direction()
{
    rainbow_direction_change_timer++;

    if (rainbow_direction_change_timer > RAINBOW_DIRECTION_CHANGE_TIMER_PERIOD)
    {
        rainbow_direction_change_timer = 0;
        hue_change_delta = -hue_change_delta;
    }
}