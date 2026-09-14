import type { UsageAgent } from "../../lib/usage-snapshot";

// Illustrative review data only. No account reads, polling, or persisted state.
export const USAGE_DIRECTIONS = [
  {
    id: "cost",
    letter: "A",
    title: "Cost at a glance",
    note: "A quieter evolution of the current overview. Cost leads; limits stay compact.",
  },
  {
    id: "limits",
    letter: "B",
    title: "Room to work",
    note: "Remaining allowance and reset times lead. Cost becomes the supporting detail.",
  },
  {
    id: "trend",
    letter: "C",
    title: "Usage over time",
    note: "Selected direction. Remaining allowance comes first, followed by the timeline and cost breakdown.",
  },
] as const;
export type UsageDirection = (typeof USAGE_DIRECTIONS)[number]["id"];
export const REVIEW_STATES = [
  "Normal",
  "Near limit",
  "Unavailable",
  "No activity",
  "Loading",
] as const;
export type ReviewState = (typeof REVIEW_STATES)[number];
export const REVIEW_WIDTHS = [360, 440, 680] as const;
export type ReviewWidth = (typeof REVIEW_WIDTHS)[number];
export const REVIEW_RANGES = ["Today", "7 days", "30 days", "All"] as const;
export type ReviewRange = (typeof REVIEW_RANGES)[number];
export const LOW_ALLOWANCE_PERCENT = 15;
export const REVIEW_AGENTS: readonly UsageAgent[] = ["claude", "codex"];

export const AGENT_COST_CENTS: Readonly<Record<ReviewRange, readonly [number, number]>> = {
  Today: [4218, 1836],
  "7 days": [31248, 15862],
  "30 days": [124682, 59234],
  All: [706964, 334075],
};
export const HISTORY_LABELS: Readonly<Record<ReviewRange, readonly string[]>> = {
  Today: ["00h", "04h", "08h", "12h"],
  "7 days": ["08", "09", "10", "11", "12", "13", "14"],
  "30 days": ["Aug 16", "21", "26", "31", "Sep 05", "10", "14"],
  All: ["Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep"],
};
export const RANGE_CAPTIONS: Readonly<Record<ReviewRange, string>> = {
  Today: "September 14, 2026 · 4-hour totals",
  "7 days": "September 8–14, 2026 · daily totals",
  "30 days": "August 16–September 14, 2026 · grouped totals",
  All: "March–September 2026 · monthly totals",
};
const HISTORY_WEIGHTS: Readonly<Record<UsageAgent, readonly number[]>> = {
  claude: [4, 7, 5, 9, 6, 11, 8],
  codex: [2, 3, 6, 3, 7, 5, 8],
};
const TOKEN_TOTALS = { claude: 10_400_000_000, codex: 5_000_000_000 } as const;
const UNPRICED_TOTALS = { claude: 847_800_000, codex: 651_600_000 } as const;

export function reviewCosts(range: ReviewRange, state: ReviewState) {
  return REVIEW_AGENTS.map((agent, index) => {
    const cents = AGENT_COST_CENTS[range][index];
    const fraction = cents / AGENT_COST_CENTS.All[index];
    return {
      agent,
      dollars: state === "No activity" ? 0 : cents / 100,
      tokens: state === "No activity" ? 0 : Math.round(TOKEN_TOTALS[agent] * fraction),
      unpriced: state === "No activity" ? 0 : Math.round(UNPRICED_TOTALS[agent] * fraction),
    };
  });
}

export function reviewHistory(range: ReviewRange) {
  const labels = HISTORY_LABELS[range];
  const allocations = REVIEW_AGENTS.map((agent, agentIndex) => {
    const weights = HISTORY_WEIGHTS[agent].slice(0, labels.length);
    const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
    const cents = AGENT_COST_CENTS[range][agentIndex];
    // Differences between rounded cumulative totals preserve the exact cents.
    return weights.map((weight, index) => {
      const before = weights.slice(0, index).reduce((sum, value) => sum + value, 0);
      return (
        (Math.round(((before + weight) / weightTotal) * cents) -
          Math.round((before / weightTotal) * cents)) /
        100
      );
    });
  });
  return labels.map((label, index) => ({
    label,
    claude: allocations[0][index],
    codex: allocations[1][index],
  }));
}

export function reviewLimits(agent: UsageAgent, state: ReviewState) {
  const remaining = agent === "claude" ? [68, 42] : [84, 61];
  const constrained = agent === "claude" && state === "Near limit";
  return [
    { label: "5-hour", remaining: constrained ? 8 : remaining[0], reset: "2h 14m" },
    { label: "Weekly", remaining: constrained ? 12 : remaining[1], reset: "3d 6h" },
  ];
}
