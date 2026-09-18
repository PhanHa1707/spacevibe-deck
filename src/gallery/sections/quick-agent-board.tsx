import { AgentLaunchPage } from "../../launcher/agent-launch-page";
import { useSignal } from "@preact/signals";
import { useLayoutEffect, useRef } from "preact/hooks";
import { Columns, Plus, ArrowRight, ArrowLeft, CaretDown } from "@phosphor-icons/react";
import { AGENT_LOGOS } from "../../lib/agent-logos";
import { DeckIcon } from "../../ui/controls/deck-icon";
import { SectionHead } from "../specimen";
import "./quick-agent-board.css";

// Owner-requested layout study. All launch interactions stay in local mock state.
const AGENTS = [
  { id: "claude", name: "Claude Code", detail: "Default profile", hint: "Recently used" },
  { id: "codex", name: "Codex", detail: "Default profile", hint: "Recently used" },
  { id: "gemini", name: "Gemini", detail: "Default profile", hint: "" },
  { id: "opencode", name: "OpenCode", detail: "Default profile", hint: "" },
] as const;
type Agent = (typeof AGENTS)[number];
type Variant = "original" | "polished";
const PREVIEW_MESSAGES: Record<Agent["id"], string> = {
  claude: "Reviewing the pane layout",
  codex: "Checking launch behavior",
  gemini: "Tracing the current user flow",
  opencode: "Checking the split boundaries",
};

function AgentCard({
  agent,
  polished,
  onRun,
}: {
  agent: Agent;
  polished: boolean;
  onRun(agent: Agent): void;
}) {
  const content = (
    <>
      <span class="qab-card-top">
        <img src={AGENT_LOGOS[agent.id]} alt="" />
        {!polished && agent.hint && <span>{agent.hint}</span>}
      </span>
      <strong>{agent.name}</strong>
      {!polished && <span class="qab-profile">{agent.detail}</span>}
    </>
  );
  return polished ? (
    <button
      class="qab-card qab-card--clickable"
      aria-label={`Run ${agent.name}`}
      title={`Run ${agent.name} in a new split`}
      onClick={() => onRun(agent)}
    >
      {content}
      <span class="qab-card-add">
        <DeckIcon icon={Plus} size={16} />
      </span>
    </button>
  ) : (
    <article class={`qab-card qab-card--${agent.id}`}>
      {content}
      <button aria-label={`Run ${agent.name}`} onClick={() => onRun(agent)}>
        Run <DeckIcon icon={ArrowRight} size={14} />
      </button>
    </article>
  );
}

