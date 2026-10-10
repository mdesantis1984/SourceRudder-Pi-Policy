import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

import {
  POLICY_GUIDANCE,
  classifyToolCall,
  injectPolicyGuidance,
} from "./policy.js";
import { IdenticalAttemptGuard, fingerprintToolAttempt } from "./retry-guard.js";
import { OneShotConsent, type ConsentDenialCode, type ConsentStage } from "./one-shot-consent.js";

interface PendingSourceRudderCall {
  sessionId: string;
  toolName: string;
  fingerprint: string;
}

function pendingCallKey(sessionId: string, toolCallId: string): string {
  return `${sessionId}\u0000${toolCallId}`;
}

function appendPolicyGuidance(systemPrompt: string): string {
  const withoutExtensionSeparator = systemPrompt
    .split(`\n\n${POLICY_GUIDANCE}`)
    .join("");
  const preservedSystemPrompt = injectPolicyGuidance([
    withoutExtensionSeparator,
  ]).slice(0, -1).join("");

  return preservedSystemPrompt.length === 0
    ? POLICY_GUIDANCE
    : `${preservedSystemPrompt}\n\n${POLICY_GUIDANCE}`;
}

/**
 * Pi extension entry point. It enforces the policy only at documented Pi tool
 * hooks, so calls from agents and skills are covered when Pi exposes them.
 */
export default function sourceRudderPolicyExtension(pi: ExtensionAPI): void {
  const consent = new OneShotConsent();
  const attemptGuard = new IdenticalAttemptGuard();
  const pendingSourceRudderCalls = new Map<string, PendingSourceRudderCall>();

  const sessionIdFor = (ctx: ExtensionContext): string =>
    ctx.sessionManager.getSessionId();

  const clearSession = (sessionId: string): void => {
    attemptGuard.clearSession(sessionId);
    for (const [key, pendingCall] of pendingSourceRudderCalls) {
      if (pendingCall.sessionId === sessionId) {
        pendingSourceRudderCalls.delete(key);
      }
    }
  };

  pi.on("before_agent_start", (event) => ({
    systemPrompt: appendPolicyGuidance(event.systemPrompt),
  }));

  pi.on("tool_call", async (event, ctx) => {
    const decision = classifyToolCall(event.toolName, event.input);
    if (!decision.allowed) {
      // Invocation-local observation: parallel calls cannot borrow a last-result code.
      let denial: ConsentDenialCode = "context_error";
      const stages: ConsentStage[] = [];
      if (await consent.request(event, ctx, decision.reason, code => { denial = code; }, stage => { stages.push(stage); })) return;
      return { block: true, reason: `${decision.reason} [one_shot_stages=${stages.join(",") || "none"}] [one_shot_denial=${denial}]` };
    }
    if (decision.classification !== "sourcerudder") return;

    const sessionId = sessionIdFor(ctx);
    const pendingKey = pendingCallKey(sessionId, event.toolCallId);
    if (pendingSourceRudderCalls.has(pendingKey)) {
      return {
        block: true,
        reason:
          "SourceRudder Policy blocked a duplicate pending tool-call identifier for this session. [policy_denial=duplicate_pending]",
      };
    }

    const fingerprint = fingerprintToolAttempt(event.toolName, event.input);
    try {
      attemptGuard.recordBefore(sessionId, fingerprint);
    } catch {
      return {
        block: true,
        reason:
          "SourceRudder repeated the same unresolved attempt twelve times. Check the MCP connection or arguments, then retry with a different request. [policy_denial=retry_guard]",
      };
    }

    pendingSourceRudderCalls.set(pendingKey, {
      sessionId,
      toolName: event.toolName,
      fingerprint,
    });
  });

  pi.on("tool_result", (event, ctx) => {
    consent.outcome(event, ctx);
    const sessionId = sessionIdFor(ctx);
    const key = pendingCallKey(sessionId, event.toolCallId);
    const pendingCall = pendingSourceRudderCalls.get(key);

    if (
      !pendingCall ||
      pendingCall.sessionId !== sessionId ||
      event.isError ||
      pendingCall.toolName !== event.toolName ||
      pendingCall.fingerprint !== fingerprintToolAttempt(event.toolName, event.input)
    ) {
      return;
    }

    attemptGuard.recordSuccess(pendingCall.sessionId, pendingCall.fingerprint);
    pendingSourceRudderCalls.delete(key);
  });

  pi.on("session_shutdown", (_event, ctx) => {
    consent.revoke();
    clearSession(sessionIdFor(ctx));
  });
  pi.on("session_start", (_event, ctx) => { consent.activate(ctx); });
  pi.on("session_before_switch", () => { consent.revoke(); });
  pi.on("session_before_fork", () => { consent.revoke(); });
  pi.on("session_before_tree", () => { consent.revoke(); });
  pi.on("session_tree", (_event, ctx) => { consent.activate(ctx); });
  pi.on("session_before_compact", () => { consent.revoke(); });
  pi.on("session_compact", (_event, ctx) => { consent.activate(ctx); });
}
