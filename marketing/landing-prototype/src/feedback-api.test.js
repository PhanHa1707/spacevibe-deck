import { describe, expect, it } from "vitest";

import { FeedbackSubmitError, groupFeedbackBoard, submitFeedback } from "./feedback-api.js";

const card = (overrides) => ({
  id: "DECK-1",
  title: "Split panes",
  category: "idea",
  status: "pending",
  updatedAt: "2026-09-14T10:00:00.000Z",
  ...overrides,
});

describe("groupFeedbackBoard", () => {
  it("groups by status, newest first, and drops malformed items", () => {
    const board = groupFeedbackBoard({
      items: [
        card({ id: "DECK-2", updatedAt: "2026-09-12T10:00:00.000Z" }),
        card({ id: "DECK-3" }),
        card({ id: "DECK-4", status: "done" }),
        card({ id: "DECK-5", status: "backlog" }),
        card({ id: "DECK-6", title: "" }),
        { id: "DECK-7" },
      ],
    });

    expect(board.pending.map((item) => item.id)).toEqual(["DECK-3", "DECK-2"]);
    expect(board.review).toEqual([]);
    expect(board.done.map((item) => item.id)).toEqual(["DECK-4"]);
  });

  it("rejects a response without an items list", () => {
    expect(() => groupFeedbackBoard({})).toThrow();
  });
});

describe("submitFeedback", () => {
  const input = { title: "Split panes", body: "", category: "idea", website: "" };
  const respond = (status) => async () => new Response(null, { status });

  it("maps the Worker's status codes to a reason", async () => {
    await expect(submitFeedback(input, respond(204))).resolves.toBeUndefined();

    for (const [status, reason] of [
      [400, "invalid"],
      [413, "invalid"],
      [429, "rate"],
      [503, "server"],
    ]) {
      await expect(submitFeedback(input, respond(status))).rejects.toMatchObject({ reason });
    }

    await expect(
      submitFeedback(input, async () => {
        throw new TypeError("offline");
      }),
    ).rejects.toBeInstanceOf(FeedbackSubmitError);
  });
});
