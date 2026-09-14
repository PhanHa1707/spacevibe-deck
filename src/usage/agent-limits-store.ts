import { signal } from "@preact/signals";
import { available, readAgentLimits } from "../host/agent-limits-host";
import type { AgentLimitsSnapshot } from "../lib/agent-limits";

const LOCAL_REFRESH_MS = 15_000;
export const agentLimits = signal<AgentLimitsSnapshot>([]);

/** Only a mounted sidebar asks for data; main coalesces reads across windows. */
export function observeAgentLimits(): () => void {
  if (!available) return () => undefined;
  let disposed = false;
  let pending = false;
  const refresh = async () => {
    if (pending || disposed) return;
    pending = true;
    try {
      const snapshot = await readAgentLimits();
      if (!disposed) agentLimits.value = snapshot;
    } catch (error) {
      console.warn("Deck: could not read agent limits", error);
      if (!disposed) agentLimits.value = [];
    } finally {
      pending = false;
    }
  };
  const focus = () => {
    void refresh();
  };
  const timer = setInterval(focus, LOCAL_REFRESH_MS);
  window.addEventListener("focus", focus);
  focus();
  return () => {
    disposed = true;
    clearInterval(timer);
    window.removeEventListener("focus", focus);
  };
}
