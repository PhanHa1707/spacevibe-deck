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
  const input = { title: "Split panes", body: "", category: "idea", website: "", id: "" };

  it("names the draft's id when it has one, with a timeout on the request", async () => {
    const sent = [];
    const capture = async (_url, init) => {
      sent.push({ body: JSON.parse(init.body), signal: init.signal });
      return new Response(null, { status: 204 });
    };
    const id = "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed";

    await submitFeedback({ ...input, id }, capture);
    await submitFeedback(input, capture);

    expect(sent[0].body.id).toBe(id);
    expect("id" in sent[1].body).toBe(false);
    expect(sent[0].signal).toBeInstanceOf(AbortSignal);
  });

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
