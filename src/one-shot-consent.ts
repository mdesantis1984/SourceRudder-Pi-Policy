import { randomUUID } from "node:crypto";

interface Call {
  toolName: string;
  toolCallId: string;
  parentToolCallId?: string;
  input: unknown;
}
interface Context {
  mode?: string;
  hasUI: boolean;
  cwd: string;
  signal?: AbortSignal;
  sessionManager: { getSessionId(): string };
  ui: { confirm(title: string, message: string, options: { signal: AbortSignal; timeout: number }): Promise<boolean> };
}
// Temporary observation only: no caller data or permission-bearing result.
export type ConsentDenialCode =
  | "invalid_call_id" | "replay" | "id_capacity" | "inactive"
  | "mode_missing" | "mode_untrusted" | "no_ui" | "aborted"
  | "invalid_session" | "invalid_cwd" | "invalid_tool" | "invalid_parent_id"
  | "canonical_input" | "display_capacity" | "context_error"
  | "manager_session_change" | "queue_capacity" | "context_drift"
  | "not_confirmed" | "ui_error" | "timeout" | "cancelled" | "freeze_error";
type DenialObserver = (code: ConsentDenialCode) => void;
export type ConsentStage =
  | "queue_entered" | "queue_left" | "confirm_entered" | "confirm_resolved" | "cancelled";
type StageObserver = (stage: ConsentStage) => void;
class DisplayCapacityError extends Error {}
type Status = "denied" | "consumed" | "success" | "error";
interface Evidence { request: string; status: Status }
const MAX_DISPLAY = 8192;
const MAX_IDS = 4096;
const MAX_PENDING = 8;
const TIMEOUT = 30_000;

/** Lossless JSON only: no getters, hidden fields, prototypes, sparse arrays or coercion. */
export function canonicalJson(value: unknown): string {
  const ancestors = new Set<object>();
  let nodes = 0;
  function visit(v: unknown, depth: number): string {
    if (++nodes > 4096 || depth > 32) throw new Error("JSON capacity");
    let text: string;
    if (v === null || typeof v === "boolean" || typeof v === "string") text = JSON.stringify(v);
    else if (typeof v === "number" && Number.isFinite(v) && !Object.is(v, -0)) text = JSON.stringify(v);
    else if (typeof v === "object" && v !== null) {
      if (ancestors.has(v)) throw new Error("JSON cycle");
      const array = Array.isArray(v);
      if (Object.getPrototypeOf(v) !== (array ? Array.prototype : Object.prototype)) throw new Error("JSON prototype");
      const descriptors = Object.getOwnPropertyDescriptors(v);
      if (Object.getOwnPropertySymbols(v).length) throw new Error("JSON symbols");
      const keys = Object.keys(descriptors).filter(k => !(array && k === "length"));
      for (const k of keys) {
        const d = descriptors[k]!;
        if (!("value" in d) || !d.enumerable) throw new Error("JSON property");
      }
      ancestors.add(v);
      if (array) {
        if (keys.length !== v.length || keys.some((k, i) => k !== String(i))) throw new Error("JSON array");
        text = `[${keys.map(k => visit(descriptors[k]!.value, depth + 1)).join(",")}]`;
      } else {
        text = `{${keys.sort().map(k => `${JSON.stringify(k)}:${visit(descriptors[k]!.value, depth + 1)}`).join(",")}}`;
      }
      ancestors.delete(v);
    } else throw new Error("Not JSON");
    if (text.length > MAX_DISPLAY) throw new DisplayCapacityError("JSON display capacity");
    return text;
  }
  return visit(value, 0);
}

