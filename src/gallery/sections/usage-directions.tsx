import { useSignal } from "@preact/signals";
import { OverviewContent } from "../../ui/usage/sections/overview-section";
import type { UsageRangeId } from "../../ui/usage/usage-ranges";
import { SectionHead } from "../specimen";
import {
  REVIEW_NOW,
  REVIEW_STATES,
  REVIEW_WIDTHS,
  reviewBuckets,
  reviewLimits,
  type ReviewState,
  type ReviewWidth,
} from "./usage-direction-data";
import "./usage-directions.css";

export function UsageDirectionsSection() {
  const range = useSignal<UsageRangeId>("all");
  const state = useSignal<ReviewState>("Normal");
  const width = useSignal<ReviewWidth>(360);
  return (
    <>
      <SectionHead
        title="Usage · selected C"
        blurb="Production Overview components with illustrative data, never live accounts. Remaining allowance leads; the selected cost period controls the timeline and accounting. Use the gallery theme picker for light and dark."
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
      <article
        class="gxu-panel"
        aria-label="Selected C production overview"
        style={{ width: `${width.value}px` }}
      >
        <div class="usage-dock__section">
          <OverviewContent
            buckets={reviewBuckets(state.value)}
            limits={reviewLimits(state.value)}
            nowMs={REVIEW_NOW}
            range={range.value}
            onRangeChange={(value) => {
              range.value = value;
            }}
            loading={state.value === "Loading"}
            stale={state.value === "Token error"}
          />
        </div>
      </article>
    </>
  );
}
