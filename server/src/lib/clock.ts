export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

/** Deterministic clock for tests. */
export class FakeClock implements Clock {
  constructor(private t: number) {}
  now() {
    return new Date(this.t);
  }
  set(d: Date | string) {
    this.t = new Date(d).getTime();
  }
  advance(ms: number) {
    this.t += ms;
  }
}
