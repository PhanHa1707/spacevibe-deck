// @vitest-environment jsdom
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tabViews, type PaneView } from "./tabs-store";
import { paneTails } from "./session-tail-store";
import { mountPaneAgentHeader } from "./pane-agent-header";
import { persistError } from "../chrome/events";
vi.mock("../ui/controls/deck-icon", () => ({ DeckIcon: () => null }));

const pane: PaneView = {
  paneId: 1,
  agent: "claude",
  sessionId: "session-1",
  attention: "none",
  phase: "idle",
  hasRun: false,
  changedAt: 0,
};
const send = vi.fn<(data: string) => Promise<boolean>>();
const focus = vi.fn();
function publish(next: PaneView) {
  tabViews.value = [
    {
      key: 1,
      process: next.agent ?? "shell",
      name: null,
      dotColor: null,
      workspacePath: "/repo",
      agents: next.agent ? [next.agent] : [],
      agentBusy: false,
      unread: false,
      panes: [next],
    },
  ];
}
let element: HTMLDivElement;
let stop: () => void;
beforeEach(() => {
  vi.stubGlobal("__deckHost", { invoke: vi.fn(), listen: vi.fn() });
  vi.resetAllMocks();
  send.mockResolvedValue(true);
  persistError.value = null;
  publish(pane);
  paneTails.value = new Map([[1, "Checking launch behavior"]]);
  element = document.createElement("div");
  const bar = document.createElement("div");
  bar.className = "pane__bar";
  element.append(bar);
  document.body.append(element);
  act(() => {
    stop = mountPaneAgentHeader(1, element, bar, { send, focus });
  });
});
afterEach(() => {
  act(() => stop());
  element.remove();
  tabViews.value = [];
  paneTails.value = new Map();
  vi.unstubAllGlobals();
});
describe("Claude pane effort control", () => {
  it("uses the same tail as the sidebar", () => {
    expect(element.textContent).toContain("Checking launch behavior");
    act(() => {
      paneTails.value = new Map([[1, "Running tests"]]);
    });
    expect(element.textContent).toContain("Running tests");
    act(() => publish({ ...pane, agent: null }));
    expect(element.classList.contains("pane--agent-header")).toBe(false);
  });
  it("opens Claude's native picker without submitting or clearing a draft", async () => {
    const button = element.querySelector<HTMLButtonElement>("button")!;
    expect(button.disabled).toBe(false);
    await act(async () => button.click());
    expect(send).toHaveBeenCalledExactlyOnceWith("\x1bp");
    expect(focus).toHaveBeenCalledOnce();
    expect(persistError.value).toBeNull();
    expect(button.textContent).toBe("Effort");
  });
  it.each(["codex", "gemini", "opencode"] as const)("does not offer effort for %s", (agent) => {
    act(() => publish({ ...pane, agent }));
    expect(element.querySelector("button")).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });
  it("does not require hooks or a transcript session ID to open the native picker", async () => {
    act(() => publish({ ...pane, sessionId: null }));
    await act(async () => element.querySelector<HTMLButtonElement>("button")!.click());
    expect(send).toHaveBeenCalledExactlyOnceWith("\x1bp");
  });
  it("blocks exited agents and stale clicks after the pane becomes a shell", async () => {
    act(() => publish({ ...pane, phase: "exited" }));
    const button = element.querySelector<HTMLButtonElement>("button")!;
    expect(button.disabled).toBe(true);
    await act(async () => button.click());
    act(() => publish({ ...pane, agent: null }));
    await act(async () => button.click());
    expect(send).not.toHaveBeenCalled();
  });
  it("reports a failed send without claiming an effort change", async () => {
    send.mockResolvedValue(false);
    await act(async () => element.querySelector<HTMLButtonElement>("button")!.click());
    expect(persistError.value).toBe("Could not open Claude Code's effort picker. Try again.");
    expect(focus).toHaveBeenCalledOnce();
  });
  it("ignores late completion after a session change and prevents duplicate sends", async () => {
    let resolve!: (value: boolean) => void;
    send.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const button = element.querySelector<HTMLButtonElement>("button")!;
    act(() => {
      button.click();
      button.click();
    });
    expect(send).toHaveBeenCalledOnce();
    expect(focus).toHaveBeenCalledOnce();
    focus.mockClear();
    act(() => publish({ ...pane, sessionId: "session-2" }));
    await act(async () => resolve(true));
    expect(focus).not.toHaveBeenCalled();
    expect(persistError.value).toBeNull();
  });
  it("does not steal focus back when a delayed send completes", async () => {
    let resolve!: (value: boolean) => void;
    send.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    act(() => element.querySelector<HTMLButtonElement>("button")!.click());
    expect(focus).toHaveBeenCalledOnce();
    focus.mockClear();
    const other = document.createElement("input");
    document.body.append(other);
    other.focus();
    await act(async () => resolve(true));
    expect(focus).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(other);
    other.remove();
  });
});
