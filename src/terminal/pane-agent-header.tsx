import { effect } from "@preact/signals";
import { render } from "preact";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { CaretDown } from "@phosphor-icons/react";
import { AgentGlyph } from "../ui/controls/agent-glyph";
import { DeckIcon } from "../ui/controls/deck-icon";
import { tabViews, type PaneView } from "./tabs-store";
import { paneTails } from "./session-tail-store";
import { CLAUDE_EFFORT_PICKER_KEY, CLAUDE_EFFORT_PICKER_HINT } from "../lib/agent-effort";
import { reportChromeMessage } from "../chrome/events";
import { displayAgent } from "../ui/agent-rail-card-model";
import "./pane-agent-header.css";

interface PaneHeaderInput {
  send(data: string): Promise<boolean>;
  focus(): void;
}
const OPEN_FAILED = "Could not open Claude Code's effort picker. Try again.";

function currentPane(id: number): PaneView | undefined {
  return tabViews
    .peek()
    .flatMap((tab) => tab.panes ?? [])
    .find((pane) => pane.paneId === id);
}

export function PaneAgentHeader({
  pane,
  message,
  input,
}: {
  pane: PaneView;
  message: string;
  input: PaneHeaderInput;
}) {
  const [pending, setPending] = useState(false);
  const generation = useRef(0);
  const inFlight = useRef(false);
  useLayoutEffect(() => {
    generation.current += 1;
    inFlight.current = false;
    setPending(false);
    return () => {
      generation.current += 1;
    };
  }, [pane.paneId, pane.sessionId, pane.agent, pane.startedAt]);
  async function openEffortPicker() {
    const ownGeneration = generation.current;
    const valid = () => {
      const live = currentPane(pane.paneId);
      return (
        generation.current === ownGeneration &&
        live?.agent === "claude" &&
        live.sessionId === pane.sessionId &&
        live.startedAt === pane.startedAt &&
        live.phase !== "exited"
      );
    };
    if (inFlight.current || !valid()) return;
    inFlight.current = true;
    setPending(true);
    try {
      // Focus belongs to this click, never to a later queued-write completion.
      input.focus();
      // Open the native model/effort picker. Never submit text or clear the user's draft.
      const sent = await input.send(CLAUDE_EFFORT_PICKER_KEY);
      if (!valid()) return;
      if (!sent) reportChromeMessage(OPEN_FAILED);
    } catch (error) {
      if (valid()) {
        console.warn("Claude effort picker input failed", error);
        reportChromeMessage(OPEN_FAILED);
      }
    } finally {
      if (generation.current === ownGeneration) {
        inFlight.current = false;
        setPending(false);
      }
    }
  }
  if (!pane.agent) return null;
  const label = message.trim() || displayAgent(pane.agent);
  return (
    <div class="pane-agent-header">
      <span class="pane-agent-header__identity" title={pane.agent}>
        <AgentGlyph agent={pane.agent} className="pane-agent-header__logo" />
      </span>
      <span class="pane-agent-header__message" title={label}>
        {label}
      </span>
      {pane.agent === "claude" && (
        <div
          class="pane-agent-header__control"
          title={CLAUDE_EFFORT_PICKER_HINT}
          onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            disabled={pane.phase === "exited" || pending}
            aria-label="Change Claude Code effort"
            title={CLAUDE_EFFORT_PICKER_HINT}
            onClick={() => void openEffortPicker()}
          >
            Effort
            <DeckIcon icon={CaretDown} size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

/** Reuse the pane bar; legacy cwd nodes remain available to the drag ghost. */
export function mountPaneAgentHeader(
  id: number,
  element: HTMLElement,
  bar: HTMLElement,
  input: PaneHeaderInput,
): () => void {
  if ((globalThis as { __deckHost?: unknown }).__deckHost === undefined) return () => {};
  const host = document.createElement("div");
  host.className = "pane-agent-header-host";
  bar.append(host);
  const stop = effect(() => {
    const pane = tabViews.value
      .flatMap((tab) => tab.panes ?? [])
      .find((candidate) => candidate.paneId === id);
    const message = paneTails.value.get(id) ?? "";
    element.classList.toggle("pane--agent-header", Boolean(pane?.agent));
    render(
      pane?.agent ? <PaneAgentHeader pane={pane} message={message} input={input} /> : null,
      host,
    );
  });
  return () => {
    stop();
    render(null, host);
    host.remove();
    element.classList.remove("pane--agent-header");
  };
}
