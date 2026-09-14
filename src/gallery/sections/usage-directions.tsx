import { useSignal, type Signal } from "@preact/signals";
import { AgentGlyph } from "../../ui/controls/agent-glyph";
import { USAGE_AGENT_LABEL, formatTokensCompact } from "../../ui/usage/usage-format";
import { formatUsd } from "../../lib/usage-pricing";
import { PRICING_SNAPSHOT_DATE } from "../../lib/usage-pricing-snapshot";
import { dotColor } from "../../lib/process-info";
import type { UsageAgent } from "../../lib/usage-snapshot";
import { SectionHead } from "../specimen";
import {
  LOW_ALLOWANCE_PERCENT,
  RANGE_CAPTIONS,
  REVIEW_AGENTS,
  REVIEW_RANGES,
  REVIEW_STATES,
  REVIEW_WIDTHS,
  USAGE_DIRECTIONS,
  reviewCosts,
  reviewHistory,
  reviewLimits,
  type ReviewRange,
  type ReviewState,
  type ReviewWidth,
  type UsageDirection,
} from "./usage-direction-data";
import "./usage-directions.css";

interface ReviewProps {
  readonly range: Signal<ReviewRange>;
  readonly state: ReviewState;
}

function AgentName({ agent }: { readonly agent: UsageAgent }) {
  return (
    <span class="gxu-agent-name">
      <AgentGlyph agent={agent} className="gxu-logo" />
      {USAGE_AGENT_LABEL[agent]}
    </span>
  );
}

