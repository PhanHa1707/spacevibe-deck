import { describe, expect, it } from "vitest";
import { SIGNAL_ADAPTERS_REVISION, storedSignalAdapterOn } from "./signal-adapter-choice";

describe("storedSignalAdapterOn", () => {
  it("reads a 1.1.x file's stored true as unchosen, so no hooks are registered", () => {
    const written11x = { agentSignalAdapters: { claude: true, codex: true, opencode: true } };
    expect(storedSignalAdapterOn(written11x, "claude")).toBe(false);
    expect(storedSignalAdapterOn(written11x, "codex")).toBe(false);
  });

  it("honours a stored true only under the current revision", () => {
    const chosen = {
      signalAdaptersRevision: SIGNAL_ADAPTERS_REVISION,
      agentSignalAdapters: { claude: true, codex: false },
    };
    expect(storedSignalAdapterOn(chosen, "claude")).toBe(true);
    expect(storedSignalAdapterOn(chosen, "codex")).toBe(false);
    expect(storedSignalAdapterOn({ ...chosen, signalAdaptersRevision: 1 }, "claude")).toBe(false);
  });

  it("is off for anything that is not a settings object", () => {
    expect(storedSignalAdapterOn(null, "claude")).toBe(false);
    expect(storedSignalAdapterOn("settings", "claude")).toBe(false);
    expect(
      storedSignalAdapterOn(
        { signalAdaptersRevision: SIGNAL_ADAPTERS_REVISION, agentSignalAdapters: "on" },
        "claude",
      ),
    ).toBe(false);
  });
});
