import type { ChimeraEvent, ChimeraEventType, ChimeraEventHandler } from './types.js';

export class ChimeraEventBus {
  private _events: ChimeraEvent<any>[] = [];
  private _handlers = new Map<ChimeraEventType, ChimeraEventHandler<any>[]>();
  private readonly _maxEvents = 1000;

  subscribe<T extends ChimeraEventType>(type: T, h: ChimeraEventHandler<any>): () => void {
    if (!this._handlers.has(type)) {
      this._handlers.set(type, []);
    }
    this._handlers.get(type)!.push(h);

    // Return unsubscribe function
    return () => {
      const handlers = this._handlers.get(type);
      if (handlers) {
        const index = handlers.indexOf(h);
        if (index > -1) {
          handlers.splice(index, 1);
        }
      }
    };
  }

  publish<T>(evt: ChimeraEvent<T>): void {
    // Store in history
    this._events.push(evt);
    if (this._events.length > this._maxEvents) {
      this._events.shift();
    }

    // Call handlers synchronously
    const handlers = this._handlers.get(evt.type);
    if (handlers) {
      for (const handler of handlers) {
        handler(evt);
      }
    }
  }

  history(limit?: number): ChimeraEvent<any>[] {
    if (limit === undefined) {
      return [...this._events];
    }
    return this._events.slice(-limit);
  }
}