function RangePicker({ range }: Pick<ReviewProps, "range">) {
  return (
    <div class="gxu-range" role="group" aria-label="Cost period">
      {REVIEW_RANGES.map((label) => (
        <button
          key={label}
          type="button"
          aria-pressed={range.value === label}
          onClick={() => {
            range.value = label;
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function CostFigure({
  range,
  state,
  compact = false,
}: ReviewProps & { readonly compact?: boolean }) {
  const total = reviewCosts(range.value, state).reduce((sum, row) => sum + row.dollars, 0);
  return (
    <div class={`gxu-cost-figure${compact ? " gxu-cost-figure--compact" : ""}`}>
      <span class="gxu-muted">
        Estimated API cost <span class="gxu-period">· {range.value}</span>
      </span>
      <strong>{state === "No activity" ? "—" : formatUsd(total)}</strong>
      <span class="gxu-meta">API equivalent, not your subscription bill</span>
    </div>
  );
}

function CostRows({ range, state }: ReviewProps) {
  const rows = reviewCosts(range.value, state);
  const total = rows.reduce((sum, row) => sum + row.dollars, 0);
  if (state === "No activity")
    return <p class="gxu-empty">No recorded activity for this period.</p>;
  return (
    <div class="gxu-cost-rows">
      <div class="gxu-share-bar" aria-hidden="true">
        {rows.map((row) => (
          <span
            key={row.agent}
            style={{ width: `${(row.dollars / total) * 100}%`, background: dotColor(row.agent) }}
          />
        ))}
      </div>
      {rows.map((row) => (
        <div class="gxu-cost-row" key={row.agent}>
          <AgentName agent={row.agent} />
          <strong>{formatUsd(row.dollars)}</strong>
          <span class="gxu-meta">{formatTokensCompact(row.tokens)} tokens</span>
          <span class="gxu-meta">{((row.dollars / total) * 100).toFixed(1)}% of cost</span>
        </div>
      ))}
    </div>
  );
}

function PricingNote({ range, state }: ReviewProps) {
  if (state === "No activity") return null;
  return (
    <details class="gxu-pricing">
      <summary>Excludes 2 models without published prices</summary>
      <p>Partial estimate at full API rates. Pricing snapshot: {PRICING_SNAPSHOT_DATE}.</p>
      {reviewCosts(range.value, state).map((row) => (
        <p key={row.agent}>
          {USAGE_AGENT_LABEL[row.agent]} · {formatTokensCompact(row.unpriced)} tokens unpriced
        </p>
      ))}
    </details>
  );
}

function LimitMeter({ agent, state }: { readonly agent: UsageAgent; readonly state: ReviewState }) {
  if (state === "Unavailable")
    return (
      <p class="gxu-unavailable">
        Limits unavailable <span>Could not refresh. Remaining allowance is unknown.</span>
      </p>
    );
  return (
    <div class="gxu-meters">
      {reviewLimits(agent, state).map((window) => (
        <div
          class={`gxu-meter${window.remaining <= LOW_ALLOWANCE_PERCENT ? " gxu-meter--low" : ""}`}
          key={window.label}
        >
          <div class="gxu-meter-heading">
            <span>{window.label}</span>
            <strong>
              {window.remaining}% <small>remaining</small>
            </strong>
          </div>
          <meter
            min={0}
            max={100}
            value={window.remaining}
            aria-label={`${USAGE_AGENT_LABEL[agent]} ${window.label} remaining allowance`}
          >
            {window.remaining}%
          </meter>
          <span class="gxu-meta">Resets in {window.reset}</span>
        </div>
      ))}
    </div>
  );
}

function CompactLimits({ state }: Pick<ReviewProps, "state">) {
  return (
    <section class="gxu-compact-limits" aria-label="Current remaining allowance">
      <div class="gxu-section-label">
        <h3>Remaining allowance</h3>
        <span>Now</span>
      </div>
      <table class="gxu-limits-table" aria-label="Current remaining allowance and time until reset">
        <thead>
          <tr>
            <th scope="col">Agent</th>
            <th scope="col">5-hour</th>
            <th scope="col">Weekly</th>
          </tr>
        </thead>
        <tbody>
          {REVIEW_AGENTS.map((agent) => (
            <tr key={agent}>
              <th scope="row">
                <AgentName agent={agent} />
              </th>
              {reviewLimits(agent, state).map((window) => (
                <td
                  key={window.label}
                  class={
                    state !== "Unavailable" && window.remaining <= LOW_ALLOWANCE_PERCENT
                      ? "gxu-low"
                      : ""
                  }
                >
                  <strong>{state === "Unavailable" ? "—" : `${window.remaining}%`}</strong>
                  <small>{state === "Unavailable" ? "Unavailable" : window.reset}</small>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p class="gxu-meta">
        {state === "Unavailable"
          ? "Could not refresh limits. Allowance is unknown."
          : "Time below each value is time until reset."}
      </p>
    </section>
  );
}

function LimitsFirst({ range, state }: ReviewProps) {
  return (
    <>
      <section class="gxu-limit-focus">
        <div class="gxu-section-label">
          <h3>Room to work</h3>
          <span>Current limits</span>
        </div>
        <p class="gxu-intro">Your remaining allowance, at a glance.</p>
        {REVIEW_AGENTS.map((agent) => (
          <div class="gxu-agent-limits" key={agent}>
            <div class="gxu-agent-heading">
              <AgentName agent={agent} />
              {agent === "claude" && state === "Near limit" && (
                <span class="gxu-low">Running low</span>
              )}
            </div>
            <LimitMeter agent={agent} state={state} />
          </div>
        ))}
      </section>
      <section class="gxu-cost-support">
        <RangePicker range={range} />
        <CostFigure range={range} state={state} compact />
        <CostRows range={range} state={state} />
        <PricingNote range={range} state={state} />
      </section>
    </>
  );
}

function HistoryChart({ range, state }: ReviewProps) {
  const history = reviewHistory(range.value);
  const max = Math.max(...history.map((bucket) => bucket.claude + bucket.codex));
  return (
    <section class="gxu-history" aria-label="Estimated API cost over time">
      <div class="gxu-section-label">
        <h3>Cost over time</h3>
        <span>USD</span>
      </div>
      {state === "No activity" ? (
        <p class="gxu-empty">No recorded activity to chart.</p>
      ) : (
        <div
          class="gxu-chart"
          role="img"
          aria-label={`Stacked cost chart. ${RANGE_CAPTIONS[range.value]}. Exact values in chart data below.`}
        >
          {history.map((bucket) => (
            <div class="gxu-chart-column" key={bucket.label}>
              <div class="gxu-chart-stack" aria-hidden="true">
                <span
                  style={{
                    height: `${(bucket.codex / max) * 100}%`,
                    background: dotColor("codex"),
                  }}
                />
                <span
                  style={{
                    height: `${(bucket.claude / max) * 100}%`,
                    background: dotColor("claude"),
                  }}
                />
              </div>
              <span class="gxu-meta">{bucket.label}</span>
            </div>
          ))}
        </div>
      )}
      <p class="gxu-meta">{RANGE_CAPTIONS[range.value]}</p>
      <div class="gxu-chart-legend">
        {REVIEW_AGENTS.map((agent) => (
          <span key={agent}>
            <i aria-hidden="true" style={{ background: dotColor(agent) }} />
            {USAGE_AGENT_LABEL[agent]}
          </span>
        ))}
      </div>
      {state !== "No activity" && (
        <details class="gxu-chart-data">
          <summary>Chart data</summary>
          <table>
            <caption>Estimated API cost in USD</caption>
            <thead>
              <tr>
                <th scope="col">Period</th>
                <th scope="col">Claude Code</th>
                <th scope="col">Codex</th>
              </tr>
            </thead>
            <tbody>
              {history.map((bucket) => (
                <tr key={bucket.label}>
                  <th scope="row">{bucket.label}</th>
                  <td>{formatUsd(bucket.claude)}</td>
                  <td>{formatUsd(bucket.codex)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </section>
  );
}

function DirectionContent({
  direction,
  ...props
}: ReviewProps & { readonly direction: UsageDirection }) {
  if (props.state === "Loading")
    return (
      <div class="gxu-loading" role="status">
        <strong>Reading your usage…</strong>
        <p>Loading recent activity and agent limits.</p>
      </div>
    );
  if (direction === "limits") return <LimitsFirst {...props} />;
  return (
    <>
      {direction === "trend" && <CompactLimits state={props.state} />}
      <section class="gxu-cost-focus">
        <RangePicker range={props.range} />
        {direction === "trend" && <HistoryChart {...props} />}
        <CostFigure {...props} compact={direction === "trend"} />
        <CostRows {...props} />
        <PricingNote {...props} />
      </section>
      {direction !== "trend" && <CompactLimits state={props.state} />}
    </>
  );
}

export function UsageDirectionsSection() {
  const range = useSignal<ReviewRange>("All");
  const state = useSignal<ReviewState>("Normal");
  const width = useSignal<ReviewWidth>(360);
  return (
    <>
      <SectionHead
        title="Usage directions"
        blurb="Three gallery-only proposals. All figures are illustrative, not live account data. Period changes stay synchronized; current limits are independent of the cost period. Use the gallery theme picker to compare light and dark."
      />
      <div class="gxu-controls">
        <div role="group" aria-label="Specimen width">
          <span>Width</span>
          {REVIEW_WIDTHS.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={width.value === value}
              onClick={() => {
                width.value = value;
              }}
            >
              {value}px
            </button>
          ))}
        </div>
        <div role="group" aria-label="Sample state">
          <span>State</span>
          {REVIEW_STATES.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={state.value === value}
              onClick={() => {
                state.value = value;
              }}
            >
              {value}
            </button>
          ))}
        </div>
      </div>
      <div class="gxu-comparison" style={{ "--gxu-preview-width": `${width.value}px` }}>
        {USAGE_DIRECTIONS.map((direction) => (
          <section class="gxu-candidate" key={direction.id}>
            <header class="gxu-candidate-heading">
              <span>{direction.letter}</span>
              <div>
                <h2>{direction.title}</h2>
                <p>{direction.note}</p>
              </div>
            </header>
            <article
              class={`gxu-panel gxu-panel--${direction.id}`}
              aria-label={`${direction.letter}: ${direction.title}`}
            >
              <header class="gxu-panel-heading">
                <h2>Usage</h2>
                <span>Overview</span>
              </header>
              <DirectionContent direction={direction.id} range={range} state={state.value} />
            </article>
          </section>
        ))}
      </div>
    </>
  );
}
