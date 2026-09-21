# Quick Launch tiles into the roomiest pane

Started 2026-09-19. Status: implemented, uncommitted, not eye-checked.

## Problem

Every Quick Launch `Run` docked on the right of the tab's active pane
(`createPageLaunchPane` → `dockNewPaneAt(target.paneId, "right")`). Two consequences the
owner reported:

- every split is a `row`, so a tab only ever grows tall columns — a pane never lands above
  or below another;
- the same leaf is halved again and again, so widths walk 50 / 25 / 12.5 and the fourth
  agent gets a sliver.

## Fork — resolved 2026-09-19

Layout is a fork under `AGENTS.md`. Three options were put to the owner; the owner chose A.

- **A. Incremental tiling (chosen).** Place the new pane only; never re-arrange the panes
  already on screen.
- **B. Canonical shape per pane count.** Tidiest result, but it rebuilds the tab's tree and
  destroys manual ratios and pane order. Would need a guard ("only tabs Quick Launch laid
  out") or a settings toggle. Still available as a follow-up if fixed shapes are wanted.
- **C. Preset-driven Quick Launch.** Natural for the New tab branch, but the split branch
  still needs A or B, and presets cannot yet be renamed, deleted or chosen.

## Implementation

`src/lib/pane-tiling.ts` (new, pure) — `chooseTilePlacement(layout, paneIds, viewport, eligible)`:

- derives each leaf's box from the layout's **structural** ratios, not the Focus Expand
  overlay (a display-time transform re-applied every render, which would make the anchor
  follow the focus);
- picks the largest-area eligible leaf, tie → lower pane id;
- splits it along its longer side: `right` when wider, `bottom` when taller;
- returns `null` when no leaf is eligible, so the caller keeps the old behaviour.

`src/terminal/tab-manager.ts` uses it in the launcher's split branch only. The captured
target still decides the **folder** (`freshCwd(target.paneId)`); only the **slot** comes from
geometry. The stage box is measured on the shared host element, because a background tab's
own container is `display: none`.

`src/launcher/agent-launch-page.tsx` — the destination label "Split right · same tab" became
false, so it now reads "Split · same tab" with a tooltip naming the tab.

Observable consequence, by design: on a tie the lower pane id is cut first, so the second
agent lands **under the original shell**, not under the first agent — leaf order `[1, 3, 2]`.
This fills the tab in reading order and reaches a 2x2 on the fourth pane. Flipping the
tie-break to the highest id is a one-line change if the owner prefers the opposite.

## Verification — run 2026-09-19

```
npx tsc --noEmit                                                  → exit 0
npx vitest run src/launcher src/lib/pane-tiling.test.ts \
  src/terminal/tab-manager.launch-agent-at-target.test.ts
  Test Files  10 passed (10)      Tests  121 passed (121)
npm test
  Test Files  2 failed | 382 passed | 1 skipped (385)
  Tests  3 failed | 5060 passed | 5 skipped (5068)
```

The three red tests are not this change, and the set was identical on two runs:
`scripts/design-language.test.ts` DL-33 (that test file is itself dirty from another
session) and `scripts/icon-system.test.ts`, whose offenders are `lib/agent-logos.ts`,
`ui/controls/agent-glyph.tsx` and `gallery/sections/before-after-2026-09-18.tsx` — the last
two are on HEAD at `1967ab8`. `npm run lint` is red on `electron/` and `backend/` files with
no hit in anything changed here.

Not run: eye check in the real app, and manual native acceptance on a packaged build.

## Handoff

Branch `main`, checkout `spacevibe-deck`, nothing committed.

Changed: `src/lib/pane-tiling.ts` (new), `src/lib/pane-tiling.test.ts` (new),
`src/terminal/tab-manager.ts`, `src/terminal/tab-manager.launch-agent-at-target.test.ts`,
`src/launcher/agent-launch-page.tsx`, `docs/internals/terminal.md`, `CHANGELOG.md`.

Blockers before a commit:

- `src/terminal/tab-manager.ts` and `CHANGELOG.md` each carry another session's uncommitted
  hunk (the `setPaneWorking` removal around line 533; the "Removed yellow lines" entry), so
  `git commit -- <path>` would sweep them in. Split them with the snapshot-and-restore route
  before committing.
- `docs/internals/terminal.md` and `CHANGELOG.md` wording awaits the owner's approval.

`src/gallery/sections/quick-agent-board.tsx` still says "Split right · same tab" and was left
alone: it is a parked study (`45226b4`).

## Parked — found here, belongs to its own task

The owner stopped using Linear on 2026-09-19 and chose `docs/plans/` as the destination for
task records instead. Two places in the repo still describe the old arrangement, and both
were left untouched rather than fixed mid-task:

- [`AGENTS.md`](../../AGENTS.md) — "Plans, specs, research notes and review reports are not
  committed" and "active work lives in the issue that owns it". The first now contradicts
  this very file; the second names a tool no longer in use.
- [`docs/README.md`](../README.md) — the documentation index has no `plans/` entry, so a
  reader has no way to find task records.

Both sit in `AGENTS.md`, which is already dirty from another session, so a fix there needs
the same commit split as `tab-manager.ts`.