/** Freeze the real dispatch alias, not a clone; event freeze also locks identity. */
export function freezeApprovedCall(event: Call): void {
  canonicalJson(event.input);
  function freeze(value: unknown): void {
    if (value !== null && typeof value === "object") {
      for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
        if ("value" in descriptor) freeze(descriptor.value);
      }
      Object.freeze(value);
    }
  }
  freeze(event.input);
  Object.freeze(event);
}
function escaped(text: string): string {
  return text.replace(/[\u0000-\u001f\u007f-\u009f\u061c\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g,
    c => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
}
function identity(text: unknown): text is string {
  return typeof text === "string" && text.length > 0 && text.length <= 512;
}

/** No reusable grant exists. IDs are never evicted; exhaustion denies until runtime replacement. */
export class OneShotConsent {
  private epoch = 0;
  private active = true;
  private manager: Context["sessionManager"] | undefined;
  private session: string | undefined;
  private readonly seen = new Set<string>();
  private readonly pending = new Set<AbortController>();
  private tail: Promise<unknown> = Promise.resolve();
  private readonly evidence: Evidence[] = [];
  // Transient correlation only, never persisted or exposed as audit. Frozen aliases
  // avoid storing secret-bearing hashes. Capacity is bounded by the non-evicting ID set.
  private readonly outcomes = new Map<string, { request: string; event: Call; epoch: number; session: string; cwd: string; manager: Context["sessionManager"] }>();

  audit(): readonly Evidence[] { return this.evidence.map(entry => ({ ...entry })); }
  private record(request: string, status: Status): void {
    if (this.evidence.length === 256) this.evidence.shift();
    this.evidence.push({ request, status });
  }
  revoke(): void {
    this.epoch++;
    this.active = false;
    for (const controller of this.pending) controller.abort();
    this.outcomes.clear();
    // Do NOT reset tail or seen: old UI closures and replay IDs must stay revoked.
  }
  activate(ctx?: Context): void {
    this.revoke();
    this.manager = ctx?.sessionManager;
    this.session = ctx?.sessionManager.getSessionId();
    this.active = true;
  }

  async request(event: Call, ctx: Context, reason: string, observeDenial?: DenialObserver, observeStage?: StageObserver): Promise<boolean> {
    const request = randomUUID();
    let denied = false;
    // Fixed stages, at most once each. Detach on error/decision so unresolved UI
    // closures cannot retain observers or mutate a returned denial snapshot.
    const stages = new Set<ConsentStage>();
    const stage = (value: ConsentStage): void => {
      if (denied || !observeStage || stages.has(value)) return;
      stages.add(value);
      try { observeStage(value); } catch { observeStage = undefined; }
    };
    const deny = (code: ConsentDenialCode): false => {
      if (!denied) {
        this.record(request, "denied");
        denied = true; // Set before observation; exceptions/re-entry cannot reopen this request.
        observeStage = undefined;
        const observer = observeDenial;
        observeDenial = undefined;
        try { observer?.(code); } catch { /* Observation cannot affect denial. */ }
      }
      return false;
    };
    // Reserve even rejected valid IDs, before payload/mode/queue checks. A rejected
    // attempt is not a ticket that can later be reopened with changed arguments.
    if (!identity(event.toolCallId)) return deny("invalid_call_id");
    if (this.seen.has(event.toolCallId)) return deny("replay");
    if (this.seen.size >= MAX_IDS) return deny("id_capacity");
    this.seen.add(event.toolCallId);
    let json: string;
    let session: string;
    let display: string;
    let phase: ConsentDenialCode = "context_error";
    try {
      session = ctx.sessionManager.getSessionId();
      if (!this.active) return deny("inactive");
      if (ctx.mode !== "tui") return deny(ctx.mode === undefined ? "mode_missing" : "mode_untrusted");
      if (ctx.hasUI !== true) return deny("no_ui");
      if (ctx.signal?.aborted) return deny("aborted");
      if (!identity(session)) return deny("invalid_session");
      if (!identity(ctx.cwd)) return deny("invalid_cwd");
      if (!identity(event.toolName)) return deny("invalid_tool");
      if (!identity(event.toolCallId)) return deny("invalid_call_id");
      if (event.parentToolCallId !== undefined && !identity(event.parentToolCallId)) return deny("invalid_parent_id");
      phase = "canonical_input";
      json = canonicalJson(event.input);
      phase = "context_error";
      display = escaped(`Tool: ${event.toolName}\nCall: ${event.toolCallId}\nParent: ${event.parentToolCallId ?? "none"}\nTarget/cwd: ${ctx.cwd}\nExact arguments (operation and targets included): ${json}\nBlock reason: ${reason}`);
      if (display.length > MAX_DISPLAY) return deny("display_capacity");
    } catch (error) { return deny(error instanceof DisplayCapacityError ? "display_capacity" : phase); }
    if (this.manager !== undefined && (this.manager !== ctx.sessionManager || this.session !== session)) {
      this.revoke();
      return deny("manager_session_change"); // Only a lifecycle activation can establish the replacement.
    }
    this.manager = ctx.sessionManager; this.session = session;
    if (this.pending.size >= MAX_PENDING) return deny("queue_capacity");
    const id = event.toolCallId;
    const epoch = this.epoch;
    const manager = ctx.sessionManager;
    const cwd = ctx.cwd;
    const name = event.toolName;
    const parent = event.parentToolCallId;
    const input = event.input;
    const signal = ctx.signal;
    const controller = new AbortController();
    this.pending.add(controller);
    // Deadline includes queue time. The UI timeout alone cannot protect against
    // a late true from a faulty dialog implementation.
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, TIMEOUT);
    timer.unref?.();
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    const valid = () => this.active && this.epoch === epoch && this.manager === manager &&
      this.session === session && ctx.sessionManager === manager && manager.getSessionId() === session &&
      ctx.mode === "tui" && ctx.hasUI === true && ctx.cwd === cwd && ctx.signal === signal &&
      !signal?.aborted && !controller.signal.aborted && event.toolName === name &&
      event.toolCallId === id && event.parentToolCallId === parent && event.input === input && canonicalJson(event.input) === json;
    const cancellationCode = (): ConsentDenialCode =>
      timedOut ? "timeout" : signal?.aborted ? "aborted" : "cancelled";
    const driftCode = (): ConsentDenialCode => controller.signal.aborted ? cancellationCode() : "context_drift";
    const previous = this.tail;
    const work = (async () => {
      let workPhase: ConsentDenialCode = "context_error";
      try {
        await previous;
        stage("queue_left");
        if (!valid()) return deny(driftCode());
        workPhase = "ui_error";
        // The documented UI owns dismissal. Holding the serial slot until it settles
        // prevents another overlay replacing an old dialog even during cancellation.
        stage("confirm_entered");
        const confirmed = await ctx.ui.confirm("SourceRudder contingency — ONE EXECUTION", `${display}\n\nAllow ONE EXECUTION via this alternative research route? It may contact the target/provider and disclose these arguments. No standing permission; frozen-input tools may fail. Never automatically retry.`,
          { signal: controller.signal, timeout: TIMEOUT });
        stage("confirm_resolved");
        if (confirmed !== true) return deny("not_confirmed");
        workPhase = "context_error";
        if (!valid()) return deny(driftCode());
        workPhase = "freeze_error";
        freezeApprovedCall(event);
        // Consume BEFORE returning allow; results, errors and later hook denials cannot restore it.
        this.outcomes.set(id, { request, event, epoch, session, cwd, manager });
        this.record(request, "consumed");
        return true;
      } catch { return deny(workPhase); }
      finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        this.pending.delete(controller);
      }
    })();
    this.tail = work.then(() => undefined, () => undefined);
    // Publish the serial slot before observation: a re-entrant observer must queue.
    stage("queue_entered");
    // Return a denial promptly on cancellation, but retain the serial slot until
    // the real UI settles. A broken UI cannot overlap or authorize another call.
    let onAbort!: () => void;
    const cancelled = new Promise<false>(resolve => {
      onAbort = () => { stage("cancelled"); resolve(deny(cancellationCode())); };
      if (controller.signal.aborted) onAbort();
      else controller.signal.addEventListener("abort", onAbort, { once: true });
    });
    try { return await Promise.race([work, cancelled]); }
    finally {
      observeStage = undefined;
      observeDenial = undefined;
      controller.signal.removeEventListener("abort", onAbort);
    }
  }

  outcome(event: Call & { isError: boolean }, ctx: Context): void {
    const pending = this.outcomes.get(event.toolCallId);
    if (!pending) return;
    try {
      if (pending.epoch !== this.epoch || ctx.sessionManager !== pending.manager ||
          ctx.sessionManager.getSessionId() !== pending.session || ctx.cwd !== pending.cwd ||
          event.toolName !== pending.event.toolName || event.parentToolCallId !== pending.event.parentToolCallId ||
          canonicalJson(event.input) !== canonicalJson(pending.event.input)) return;
      this.record(pending.request, event.isError ? "error" : "success");
      this.outcomes.delete(event.toolCallId);
    } catch { /* Invalid/unrelated results do not affect decisions. */ }
  }
}
