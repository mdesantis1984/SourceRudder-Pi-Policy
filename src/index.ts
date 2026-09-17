import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

import {
  POLICY_GUIDANCE,
  classifyToolCall,
  injectPolicyGuidance,
} from "./policy.js";
import { IdenticalAttemptGuard, fingerprintToolAttempt } from "./retry-guard.js";

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

  pi.on("tool_call", (event, ctx) => {
    const decision = classifyToolCall(event.toolName, event.input);
    if (!decision.allowed) {
      return { block: true, reason: decision.reason };
    }
    if (decision.classification !== "sourcerudder") return;

    const sessionId = sessionIdFor(ctx);
    const pendingKey = pendingCallKey(sessionId, event.toolCallId);
    if (pendingSourceRudderCalls.has(pendingKey)) {
      return {
        block: true,
        reason:
          "SourceRudder Policy blocked a duplicate pending tool-call identifier for this session.",
      };
    }

    const fingerprint = fingerprintToolAttempt(event.toolName, event.input);
    try {
      attemptGuard.recordBefore(sessionId, fingerprint);
    } catch (error) {
      return {
        block: true,
        reason:
          error instanceof Error
            ? error.message
            : "SourceRudder Policy blocked a repeated unresolved research attempt.",
      };
    }

    pendingSourceRudderCalls.set(pendingKey, {
      sessionId,
      toolName: event.toolName,
      fingerprint,
    });
  });

  pi.on("tool_result", (event, ctx) => {
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
    clearSession(sessionIdFor(ctx));
  });
}
