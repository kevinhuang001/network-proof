/** Bounded, ephemeral service-worker diagnostics; no payloads or secrets are recorded. */
export interface Decision {
  at: number;
  method: string;
  origin: string;
  outcome: string;
}

export class DecisionLog {
  private readonly entries: Decision[] = [];
  constructor(private readonly limit = 40) {
    if (!Number.isInteger(limit) || limit < 1) throw new Error('limit must be positive');
  }
  record(method: string, origin: string, outcome: string, at = Date.now()): void {
    this.entries.unshift({ at, method, origin, outcome });
    if (this.entries.length > this.limit) this.entries.length = this.limit;
  }
  list(): Decision[] {
    return this.entries.map((entry) => ({ ...entry }));
  }
}
