import { describe, expect, it, vi } from "vitest";
import { createAgentLaunchPageStore } from "./agent-launch-page-store";
import type { AgentLaunchResult } from "../terminal/agent-launch-target";

const target = { kind: "first-pane", workspacePath: "/repo" } as const;
describe("agent launch page state", () => {
  it("invalidates a deferred Back focus when navigation supersedes it", () => {
    const page = createAgentLaunchPageStore();
    const restoreFocus = vi.fn();
    page.open({ target, launch: vi.fn(), restoreFocus, reveal: vi.fn() });
    page.close(true);
    const canRestore = restoreFocus.mock.calls[0][0];
    expect(canRestore()).toBe(true);
    page.close();
    expect(canRestore()).toBe(false);
  });
  it("opens and cancels without starting an agent", () => {
    const page = createAgentLaunchPageStore();
    const launch = vi.fn();
    const restoreFocus = vi.fn();
    page.open({ target, launch, restoreFocus, reveal: vi.fn() });
    page.close(true);
    expect(launch).not.toHaveBeenCalled();
    expect(restoreFocus).toHaveBeenCalledOnce();
  });

  it("serializes Run and prevents stale completion from closing a newer page", async () => {
    const page = createAgentLaunchPageStore();
    let resolve!: (result: AgentLaunchResult) => void;
    const launch = vi.fn(
      (_agent: string, _valid: () => boolean) =>
        new Promise<AgentLaunchResult>((done) => {
          resolve = done;
        }),
    );
    const reveal = vi.fn();
    const request = { target, launch, restoreFocus: vi.fn(), reveal };
    page.open(request);
    const first = page.run("claude");
    await page.run("claude");
    expect(launch).toHaveBeenCalledTimes(1);
    const valid = launch.mock.calls[0][1];
    page.close();
    page.open(request);
    expect(valid()).toBe(false);
    resolve({ kind: "spawned", receipt: { tabKey: 1, paneId: 1, canFocus: () => true } });
    await first;
    expect(page.request.value).not.toBeNull();
    expect(reveal).not.toHaveBeenCalled();
  });

  it("keeps an error actionable and reveals only a live successful receipt", async () => {
    const page = createAgentLaunchPageStore();
    const reveal = vi.fn();
    page.open({
      target,
      launch: async () => ({ kind: "failed", message: "Folder unavailable" }),
      restoreFocus: vi.fn(),
      reveal,
    });
    await page.run("claude");
    expect(page.error.value).toBe("Folder unavailable");
    expect(page.request.value).not.toBeNull();
    expect(page.pending.value).toBe(false);
  });
});
