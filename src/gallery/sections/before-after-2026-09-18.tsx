import { useLayoutEffect, useRef } from "preact/hooks";
import type { ComponentChildren } from "preact";
import type { PaneAgent } from "../../lib/process-info";
import { applyThemeVars } from "../../lib/theme-vars";
import { settings } from "../../settings/settings-store";
import { DECK_DARK_ID, DECK_LIGHT_ID, resolveTheme } from "../../settings/themes";
import { AgentBoardCard, type BoardCardActions } from "../../ui/agent-board-card";
import type { BoardCard } from "../../ui/agent-board-model";
import {
  type RailCardPane,
  type RailState,
  type RailWorktreeGroup,
} from "../../ui/agent-rail-model";
import { WorktreeCard } from "../../ui/worktree-card";
import { NOOP } from "../chrome-fixtures";
import { SectionHead, Specimen } from "../specimen";

/**
 * Before / after pairs for the 2026-09-18 design review, one per finding the
 * owner asked to see rather than read about. Every LEFT column is the shipped
 * component over a fixture, untouched. Every RIGHT column is the same
 * component over the same fixture with ONE candidate applied — a gallery-only
 * override scoped under `data-ba="<candidate>"` in
 * `before-after-2026-09-18.css`, or the candidate's strings fed to the real
 * markup where the change is to the data the component prints.
 *
 * PARKED 2026-09-18, the same day it was registered — the `unread-mark-variants`
 * precedent: the owner chose all four candidates and they shipped
 * (`agent-glyph.tsx` ink marks, the `04c` head grid, `agent-rail.tsx`'s
 * open-by-default cards and `Needs me` line, the Board card's identity line),
 * so every "before" column would now draw the candidate too and the
 * comparison would lie. The file and its stylesheet stay in the tree as the
 * drawn record of what was chosen; the registry entry and the CSS import are
 * what went.
 */

const PROJECT = "spacevibe-deck";
const HOME = "/Users/deck";
const REPO_ROOT = `${HOME}/spacevibe-deck`;
const WORKTREES_ROOT = `${HOME}/deck-worktrees`;

function pane(fields: {
  readonly paneId: number;
  readonly agent: PaneAgent;
  readonly label: string;
  readonly state: RailState;
  readonly tabIndex: number;
  readonly focused?: boolean;
}): RailCardPane {
  return {
    kind: "agent",
    paneId: fields.paneId,
    agent: fields.agent,
    state: fields.state,
    message: "",
    age: "",
    changedAt: 0,
    focused: fields.focused ?? false,
    tabIndex: fields.tabIndex,
    // Empty on purpose: production withholds the model pill unless the
    // pane/session pairing is authoritative, and a seed that always shows it
    // was one of the review's evidence caveats.
    model: "",
    label: fields.label,
  };
}

/** `live` and `active` derived from the panes, as `agent-rail-model.ts` does. */
function checkout(fields: {
  readonly key: string;
  readonly branch: string;
  readonly name: string;
  readonly age?: string;
  readonly primary?: boolean;
  readonly panes?: readonly RailCardPane[];
}): RailWorktreeGroup {
  const panes = fields.panes ?? [];
  return {
    key: fields.key,
    branch: fields.branch,
    name: fields.name,
    path: fields.key,
    repositoryPath: REPO_ROOT,
    primary: fields.primary ?? false,
    labelled: true,
    entries: panes,
    panes,
    live: panes.some((entry) => entry.state === "working"),
    age: fields.age ?? "",
    active: panes.some((entry) => entry.focused),
    rows: [],
  };
}

/** One project's cards inside the rail's own cluster classes, at rail width. */
function CardRail({
  groups,
  openKeys,
}: {
  readonly groups: readonly RailWorktreeGroup[];
  readonly openKeys: ReadonlySet<string>;
}) {
  return (
    <div class="asr-study">
      <div class="asr-study__stage">
        <nav class="asr-rail asr-rail--mounted" aria-label="Agents (before/after specimen)">
          <div class="asr-rail__list">
            <section class="asr-stream" aria-label="Open agents">
              <div class="asr-cluster">
                {groups.map((group) => (
                  <WorktreeCard
                    key={group.key}
                    project={PROJECT}
                    group={group}
                    open={openKeys.has(group.key)}
                    onToggle={NOOP}
                    onFocusPane={NOOP}
                    onClosePane={NOOP}
                    onCloseTab={NOOP}
                    onSelectTab={NOOP}
                  />
                ))}
              </div>
            </section>
          </div>
        </nav>
      </div>
    </div>
  );
}

const NO_OPEN: ReadonlySet<string> = new Set();

