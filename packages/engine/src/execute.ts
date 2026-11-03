import {
  avrInstruction,
  AVRTimer,
  CPU,
  timer0Config,
  AVRIOPort,
  portBConfig,
  portCConfig,
  portDConfig,
  AVRUSART,
  usart0Config,
} from "avr8js";
import { loadHex } from "./intelhex.ts";

// ATmega328p params
const FLASH = 0x8000;

export const CPU_HZ = 16e6;

/** Low-level ATmega328p wiring at 16 MHz. Has no event loop of its own; see `Simulation`. */
export class AVRRunner {
  readonly program = new Uint16Array(FLASH);
  readonly cpu: CPU;
  readonly timer: AVRTimer;
  readonly portB: AVRIOPort;
  readonly portC: AVRIOPort;
  readonly portD: AVRIOPort;
  readonly usart: AVRUSART;

  readonly MHZ = CPU_HZ;

  constructor(hex: string) {
    loadHex(hex, new Uint8Array(this.program.buffer));
    this.cpu = new CPU(this.program);
    this.timer = new AVRTimer(this.cpu, timer0Config);
    this.portB = new AVRIOPort(this.cpu, portBConfig);
    this.portC = new AVRIOPort(this.cpu, portCConfig);
    this.portD = new AVRIOPort(this.cpu, portDConfig);
    this.usart = new AVRUSART(this.cpu, usart0Config, this.MHZ);
  }

  /** Executes one instruction. */
  step() {
    avrInstruction(this.cpu);
    this.cpu.tick();
  }

  /** Executes instructions until the CPU has reached `targetCycles` (it may overshoot slightly). */
  runUntil(targetCycles: number) {
    const cpu = this.cpu;
    while (cpu.cycles < targetCycles) {
      avrInstruction(cpu);
      cpu.tick();
    }
  }
}
