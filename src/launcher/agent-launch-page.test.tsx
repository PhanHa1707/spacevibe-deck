// @vitest-environment jsdom
import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentLaunchPage, type AgentLaunchPageProps } from "./agent-launch-page";

vi.mock("../ui/controls/deck-icon", () => ({ DeckIcon: () => <span /> }));

let host: HTMLDivElement;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
});
afterEach(() => {
  act(() => render(null, host));
  host.remove();
});

function mount(overrides: Partial<AgentLaunchPageProps> = {}) {
  const props: AgentLaunchPageProps = {
    target: { kind: "split", tabKey: 1, paneId: 2, workspacePath: "/repo" },
    agents: [{ id: "claude", label: "Claude Code", missing: false, detail: "claude" }],
    resolved: true,
    pending: false,
    error: null,
    onRun: vi.fn(),
    onBack: vi.fn(),
    onSettings: vi.fn(),
    ...overrides,
  };
  act(() => render(<AgentLaunchPage {...props} />, host));
  return props;
}

describe("compact Original launch page", () => {
  it("focuses Run without starting and uses an explicit button", () => {
    const props = mount();
    const run = host.querySelector<HTMLButtonElement>("[data-launch-primary]")!;
    expect(document.activeElement).toBe(run);
    expect(props.onRun).not.toHaveBeenCalled();
    act(() => run.click());
    expect(props.onRun).toHaveBeenCalledExactlyOnceWith("claude");
    expect(host.textContent).not.toContain("Recently used");
    expect(host.textContent).not.toContain("Default profile");
  });
  it("prevents repeated Run while pending and displays a recoverable error", () => {
    const props = mount({ pending: true, error: "Folder unavailable" });
    host.querySelector<HTMLButtonElement>("[data-launch-primary]")!.click();
    expect(props.onRun).not.toHaveBeenCalled();
    expect(host.querySelector('[role="alert"]')?.textContent).toBe("Folder unavailable");
  });
  it("shows discovery before empty-state settings, with no invented agent", () => {
    mount({ agents: [], resolved: false });
    expect(host.textContent).toContain("Looking for installed agents");
    expect(host.textContent).not.toContain("No quick agents");
    const props = mount({ agents: [] });
    act(() => host.querySelector<HTMLButtonElement>("[data-launch-primary]")!.click());
    expect(props.onSettings).toHaveBeenCalledOnce();
  });
  it("consumes Escape only when this page owns interaction", () => {
    const props = mount();
    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    act(() => {
      document.activeElement!.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
    expect(props.onBack).toHaveBeenCalledOnce();
    const covered = mount({ active: false });
    act(
      () =>
        void host
          .querySelector("section")!
          .dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
    );
    expect(covered.onBack).not.toHaveBeenCalled();
  });
});
