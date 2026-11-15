/** Drop a replay of the same game-log message. */
export class MessageDeduplicator {
  constructor(maxHistory = 50) {
    this.maxHistory = maxHistory;
    this.seen = new Set();
  }

  isProcessed(key) {
    return this.seen.has(key);
  }

  markProcessed(key) {
    this.seen.add(key);
    if (this.seen.size <= this.maxHistory) return;
    const oldest = this.seen.values().next().value;
    this.seen.delete(oldest);
  }

  clear() {
    this.seen.clear();
  }
}
