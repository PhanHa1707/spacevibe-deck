import path from "node:path";
import { discoverAgents } from "../agents";
import {
  absentLimits,
  LIMIT_REFRESH_MS,
  type AgentLimitReading,
  type AgentLimitsSnapshot,
} from "../../src/lib/agent-limits";
import { installClaudeLimitCollector, readClaudeLimits } from "./claude-reader";
import { readCodexLimits } from "./codex-reader";

interface LimitsServiceOptions {
  readonly userData: string;
  readonly executable: string;
  readonly now?: () => number;
  readonly readCodex?: (signal: AbortSignal) => Promise<AgentLimitReading>;
  readonly readClaude?: () => Promise<AgentLimitReading>;
  readonly connectClaude?: () => Promise<void>;
}

/** One Codex request per minute across windows; Claude consumes local status-line reports. */
export function createAgentLimitsService(options: LimitsServiceOptions) {
  const now = options.now ?? Date.now;
  const controller = new AbortController();
  const directory = path.join(options.userData, "agent-limits");
  let codex = absentLimits("codex");
  let lastCodexAttempt = -Infinity;
  let codexFlight: Promise<AgentLimitReading> | null = null;
  let claudeConnected = false;
  let lastClaudeAttempt = -Infinity;
  let claudeFlight: Promise<AgentLimitReading> | null = null;

  async function codexSnapshot(): Promise<AgentLimitReading> {
    if (codexFlight) return codexFlight;
    if (now() - lastCodexAttempt < LIMIT_REFRESH_MS) return codex;
    lastCodexAttempt = now();
    codexFlight = (options.readCodex ?? readCodexLimits)(controller.signal)
      .catch(() => {
        console.warn(
          "Deck: Codex limit read failed",
          "The source did not return a usable reading.",
        );
        return absentLimits("codex", "error");
      })
      .then((reading) => {
        codex = reading;
        return reading;
      })
      .finally(() => {
        codexFlight = null;
      });
    return codexFlight;
  }

  async function connectClaude(): Promise<void> {
    if (options.connectClaude) return options.connectClaude();
    if (process.platform === "win32")
      throw new Error("Claude limit collection currently requires macOS or Linux.");
    if (!(await discoverAgents(["claude"])).some((entry) => entry.name === "claude")) {
      throw new Error("Claude Code was not found.");
    }
    await installClaudeLimitCollector({ directory, executable: options.executable });
  }

  async function claudeSnapshot(): Promise<AgentLimitReading> {
    if (claudeFlight) return claudeFlight;
    claudeFlight = (async () => {
      try {
        if (!claudeConnected) {
          if (now() - lastClaudeAttempt < LIMIT_REFRESH_MS) return absentLimits("claude", "error");
          lastClaudeAttempt = now();
          await connectClaude();
          claudeConnected = true;
        }
        return await (options.readClaude ?? (() => readClaudeLimits(directory)))();
      } catch {
        console.warn(
          "Deck: Claude limit collection failed",
          "The source did not return a usable reading.",
        );
        return absentLimits("claude", "error");
      }
    })().finally(() => {
      claudeFlight = null;
    });
    return claudeFlight;
  }

  return {
    snapshot(): Promise<AgentLimitsSnapshot> {
      if (controller.signal.aborted)
        return Promise.resolve([absentLimits("claude"), absentLimits("codex")]);
      return Promise.all([claudeSnapshot(), codexSnapshot()]);
    },
    close(): void {
      controller.abort();
    },
  };
}
