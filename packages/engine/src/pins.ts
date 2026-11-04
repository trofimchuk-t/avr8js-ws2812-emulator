export interface PinMapping {
  port: "B" | "D";
  /** Bit number within the port register. */
  bit: number;
}

export const MIN_DATA_PIN = 2;
export const MAX_DATA_PIN = 13;

/**
 * Arduino Uno (ATmega328p) pin map for the digital pins that can drive a strip:
 * D2..D7 are PORTD bits 2..7, D8..D13 are PORTB bits 0..5. D0/D1 are the serial port.
 */
export function arduinoPinToPort(pin: number): PinMapping {
  if (!Number.isInteger(pin) || pin < MIN_DATA_PIN || pin > MAX_DATA_PIN) {
    throw new RangeError(`Data pin must be an integer from D${MIN_DATA_PIN} to D${MAX_DATA_PIN}`);
  }
  return pin < 8 ? { port: "D", bit: pin } : { port: "B", bit: pin - 8 };
}
