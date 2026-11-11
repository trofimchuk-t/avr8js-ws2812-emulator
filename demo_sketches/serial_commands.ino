// Serial commands: type a command in the Serial tab and press Enter.
// Works with any line ending (LF, CR or CRLF).
#include <FastLED.h>

#define LED_PIN 6
#define NUM_LEDS 16

CRGB leds[NUM_LEDS];
String line;
bool rainbow = false;
uint8_t hue = 0;

void help() {
  Serial.println(F("Commands: red, green, blue, off, rainbow, brightness <0-255>, echo <text>, help"));
}

void fill(const CRGB &color) {
  rainbow = false;
  fill_solid(leds, NUM_LEDS, color);
}

void handle(String cmd) {
  cmd.trim();
  if (cmd == "red") fill(CRGB::Red);
  else if (cmd == "green") fill(CRGB::Green);
  else if (cmd == "blue") fill(CRGB::Blue);
  else if (cmd == "off") fill(CRGB::Black);
  else if (cmd == "rainbow") rainbow = true;
  else if (cmd.startsWith("brightness ")) FastLED.setBrightness(cmd.substring(11).toInt());
  else if (cmd.startsWith("echo ")) {
    Serial.println(cmd.substring(5));
    return;
  } else if (cmd == "help") {
    help();
    return;
  } else {
    Serial.print(F("Unknown command: "));
    Serial.println(cmd);
    return;
  }
  Serial.print(F("OK "));
  Serial.println(cmd);
}

void setup() {
  Serial.begin(115200);
  FastLED.addLeds<WS2812B, LED_PIN, GRB>(leds, NUM_LEDS);
  FastLED.setBrightness(96);
  help();
}

void loop() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n' || c == '\r') {
      if (line.length()) handle(line);
      line = "";
    } else if (line.length() < 64) {
      line += c;
    }
  }
  EVERY_N_MILLISECONDS(20) {
    if (rainbow) fill_rainbow(leds, NUM_LEDS, hue++, 255 / NUM_LEDS);
    FastLED.show();
  }
}