/** A labelled column of the pair: before or after, its note, then the thing. */
function Column({
  title,
  note,
  candidate,
  children,
}: {
  readonly title: string;
  readonly note: string;
  /** The `data-ba` scope the stylesheet keys its override on; absent = ships. */
  readonly candidate?: string;
  readonly children: ComponentChildren;
}) {
  return (
    <div class="gx-ba__col" data-ba={candidate}>
      <p class="gx-ba__title">{title}</p>
      <p class="gx-ba__note">{note}</p>
      {children}
    </div>
  );
}

/**
 * One theme pinned to a subtree, the `matrix-section.tsx` mechanism: the
 * Codex pair has to show light beside dark on one page whatever the gallery's
 * own picker says, so it must not follow that picker.
 */
function ThemeScope({ themeId, children }: { themeId: string; children: ComponentChildren }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const node = ref.current;
    if (node !== null) {
      applyThemeVars(node.style, resolveTheme({ ...settings.peek(), themeId, colorOverrides: {} }));
    }
  }, [themeId]);
  return (
    <div ref={ref} class="gx-ba__theme">
      {children}
    </div>
  );
}

/* ------------------------------------------------ 1 · Codex mark on light */

const CODEX_KEY = `${WORKTREES_ROOT}/api-client`;
const CODEX_GROUPS: readonly RailWorktreeGroup[] = [
  checkout({
    key: REPO_ROOT,
    branch: "main",
    name: "main",
    age: "now",
    primary: true,
    panes: [
      pane({ paneId: 1, agent: "codex", label: "Codex", state: "working", tabIndex: 0 }),
      pane({ paneId: 2, agent: "codex", label: "Codex 2", state: "asked", tabIndex: 1 }),
      pane({ paneId: 3, agent: "claude", label: "Claude", state: "done", tabIndex: 2 }),
    ],
  }),
  checkout({
    key: CODEX_KEY,
    branch: "feat/api-client",
    name: "api-client",
    age: "3m",
    panes: [
      pane({ paneId: 4, agent: "codex", label: "Adding the contract test for pty_kill_foreground", state: "working", tabIndex: 3, focused: true }),
      pane({ paneId: 5, agent: "opencode", label: "Running the rail suite", state: "working", tabIndex: 4 }),
    ],
  }),
];
const CODEX_OPEN: ReadonlySet<string> = new Set([CODEX_KEY]);

function codexPair() {
  return (
    <div class="gx-ba">
      <Column title="dark · unchanged" note="reference: the white mark reads on deck-dark, so the strip and the open row both identify Codex.">
        <ThemeScope themeId={DECK_DARK_ID}>
          <CardRail groups={CODEX_GROUPS} openKeys={CODEX_OPEN} />
        </ThemeScope>
      </Column>
      <Column title="light · before (ships)" note="the same rail on deck-light: `agent-codex.svg` is `fill=#fff` in a plain img element, so the segment, the ×2 and the open row show a blank disc.">
        <ThemeScope themeId={DECK_LIGHT_ID}>
          <CardRail groups={CODEX_GROUPS} openKeys={CODEX_OPEN} />
        </ThemeScope>
      </Column>
      <Column title="light · after (candidate)" note="the mark painted in currentColor: the same SVG as a mask over the row's own text colour, so it follows the theme like every other chrome tone (DL-2.2) and uses no `filter` (DL-1.3). Production would inline the SVG through AgentGlyph with fill=currentColor, keeping the coloured marks as img elements." candidate="codex-ink">
        <ThemeScope themeId={DECK_LIGHT_ID}>
          <CardRail groups={CODEX_GROUPS} openKeys={CODEX_OPEN} />
        </ThemeScope>
      </Column>
    </div>
  );
}

/* ------------------------------------------- 2 · checkout name vs branch */

const NAME_GROUPS: readonly RailWorktreeGroup[] = [
  checkout({
    key: REPO_ROOT,
    branch: "main",
    name: "main",
    age: "now",
    primary: true,
    panes: [pane({ paneId: 11, agent: "claude", label: "Claude", state: "working", tabIndex: 0 })],
  }),
  checkout({
    key: `${WORKTREES_ROOT}/redesign`,
    branch: "redesign/phase-1-2",
    name: "redesign",
    age: "2m",
    panes: [pane({ paneId: 12, agent: "claude", label: "Claude", state: "asked", tabIndex: 1 })],
  }),
  checkout({
    key: `${WORKTREES_ROOT}/ai-terminal`,
    branch: "feature/ai-terminal",
    name: "ai-terminal",
    age: "9m",
    panes: [pane({ paneId: 13, agent: "codex", label: "Codex", state: "working", tabIndex: 2 })],
  }),
  checkout({
    key: `${WORKTREES_ROOT}/sidebar-ui`,
    branch: "bugfix/sidebar-ui-overflow",
    name: "sidebar-ui",
    age: "14m",
    panes: [pane({ paneId: 14, agent: "gemini", label: "Gemini", state: "done", tabIndex: 3 })],
  }),
];

