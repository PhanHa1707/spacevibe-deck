// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ submit: vi.fn(), board: vi.fn(), config: vi.fn() }));
vi.mock("./feedback-api.js", async (original) => ({
  ...(await original()),
  SUBMISSIONS_OPEN: true,
  submitFeedback: api.submit,
  fetchFeedbackBoard: api.board,
  fetchFeedbackConfig: api.config,
}));
vi.mock("./feedback-auth.js", () => ({
  createFeedbackAuth: (_root, _client, changed) => {
    queueMicrotask(() => changed(true));
    return { token: () => "credential", reset: () => changed(false) };
  },
}));

afterEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
  vi.resetModules();
  vi.clearAllMocks();
});
async function mount() {
  document.body.innerHTML = '<div id="feedback-root"></div>';
  api.config.mockResolvedValue({ googleClientId: "client", submissionsOpen: true });
  api.board.mockResolvedValue({ board: { pending: [], review: [], done: [] }, nextCursor: null });
  await import("./feedback.js");
  await vi.waitFor(() =>
    expect(document.querySelector("#feedback-root").dataset.authReady).toBe("true"),
  );
  return document.querySelector(".feedback-form");
}

it("keeps category and id after a lost acknowledgment and reload, then clears only after success", async () => {
  let form = await mount();
  form.querySelector('[name="title"]').value = "Keep this idea";
  form.querySelector('[name="body"]').value = "Details";
  form.querySelector('[name="category"][value="idea"]').checked = true;
  api.submit.mockRejectedValueOnce(new Error("response lost"));
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  await vi.waitFor(() => expect(api.submit).toHaveBeenCalledTimes(1));
  const first = api.submit.mock.calls[0][0];
  const stored = JSON.parse(localStorage.getItem("deck.landing.feedbackDraft.v1"));
  expect(stored.category).toBe("idea");
  expect(stored.id).toBe(first.id);
  vi.resetModules();
  form = await mount();
  expect(form.querySelector('[name="category"]:checked').value).toBe("idea");
  api.submit.mockResolvedValueOnce(undefined);
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  await vi.waitFor(() => expect(api.submit).toHaveBeenCalledTimes(2));
  expect(api.submit.mock.calls[1][0]).toEqual(first);
  await vi.waitFor(() => expect(localStorage.getItem("deck.landing.feedbackDraft.v1")).toBeNull());
});
