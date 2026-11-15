/** First matching handler wins, same order the old module registered them. */
export class MessageDispatcher {
  constructor() {
    this.handlers = [];
  }

  register(handler) {
    this.handlers.push(handler);
  }

  async dispatch(message) {
    const handler = this.handlers.find((entry) => entry.canHandle(message));
    if (!handler) return false;
    await handler.handle(message);
    return true;
  }
}