function AgentBoard({
  onRun,
  onClose,
  polished,
  target,
  panes,
  activePane,
  onFocusPane,
}: {
  onRun(agent: Agent): void;
  onClose(): void;
  polished: boolean;
  target: Agent;
  panes: readonly Agent[];
  activePane: number;
  onFocusPane(index: number): void;
}) {
  const backRef = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    backRef.current?.focus();
  }, []);
  if (!polished)
    return (
      <div class="qab-live-launch">
        <AgentLaunchPage
          target={{
            kind: "split",
            tabKey: 1,
            paneId: activePane + 1,
            workspacePath: "/spacevibe-deck",
          }}
          agents={AGENTS.map((agent) => ({
            id: agent.id,
            label: agent.name,
            detail: agent.detail,
            missing: false,
          }))}
          resolved
          pending={false}
          error={null}
          onBack={onClose}
          onSettings={() => {
            onClose();
          }}
          onRun={(id) => {
            const agent = AGENTS.find((item) => item.id === id);
            if (agent) onRun(agent);
          }}
        />
      </div>
    );
  return (
    <section class="qab-board" aria-label="Quick agent launcher">
      <div class="qab-board-inner">
        {polished ? (
          <header class="qab-compact-head">
            <button
              ref={backRef}
              class="qab-back"
              onClick={onClose}
              aria-label="Back to terminal"
              title="Back to terminal · Esc"
            >
              <DeckIcon icon={ArrowLeft} size={16} />
            </button>
            <h3>Agents</h3>
            <span
              class="qab-split-target"
              title={`Split right of ${target.name} · pane ${activePane + 1} · main`}
            >
              <img src={AGENT_LOGOS[target.id]} alt="" />
              {target.name}
              <DeckIcon icon={Columns} size={16} />
            </span>
          </header>
        ) : (
          <>
            <button ref={backRef} class="qab-back" onClick={onClose}>
              <DeckIcon icon={ArrowLeft} size={15} /> Back to terminal <kbd>Esc</kbd>
            </button>
            <header class="qab-board-head">
              <span class="qab-eyebrow">QUICK LAUNCH</span>
              <h3>A little more horsepower.</h3>
              <p>Pick an agent. Keep building, side by side.</p>
            </header>
            <div class="qab-destination">
              <span>
                spacevibe-deck <small>/ main</small>
              </span>
              <span>
                <DeckIcon icon={Columns} size={14} /> Split right · same tab
              </span>
            </div>
          </>
        )}
        <div class="qab-grid">
          {AGENTS.map((agent) => (
            <AgentCard key={agent.id} agent={agent} polished={polished} onRun={onRun} />
          ))}
        </div>
        {polished ? (
          <div class="qab-running">
            <span class="qab-running-label">
              Running <small>{panes.length}</small>
            </span>
            <div class="qab-running-list">
              {panes.map((agent, index) => (
                <button
                  key={`${agent.id}-${index}`}
                  class={index === activePane ? "is-current" : ""}
                  aria-label={`Focus ${agent.name} pane ${index + 1}`}
                  title={`Switch to ${agent.name} · pane ${index + 1}`}
                  onClick={() => onFocusPane(index)}
                >
                  <img src={AGENT_LOGOS[agent.id]} alt="" />
                  <span>{agent.name}</span>
                  <i aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <footer class="qab-board-foot">
            Your terminal is still running. Run an agent to return with a new pane.
          </footer>
        )}
      </div>
    </section>
  );
}

function TerminalPreview({
  agent,
  fresh = false,
  focused,
  onSelect,
}: {
  agent: Agent;
  fresh?: boolean;
  focused?: boolean;
  onSelect?(): void;
}) {
  const effort = useSignal("High");
  const message = PREVIEW_MESSAGES[agent.id];
  return (
    <div
      class={`qab-terminal ${fresh ? "qab-terminal--fresh" : ""} ${focused ? "is-focused" : ""}`}
      tabIndex={focused === undefined ? undefined : 0}
      role="region"
      aria-label={`${agent.name} pane`}
      onClick={onSelect}
      onFocus={onSelect}
    >
      <div class="qab-pane-head">
        <img src={AGENT_LOGOS[agent.id]} alt={agent.name} title={agent.name} />
        <span class="qab-pane-message" title={message}>
          {message}
        </span>
        {agent.id === "claude" && (
          <span class="qab-pane-effort" title="Preview only — does not change a running agent">
            <select
              aria-label={`${agent.name} reasoning effort (preview)`}
              value={effort.value}
              onChange={(event) => {
                effort.value = event.currentTarget.value;
              }}
            >
              <option>Low</option>
              <option>Medium</option>
              <option>High</option>
            </select>
            <DeckIcon icon={CaretDown} size={14} />
          </span>
        )}
      </div>
      <div class="qab-terminal-body">
        <p class="qab-command">❯ {agent.id}</p>
        <h4>{fresh ? "Ready when you are." : "Let's build something good."}</h4>
        <p class="qab-terminal-dim">~/projects/spacevibe-deck</p>
        {!fresh && (
          <>
            <p>I'll look at the launcher and the pane layout.</p>
            <p class="qab-terminal-dim">
              Read src/terminal/tab-manager.ts
              <br />
              Read src/ui/worktree-card.tsx
            </p>
            <p>The existing split stays in the same workspace.</p>
          </>
        )}
        <div class="qab-prompt">
          ❯ <span>{fresh ? "Ask anything…" : "Add a second pair of eyes…"}</span>
        </div>
      </div>
    </div>
  );
}

function PageDemo({ variant }: { variant: Variant }) {
  const polished = variant === "polished";
  const open = useSignal(true);
  const launched = useSignal<readonly Agent[]>([]);
  const activePane = useSignal(0);
  const terminalRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!open.value) {
      const target = polished
        ? terminalRef.current?.querySelector<HTMLElement>(".is-focused")
        : null;
      (target ?? terminalRef.current)?.focus();
    }
  }, [open.value, polished, activePane.value]);
  const close = () => {
    open.value = false;
  };
  return (
    <div
      class={`qab-window qab-window--${variant}`}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open.value) close();
      }}
    >
      <div class="qab-titlebar">
        <span class="qab-traffic">● ● ●</span>
        <span>SpaceVibe Deck</span>
        <button
          onClick={() => {
            launched.value = [AGENTS[1]];
            activePane.value = 0;
            open.value = false;
          }}
        >
          Preview headers
        </button>
        <button
          onClick={() => {
            launched.value = [];
            activePane.value = 0;
            open.value = true;
          }}
        >
          Reset demo
        </button>
      </div>
      <aside class="qab-sidebar">
        <div class="qab-sidebar-label">PROJECTS</div>
        <strong>spacevibe-deck</strong>
        <div class="qab-branch">
          ⌥ main <small>Primary</small>
        </div>
        <div class="qab-sidebar-agent">
          <img src={AGENT_LOGOS.claude} alt="" />
          <span class="qab-sidebar-message" title={PREVIEW_MESSAGES.claude}>
            {PREVIEW_MESSAGES.claude}
          </span>{" "}
          <i />
        </div>
        {launched.value.map((agent, index) => (
          <div class="qab-sidebar-agent" key={`${agent.id}-${index}`}>
            <img src={AGENT_LOGOS[agent.id]} alt="" />
            <span class="qab-sidebar-message" title={PREVIEW_MESSAGES[agent.id]}>
              {PREVIEW_MESSAGES[agent.id]}
            </span>
            <i />
          </div>
        ))}
        <button
          class={`qab-trigger ${open.value ? "is-open" : ""}`}
          aria-pressed={open.value}
          onClick={() => {
            open.value = true;
          }}
        >
          <DeckIcon icon={Plus} size={15} />
          New agent
        </button>
        <div class="qab-other-project">spacevibe-academy</div>
        <div class="qab-sidebar-bottom">
          Settings <span>⌘,</span>
        </div>
      </aside>
      <div class="qab-stage">
        <div class="qab-strip">
          <button class={`qab-task ${open.value ? "" : "is-active"}`} onClick={close}>
            Layout exploration
          </button>
          <span class="qab-file">README.md</span>
          {open.value && <span class="qab-view-label">Quick Launch</span>}
        </div>
        {open.value ? (
          <AgentBoard
            polished={polished}
            target={[AGENTS[0], ...launched.value][activePane.value]}
            panes={[AGENTS[0], ...launched.value]}
            activePane={activePane.value}
            onFocusPane={(index) => {
              activePane.value = index;
              close();
            }}
            onClose={close}
            onRun={(agent) => {
              const insertAt = polished ? activePane.value : launched.value.length;
              launched.value = [
                ...launched.value.slice(0, insertAt),
                agent,
                ...launched.value.slice(insertAt),
              ];
              activePane.value = insertAt + 1;
              close();
            }}
          />
        ) : (
          <div class="qab-panes" ref={terminalRef} tabIndex={-1} aria-label="Terminal preview">
            <TerminalPreview
              agent={AGENTS[0]}
              focused={polished ? activePane.value === 0 : undefined}
              onSelect={
                polished
                  ? () => {
                      activePane.value = 0;
                    }
                  : undefined
              }
            />
            {launched.value.map((agent, index) => (
              <TerminalPreview
                key={`${agent.id}-${index}`}
                agent={agent}
                fresh
                focused={polished ? index + 1 === activePane.value : undefined}
                onSelect={
                  polished
                    ? () => {
                        activePane.value = index + 1;
                      }
                    : undefined
                }
              />
            ))}
          </div>
        )}
        <div class="qab-status" role="status">
          <span>
            {launched.value.length + 1} {launched.value.length === 0 ? "pane" : "panes"} · 1
            terminal tab
          </span>
          <span>main</span>
        </div>
      </div>
    </div>
  );
}

export function QuickAgentBoardSection() {
  const variant = useSignal<Variant>("original");
  return (
    <div class="qab-study">
      <SectionHead
        title="Agent launcher"
        blurb="Simulated agents · Preview headers shows the per-pane message and effort control. Effort changes are local to this demo."
      />
      <div class="qab-variants" role="group" aria-label="Design options">
        <button
          aria-pressed={variant.value === "original"}
          onClick={() => {
            variant.value = "original";
          }}
        >
          <b>A</b>
          <span>
            Original<small>Compact scale · separate Run buttons</small>
          </span>
        </button>
        <button
          aria-pressed={variant.value === "polished"}
          onClick={() => {
            variant.value = "polished";
          }}
        >
          <b>B</b>
          <span>
            Minimal<small>Launch · switch · split</small>
          </span>
        </button>
      </div>
      <PageDemo key={variant.value} variant={variant.value} />
    </div>
  );
}