function namePair() {
  return (
    <div class="gx-ba">
      <Column title="before (ships)" note="`.asr-card__head` is `14px minmax(0,1fr) auto 13px`: the badge's auto column takes its full width first, so the checkout's own name is what truncates (`redesi…`) while `redesign/phase-1-2` stays whole — the opposite of what the badge comment in 04c says it protects.">
        <CardRail groups={NAME_GROUPS} openKeys={NO_OPEN} />
      </Column>
      <Column title="after (candidate)" note="the name gets a floor and the badge yields: `minmax(7ch,1fr)` for the name, `minmax(0,auto)` and a 96px cap for the badge, which already ellipsizes its own text. Change lives in `src/styles/04c-rail-worktree-card.css` (head grid + badge max-width); DL-27.25 is unchanged." candidate="name-first">
        <CardRail groups={NAME_GROUPS} openKeys={NO_OPEN} />
      </Column>
    </div>
  );
}

/* ----------------------------------------------------- 3 · rail at rest */

const REST_MAIN = REPO_ROOT;
const REST_FIX = `${WORKTREES_ROOT}/fix-rail`;
const REST_DOCS = `${WORKTREES_ROOT}/docs`;
const REST_GROUPS: readonly RailWorktreeGroup[] = [
  checkout({
    key: REST_MAIN,
    branch: "main",
    name: "main",
    age: "now",
    primary: true,
    panes: [
      pane({ paneId: 21, agent: "claude", label: "Reading the rail model to see where the turn line is built", state: "working", tabIndex: 0, focused: true }),
      pane({ paneId: 22, agent: "codex", label: "Should I overwrite the existing migration or create a new one?", state: "asked", tabIndex: 1 }),
    ],
  }),
  checkout({
    key: REST_FIX,
    branch: "fix/rail",
    name: "fix-rail",
    age: "5m",
    panes: [
      pane({ paneId: 23, agent: "claude", label: "Build failed: tsc exit 2", state: "failed", tabIndex: 2 }),
      pane({ paneId: 24, agent: "opencode", label: "Done — both hosts read the same journal now", state: "done", tabIndex: 3 }),
    ],
  }),
  checkout({
    key: REST_DOCS,
    branch: "chore/docs",
    name: "docs",
    age: "40m",
    panes: [pane({ paneId: 25, agent: "gemini", label: "Gemini", state: "idle", tabIndex: 4 })],
  }),
];
const REST_OPEN: ReadonlySet<string> = new Set([REST_MAIN, REST_FIX, REST_DOCS]);

function NeedsMeLine({ count }: { readonly count: number }) {
  // Drawn: the Board bar's own chip (`board-bar__chip`, DL-34.11) placed above
  // the cluster. In the app it would press ⌘⇧A; here it presses nothing.
  return (
    <div class="gx-ba__needs">
      <button type="button" class="board-bar__chip" aria-pressed="false" onClick={NOOP}>
        <span>Needs me</span>
        <span class="board-bar__count">{count}</span>
      </button>
    </div>
  );
}

function restPair() {
  return (
    <div class="gx-ba">
      <Column title="before (ships)" note="every card starts closed (`openCardKeys` is an empty Set per window, never persisted) and a closed card is glyph segments, ×N, an age and a +. Five panes, one asked and one failed, and not one word of what any agent said; the two that need you are two pinhead badges.">
        <CardRail groups={REST_GROUPS} openKeys={NO_OPEN} />
      </Column>
      <Column title="after (candidate)" note="cards with a live pane open by default, so each row prints the pane's newest sentence (what production already prints for an unnamed pane when the card is open), and one `Needs me N` line above the cluster. Change: `src/ui/agent-rail.tsx` seeds `openCardKeys` from live checkouts (or persists it); the count line is new markup. Fork: DL-27.25's closed-by-default clause. The strip-chip half of this finding (chips naming the place instead of the sentence) is not drawn here." candidate="rail-open">
        <NeedsMeLine count={2} />
        <CardRail groups={REST_GROUPS} openKeys={REST_OPEN} />
      </Column>
    </div>
  );
}

/* ------------------------------------------------ 4 · Board card identity */

const BOARD_ACTIONS: BoardCardActions = {
  onSelect: NOOP,
  onOpenInStage: NOOP,
  onStop: NOOP,
  onRestart: NOOP,
  onClose: NOOP,
};

