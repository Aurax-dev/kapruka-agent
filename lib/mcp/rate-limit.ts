export class TokenBucket {
  private tokens: number;
  private last = Date.now();
  private queue: (() => void)[] = [];

  constructor(
    private capacity: number,
    private refillPerSec: number,
  ) {
    this.tokens = capacity;
  }

  private refill() {
    const now = Date.now();
    const gained = ((now - this.last) / 1000) * this.refillPerSec;
    if (gained > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + gained);
      this.last = now;
    }
  }

  private pump() {
    this.refill();
    while (this.queue.length && this.tokens >= 1) {
      this.tokens -= 1;
      this.queue.shift()!();
    }
    if (this.queue.length) {
      const needed = (1 - this.tokens) / this.refillPerSec;
      setTimeout(() => this.pump(), Math.max(10, needed * 1000));
    }
  }

  acquire(): Promise<void> {
    return new Promise((resolve) => {
      this.queue.push(resolve);
      this.pump();
    });
  }
}
