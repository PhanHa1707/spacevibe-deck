import { EMPTY_COUNTERS, type UsageBucket } from "../../lib/usage-snapshot";
import { LIMIT_MAX_AGE_MS, type AgentLimitsSnapshot } from "../../lib/agent-limits";
import type { AgentLimitsView } from "../../ui/usage/use-agent-limits";

// Illustrative canonical fixtures, fixed local clock; no account reads or scaling.
export const REVIEW_NOW = new Date(2026, 8, 14, 14, 0).getTime();
export const REVIEW_WIDTHS = [360, 440, 680] as const;
export const REVIEW_STATES = [
  "Normal",
  "Near limit",
  "Unavailable",
  "No activity",
  "Loading",
  "Partial unpriced",
  "Wholly unpriced",
  "Expired",
  "Nonstandard window",
  "Valid zero",
  "Token error",
  "Future reading",
  "Unsupported",
] as const;
export type ReviewState = (typeof REVIEW_STATES)[number];
export type ReviewWidth = (typeof REVIEW_WIDTHS)[number];
const MINUTE_MS = 60_000;

export function reviewBuckets(state: ReviewState): readonly UsageBucket[] {
  if (state === "No activity" || state === "Loading") return [];
  return Array.from({ length: 7 }, () => [0, 7, 13, 14]).flatMap((days, month) =>
    days.flatMap((day, index) =>
      (["claude", "codex"] as const).map((agent) => ({
        bucketStartMs: new Date(2026, month + 2, day || 1, index === 3 ? 12 : 4).getTime(),
        agent,
        model:
          state === "Wholly unpriced" || (state === "Partial unpriced" && index === 2)
            ? "unpriced-example"
            : agent === "claude"
              ? "claude-opus-4-5-20251101"
              : "gpt-5",
        counters:
          state === "Valid zero"
            ? EMPTY_COUNTERS
            : {
                ...EMPTY_COUNTERS,
                inputUncached: (month + 1) * (index + 1) * 1_000_000,
                output: agent === "claude" ? 200_000 : 100_000,
              },
      })),
    ),
  );
}

export function reviewLimits(state: ReviewState): AgentLimitsView {
  const snapshot: AgentLimitsSnapshot = (["claude", "codex"] as const).map((agent) => ({
    agent,
    state: state === "Unavailable" ? "error" : "ready",
    observedAtMs:
      state === "Expired"
        ? REVIEW_NOW - LIMIT_MAX_AGE_MS - 1
        : state === "Future reading"
          ? REVIEW_NOW + MINUTE_MS
          : REVIEW_NOW,
    windows: [300, state === "Nonstandard window" ? 1440 : 10080].map((durationMinutes, index) => ({
      durationMinutes,
      usedPercent:
        state === "Valid zero"
          ? 100
          : state === "Near limit"
            ? 92
            : agent === "claude"
              ? [32, 58][index]
              : [16, 39][index],
      resetsAtMs: REVIEW_NOW + (index ? 4680 : 134) * MINUTE_MS,
    })),
  }));
  return {
    snapshot: state === "Loading" ? [] : snapshot,
    nowMs: REVIEW_NOW,
    available: state !== "Unsupported",
    loading: state === "Loading",
    error: state === "Unavailable",
  };
}
