export class QueueFullError extends Error {
  constructor() {
    super("Build queue is full");
  }
}

/** Limits concurrent tasks; extra tasks wait in a bounded queue. */
export class BuildQueue {
  private running = 0;
  private waiting: Array<() => void> = [];

  private readonly maxConcurrent: number;
  private readonly maxQueued: number;

  constructor(maxConcurrent: number, maxQueued: number) {
    this.maxConcurrent = maxConcurrent;
    this.maxQueued = maxQueued;
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.running >= this.maxConcurrent) {
      if (this.waiting.length >= this.maxQueued) throw new QueueFullError();
      // The slot is handed over directly by release(), so `running` stays accurate.
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    } else {
      this.running++;
    }
    try {
      return await task();
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.running--;
    }
  }
}
