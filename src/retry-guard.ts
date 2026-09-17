export const IDENTICAL_UNRESOLVED_ATTEMPT_LIMIT = 11;

/** Stable serialization for JSON-like tool arguments, independent of key order. */
export function stableSerialize(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (typeof value === "undefined") return "undefined";
  if (typeof value === "bigint") return `bigint:${value.toString()}`;
  if (typeof value === "symbol") return `symbol:${String(value)}`;
  if (typeof value === "function") return `function:${String(value)}`;
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`);
  return `{${entries.join(",")}}`;
}

export function fingerprintToolAttempt(toolName: string, args: unknown): string {
  return `${toolName}\u0000${stableSerialize(args)}`;
}

/**
 * Tracks unresolved SourceRudder attempts by session and exact call fingerprint.
 * Unresolved state is deliberately retained until a reliable success or explicit
 * session cleanup, so capacity pressure cannot reset the twelfth-attempt block.
 */
export class IdenticalAttemptGuard {
  private readonly sessions = new Map<string, Map<string, number>>();

  /** Allows attempts one through eleven and rejects the twelfth unresolved attempt. */
  recordAttempt(sessionId: string, fingerprint: string): void {
    let attemptsByFingerprint = this.sessions.get(sessionId);
    if (!attemptsByFingerprint) {
      attemptsByFingerprint = new Map();
      this.sessions.set(sessionId, attemptsByFingerprint);
    }

    const attempts = attemptsByFingerprint.get(fingerprint) ?? 0;
    if (attempts >= IDENTICAL_UNRESOLVED_ATTEMPT_LIMIT) {
      throw new Error(
        "SourceRudder repeated the same unresolved attempt twelve times. Check the MCP connection or arguments, then retry with a different request.",
      );
    }

    attemptsByFingerprint.set(fingerprint, attempts + 1);
  }

  /** Compatibility name for the future before-tool-call runtime hook. */
  recordBefore(sessionId: string, fingerprint: string): void {
    this.recordAttempt(sessionId, fingerprint);
  }

  /** Clears only this session's matching successful SourceRudder call. */
  recordSuccess(sessionId: string, fingerprint: string): void {
    const attemptsByFingerprint = this.sessions.get(sessionId);
    if (!attemptsByFingerprint) return;

    attemptsByFingerprint.delete(fingerprint);
    if (attemptsByFingerprint.size === 0) this.sessions.delete(sessionId);
  }

  /** Releases all retry state for a completed or discarded session. */
  clearSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}
