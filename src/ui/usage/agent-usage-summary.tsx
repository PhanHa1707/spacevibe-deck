import { AgentGlyph } from "../controls/agent-glyph";
import { EM_DASH, USAGE_AGENT_LABEL, USAGE_AGENT_ORDER } from "./usage-format";
import { useEffect, useState } from "preact/hooks";
import {
  currentLimitWindows,
  limitWindowLabel,
  LIMIT_MAX_AGE_MS,
  type AgentLimitsSnapshot,
} from "../../lib/agent-limits";
import { agentLimits, observeAgentLimits } from "../../usage/agent-limits-store";

interface AgentUsageSummaryProps {
  readonly onOpenUsage: () => void;
  readonly snapshot?: AgentLimitsSnapshot;
  readonly nowMs?: number;
}

/** The source reports usage; every displayed percentage is the remaining allowance. */
export function AgentUsageSummary({
  onOpenUsage,
  snapshot = [],
  nowMs = Date.now(),
}: AgentUsageSummaryProps) {
  return (
    <section class="agent-usage-summary" aria-label="Agent limits">
      <ul class="agent-usage-summary__rows" aria-label="Agent limits" tabIndex={0}>
        {USAGE_AGENT_ORDER.map((agent) => {
          const reading = snapshot.find((row) => row.agent === agent);
          const windows = currentLimitWindows(reading, nowMs);
          const value = windows
            .map(
              (window) =>
                `${limitWindowLabel(window.durationMinutes)} ${Math.floor(100 - window.usedPercent)}%`,
            )
            .join(" · ");
          const unavailable =
            reading?.state === "error"
              ? "Could not refresh limits"
              : reading?.windows.length
                ? "Limit data expired"
                : "Limit unavailable";
          const detail = windows.length
            ? windows
                .map(
                  (window) =>
                    `${limitWindowLabel(window.durationMinutes)}: ${Math.floor(100 - window.usedPercent)}% remaining; resets ${new Date(window.resetsAtMs).toLocaleString()}`,
                )
                .join(" · ")
            : unavailable;
          return (
            <li key={agent}>
              <button
                type="button"
                class="agent-usage-summary__agent"
                onClick={onOpenUsage}
                aria-label={`${USAGE_AGENT_LABEL[agent]}: ${detail}. Open usage details`}
                title={`${USAGE_AGENT_LABEL[agent]} · ${detail}`}
              >
                <AgentGlyph agent={agent} className="agent-usage-summary__glyph" />
                <span class="agent-usage-summary__limit" aria-hidden="true">
                  {value || EM_DASH}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Expire a reading at its boundary even when the network is idle or unavailable. */
export function RailAgentLimits({ onOpenUsage }: Pick<AgentUsageSummaryProps, "onOpenUsage">) {
  const [nowMs, setNowMs] = useState(Date.now());
  const snapshot = agentLimits.value;
  useEffect(() => observeAgentLimits(), []);
  useEffect(() => {
    const current = Date.now();
    const boundaries = snapshot
      .flatMap((row) => [
        row.observedAtMs + LIMIT_MAX_AGE_MS + 1,
        ...row.windows.map((window) => window.resetsAtMs),
      ])
      .filter((at) => at > current);
    if (!boundaries.length) return;
    const timer = setTimeout(() => setNowMs(Date.now()), Math.min(...boundaries) - current);
    return () => clearTimeout(timer);
  }, [snapshot, nowMs]);
  return (
    <AgentUsageSummary
      snapshot={snapshot}
      nowMs={Math.max(nowMs, Date.now())}
      onOpenUsage={onOpenUsage}
    />
  );
}