function boardCard(fields: {
  readonly paneId: number;
  readonly rank: number;
  readonly agent: PaneAgent;
  readonly name: string;
  readonly state: RailState;
  readonly project: string;
  readonly checkout: string;
  readonly tail: string;
  readonly changed: string;
}): BoardCard {
  return {
    paneId: fields.paneId,
    tabIndex: fields.rank - 1,
    ordinal: fields.rank,
    rank: fields.rank,
    agent: fields.agent,
    departed: false,
    hasRun: true,
    state: fields.state,
    name: fields.name,
    project: fields.project,
    where: `${fields.project} · ${fields.checkout}`,
    checkoutKey: `${WORKTREES_ROOT}/${fields.checkout}`,
    checkout: fields.checkout,
    branch: fields.checkout,
    directory: `${WORKTREES_ROOT}/${fields.checkout}`,
    what: { kind: "tail", text: fields.tail },
    task: null,
    tail: fields.tail,
    up: "12m",
    changed: fields.changed,
    confidence: "explicit",
    selected: false,
  };
}

interface BoardIdentity {
  readonly project: string;
  readonly checkout: string;
}

const BOARD_ROWS = [
  { paneId: 31, agent: "claude" as const, name: "Claude", state: "asked" as const, tail: "Should I overwrite the existing migration or create a new one?", changed: "2m" },
  { paneId: 32, agent: "codex" as const, name: "Codex", state: "working" as const, tail: "Adding the contract test for pty_kill_foreground", changed: "1m" },
  { paneId: 33, agent: "claude" as const, name: "Claude 2", state: "failed" as const, tail: "Build failed: tsc exit 2", changed: "5m" },
];

function boardCards(identity: (row: (typeof BOARD_ROWS)[number]) => BoardIdentity): BoardCard[] {
  return BOARD_ROWS.map((row, index) =>
    boardCard({ ...row, rank: index + 1, ...identity(row) }),
  );
}

/** Ships: the identity slot prints the project; the checkout sits in the corner pill. */
const BOARD_BEFORE = boardCards(() => ({ project: PROJECT, checkout: "main" }));
/** Candidate: the identity slot prints `agent · checkout`; the pill keeps the project. */
const BOARD_AFTER = boardCards((row) => ({ project: `${row.name} · main`, checkout: PROJECT }));

function BoardGrid({ cards }: { readonly cards: readonly BoardCard[] }) {
  return (
    <div class="agent-board__grid gx-ba__board">
      {cards.map((card) => (
        <AgentBoardCard
          key={card.paneId}
          card={card}
          actions={BOARD_ACTIONS}
          tabIndex={-1}
          onFocusRequest={NOOP}
        />
      ))}
    </div>
  );
}

function boardPair() {
  return (
    <div class="gx-ba">
      <Column title="before (ships)" note="three cards, one checkout: the identity line is glyph + project (DL-34.2), so all three read `spacevibe-deck` and only a 17px logo separates Claude from Codex — and nothing separates Claude from Claude 2 but the rank.">
        <BoardGrid cards={BOARD_BEFORE} />
      </Column>
      <Column title="after (candidate)" note="the identity line reads `agent · checkout`; the corner pill keeps the project. This column is the real card fed the candidate's strings, not a component change; the real change is the identity slot in `src/ui/agent-board-card.tsx` and DL-34.2's identity clause (fork). When DECK-118's group-by-project is on, the pill would drop and the header carries the project.">
        <BoardGrid cards={BOARD_AFTER} />
      </Column>
    </div>
  );
}

export function BeforeAfterSection() {
  return (
    <>
      <SectionHead
        title="Before / after · design review 2026-09-18"
        blurb="One pair per finding the review ranked highest. Left is what ships, right is the candidate over the same fixture — a gallery-only CSS override or the candidate's strings through the real markup. Nothing here ships; the note under each column names the file a chosen candidate would change."
      />
      <Specimen
        name="1 · Codex mark on the light theme"
        note="F1 — the strip segment (14px `.asr-card__logo`) and the open row (`.asr-card__glyph`) are covered; the usage pill at the rail foot and the strip chip use other classes and are not drawn."
        surface="none"
      >
        {codexPair()}
      </Specimen>
      <Specimen
        name="2 · Checkout name vs branch badge"
        note="F2 / L8 — four closed cards at the rail's 276px; the primary card is unaffected either way."
        surface="none"
      >
        {namePair()}
      </Specimen>
      <Specimen
        name="3 · The rail at rest"
        note="L1 / L5 — the same five panes across three checkouts; only what is open differs."
        surface="none"
      >
        {restPair()}
      </Specimen>
      <Specimen
        name="4 · Agent Board card identity"
        note="L3 — three real board cards in the Board's own grid at 240px columns."
        surface="none"
      >
        {boardPair()}
      </Specimen>
    </>
  );
}
