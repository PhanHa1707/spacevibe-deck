// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { currentLimitWindows, LIMIT_MAX_AGE_MS } from "../../src/lib/agent-limits";
import {
  installClaudeLimitCollector,
  readClaudeLimits,
  restoreClaudeLimitCollector,
} from "./claude-reader";

let root: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "deck-limits-"));
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});
const options = () => ({
  directory: path.join(root, "collector"),
  executable: process.execPath,
  settingsPath: path.join(root, "settings.json"),
});
const document = async () => JSON.parse(await fs.readFile(options().settingsPath, "utf8"));

function run(command: string, input: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("/bin/sh", ["-c", command], { cwd: root, stdio: "pipe" });
    let output = "";
    let errors = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      errors += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve(output) : reject(new Error(errors))));
    child.stdin.end(input);
  });
}

describe.skipIf(process.platform === "win32")("Claude status-line collector", () => {
  it("preserves original output/options/hooks while persisting only limit fields", async () => {
    const original = {
      statusLine: {
        type: "command",
        command: "cat; # preserve this comment",
        padding: 2,
        refreshInterval: 30,
      },
      hooks: { Stop: [] },
      theme: "dark",
    };
    await fs.writeFile(options().settingsPath, JSON.stringify(original), { mode: 0o600 });
    await installClaudeLimitCollector(options());
    const configured = await document();
    expect(configured.hooks).toEqual(original.hooks);
    expect(configured.statusLine.padding).toBe(2);
    expect(configured.statusLine.refreshInterval).toBe(30);
    const payload = JSON.stringify({
      session_id: "session-one",
      prompt: "must-not-be-captured",
      rate_limits: {
        five_hour: { used_percentage: 42, resets_at: Math.floor(Date.now() / 1000) + 3600 },
      },
    });
    expect(await run(configured.statusLine.command, payload)).toBe(payload);
    const reading = await readClaudeLimits(options().directory);
    expect(reading.windows[0].usedPercent).toBe(42);
    const capture = await fs.readFile(
      path.join(options().directory, "captures/session-one.json"),
      "utf8",
    );
    expect(capture).not.toContain("must-not-be-captured");
    const previous = JSON.parse(capture);
    await fs.writeFile(
      path.join(options().directory, "captures/session-one.json"),
      JSON.stringify({ ...previous, observedAtMs: Date.now() - LIMIT_MAX_AGE_MS - 1000 }),
    );
    expect(currentLimitWindows(await readClaudeLimits(options().directory), Date.now())).toEqual(
      [],
    );
    const receivedAfter = Date.now();
    expect(await run(configured.statusLine.command, payload)).toBe(payload);
    const refreshed = await readClaudeLimits(options().directory);
    expect(refreshed.observedAtMs).toBeGreaterThanOrEqual(receivedAfter);
    expect(currentLimitWindows(refreshed, Date.now())).toEqual(reading.windows);
    expect(currentLimitWindows(refreshed, refreshed.observedAtMs + LIMIT_MAX_AGE_MS + 1)).toEqual(
      [],
    );
    await installClaudeLimitCollector(options());
    await restoreClaudeLimitCollector(options());
    expect(await document()).toEqual(original);
  });
  it("does not overwrite a newer user command during restoration", async () => {
    await fs.writeFile(options().settingsPath, "{}");
    await installClaudeLimitCollector(options());
    const newer = { statusLine: { type: "command", command: "echo newer" } };
    await fs.writeFile(options().settingsPath, JSON.stringify(newer));
    await restoreClaudeLimitCollector(options());
    expect(await document()).toEqual(newer);
  });
  it("uses the original command if the collector file disappears", async () => {
    await fs.writeFile(
      options().settingsPath,
      JSON.stringify({ statusLine: { type: "command", command: "cat" } }),
    );
    await installClaudeLimitCollector(options());
    await fs.unlink(path.join(options().directory, "claude-statusline.cjs"));
    expect(await run((await document()).statusLine.command, "still works")).toBe("still works");
  });
  it("refuses malformed settings without overwriting them", async () => {
    await fs.writeFile(options().settingsPath, "broken json");
    await expect(installClaudeLimitCollector(options())).rejects.toThrow();
    expect(await fs.readFile(options().settingsPath, "utf8")).toBe("broken json");
  });
  it("preserves status-line option edits across reinstall and restore", async () => {
    await fs.writeFile(
      options().settingsPath,
      JSON.stringify({ statusLine: { type: "command", command: "cat", padding: 2 } }),
    );
    await installClaudeLimitCollector(options());
    const current = await document();
    await fs.writeFile(
      options().settingsPath,
      JSON.stringify({ ...current, statusLine: { ...current.statusLine, padding: 9 } }),
    );
    await installClaudeLimitCollector(options());
    expect((await document()).statusLine.padding).toBe(9);
    await restoreClaudeLimitCollector(options());
    expect((await document()).statusLine).toEqual({ type: "command", command: "cat", padding: 9 });
  });
  it("selects the newest nonempty observation rather than file mtime or an empty session", async () => {
    const captures = path.join(options().directory, "captures");
    await fs.mkdir(captures, { recursive: true });
    const now = Date.now();
    for (const [session, observedAtMs, used] of [
      ["a", now - 10_000, 20],
      ["b", now - 5000, 40],
    ] as const) {
      await fs.writeFile(
        path.join(captures, `${session}.json`),
        JSON.stringify({
          observedAtMs,
          rateLimits: {
            five_hour: { used_percentage: used, resets_at: Math.floor(now / 1000) + 3600 },
          },
        }),
      );
    }
    await fs.utimes(path.join(captures, "a.json"), new Date(now + 1000), new Date(now + 1000));
    expect((await readClaudeLimits(options().directory)).windows[0].usedPercent).toBe(40);
    await fs.writeFile(
      path.join(captures, "c.json"),
      JSON.stringify({ observedAtMs: now, rateLimits: {} }),
    );
    expect((await readClaudeLimits(options().directory)).windows[0].usedPercent).toBe(40);
    await fs.unlink(path.join(captures, "a.json"));
    await fs.unlink(path.join(captures, "b.json"));
    expect((await readClaudeLimits(options().directory)).windows).toEqual([]);
  });
});
