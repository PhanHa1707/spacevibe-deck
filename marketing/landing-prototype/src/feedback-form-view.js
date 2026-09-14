import { BODY_MAX, FEEDBACK_CATEGORIES, TITLE_MAX, TITLE_MIN } from "./feedback-api.js";
import { CATEGORY_ICONS, SEND_ICON, SENT_ICON } from "./feedback-icons.js";

export const CATEGORY_COPY = {
  bug: "feedbackCategoryBug",
  idea: "feedbackCategoryIdea",
  other: "feedbackCategoryOther",
};

const COUNTED_FIELDS = { title: TITLE_MAX, body: BODY_MAX };

function renderTypes(copy) {
  return FEEDBACK_CATEGORIES.map(
    (category, index) => `
      <label class="feedback-type" data-category="${category}">
        <input type="radio" name="category" value="${category}" ${index === 0 ? "checked" : ""} />
        <span class="feedback-type__body">
          ${CATEGORY_ICONS[category]}
          <span data-copy="${CATEGORY_COPY[category]}">${copy[CATEGORY_COPY[category]]}</span>
        </span>
      </label>
    `,
  ).join("");
}

function renderForm(copy) {
  return `
    <form class="feedback-form" novalidate aria-labelledby="feedback-form-title">
      <fieldset class="feedback-field">
        <legend class="feedback-label" data-copy="feedbackCategoryLabel">${copy.feedbackCategoryLabel}</legend>
        <div class="feedback-types">${renderTypes(copy)}</div>
      </fieldset>

      <label class="feedback-field">
        <span class="feedback-label" data-copy="feedbackTitleLabel">${copy.feedbackTitleLabel}</span>
        <input
          class="feedback-input"
          name="title"
          type="text"
          required
          minlength="${TITLE_MIN}"
          maxlength="${TITLE_MAX}"
          autocomplete="off"
          placeholder="${copy.feedbackTitlePlaceholder}"
          data-copy-placeholder="feedbackTitlePlaceholder"
        />
        <span class="feedback-hint">
          <span data-title-hint data-copy="feedbackTitleHint">${copy.feedbackTitleHint}</span>
          <span class="feedback-count" data-count-for="title">0/${TITLE_MAX}</span>
        </span>
      </label>

      <label class="feedback-field">
        <span class="feedback-label" data-copy="feedbackBodyLabel">${copy.feedbackBodyLabel}</span>
        <textarea
          class="feedback-input feedback-input--area"
          name="body"
          rows="4"
          maxlength="${BODY_MAX}"
          placeholder="${copy.feedbackBodyPlaceholder}"
          data-copy-placeholder="feedbackBodyPlaceholder"
        ></textarea>
        <span class="feedback-hint feedback-hint--end">
          <span class="feedback-count" data-count-for="body">0/${BODY_MAX}</span>
        </span>
      </label>

      <!-- Honeypot: hidden from people and assistive tech, filled by bots. -->
      <label class="feedback-trap" aria-hidden="true">
        Website
        <input name="website" type="text" tabindex="-1" autocomplete="off" />
      </label>

      <p class="feedback-notice" data-copy="feedbackNotice">${copy.feedbackNotice}</p>
      <p class="feedback-result" data-form-result role="status" aria-live="polite"></p>

      <div class="feedback-actions">
        <button class="feedback-pill feedback-submit" type="submit">
          <span data-submit-label data-copy="feedbackSubmit">${copy.feedbackSubmit}</span>
          ${SEND_ICON}
        </button>
        <kbd class="feedback-kbd" data-shortcut aria-hidden="true"></kbd>
      </div>
    </form>
  `;
}

function renderSent(copy) {
  return `
    <div class="feedback-sent" data-sent-panel hidden>
      ${SENT_ICON}
      <h3 data-copy="feedbackSent">${copy.feedbackSent}</h3>
      <p data-copy="feedbackSentBody">${copy.feedbackSentBody}</p>
      <button class="feedback-pill feedback-pill--ghost" type="button" data-send-another>
        <span data-copy="feedbackSendAnother">${copy.feedbackSendAnother}</span>
      </button>
    </div>
  `;
}

export function renderComposer(copy) {
  return `
    <section class="feedback-composer" data-state="idle" aria-labelledby="feedback-form-title">
      <div class="feedback-composer__card">
        <header class="feedback-composer__head">
          <h2 id="feedback-form-title" class="feedback-heading" data-copy="feedbackFormTitle">${copy.feedbackFormTitle}</h2>
        </header>
        ${renderForm(copy)}
        ${renderSent(copy)}
      </div>
    </section>
  `;
}

/** Counters, the title's readiness dot and the textarea's height. */
export function updateFormMeters(form) {
  for (const [name, limit] of Object.entries(COUNTED_FIELDS)) {
    const field = form.querySelector(`[name="${name}"]`);
    const count = form.querySelector(`[data-count-for="${name}"]`);

    if (field && count) {
      count.textContent = `${field.value.length}/${limit}`;
    }
  }

  const title = form.querySelector('[name="title"]');
  form.dataset.titleValid = String((title?.value.trim().length ?? 0) >= TITLE_MIN);

  const body = form.querySelector('[name="body"]');

  if (body) {
    body.style.height = "auto";
    body.style.height = `${body.scrollHeight + 2}px`;
  }
}

/** @param {"idle" | "sending" | "sent" | "error"} state */
export function setComposerState(root, state, copyKey, copy) {
  const composer = root.querySelector(".feedback-composer");
  const form = composer?.querySelector(".feedback-form");
  const sent = composer?.querySelector("[data-sent-panel]");
  const result = composer?.querySelector("[data-form-result]");
  const submit = composer?.querySelector(".feedback-submit");
  const label = submit?.querySelector("[data-submit-label]");

  if (!composer || !form || !sent || !result || !submit || !label) {
    throw new Error("Feedback composer is missing.");
  }

  composer.dataset.state = state;
  form.hidden = state === "sent";
  sent.hidden = state !== "sent";
  submit.disabled = state === "sending";
  label.dataset.copy = state === "sending" ? "feedbackSending" : "feedbackSubmit";
  label.textContent = copy[label.dataset.copy];

  if (copyKey === null) {
    delete result.dataset.copy;
    result.textContent = "";
    return;
  }

  result.dataset.copy = copyKey;
  result.textContent = copy[copyKey];
}

export function resetComposer(root, copy) {
  const form = root.querySelector(".feedback-form");

  if (!form) {
    throw new Error("Feedback form is missing.");
  }

  form.reset();
  updateFormMeters(form);
  setComposerState(root, "idle", null, copy);
}
