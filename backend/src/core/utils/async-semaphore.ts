export class AsyncSemaphore {
  private inUse = 0;
  private readonly waitQueue: Array<() => void> = [];

  constructor(private readonly maxConcurrency: number) {
    if (!Number.isFinite(maxConcurrency) || maxConcurrency <= 0) {
      throw new Error("maxConcurrency must be greater than 0");
    }
  }

  async withPermit<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await task();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.inUse < this.maxConcurrency) {
      this.inUse += 1;
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.waitQueue.push(() => {
        this.inUse += 1;
        resolve();
      });
    });
  }

  private release() {
    this.inUse = Math.max(0, this.inUse - 1);
    const next = this.waitQueue.shift();
    if (next) next();
  }

  getStats() {
    return {
      maxConcurrency: this.maxConcurrency,
      inUse: this.inUse,
      queued: this.waitQueue.length,
    };
  }
}
