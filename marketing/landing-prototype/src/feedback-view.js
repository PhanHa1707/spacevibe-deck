import { BRAND_ICON_SRC } from "./appwin.js";
import { BODY_MAX, FEEDBACK_CATEGORIES, FEEDBACK_STATUSES, TITLE_MAX } from "./feedback-api.js";
import { LANDING_URL } from "./site-urls.js";

const PARTNER_MARK_SRC = "/landing-prototype/assets/partner-mark.svg";

const COLUMN_COPY = {
  pending: "feedbackColumnPending",
  review: "feedbackColumnReview",
  done: "feedbackColumnDone",
};

const CATEGORY_COPY = {
  bug: "feedbackCategoryBug",
  idea: "feedbackCategoryIdea",
  other: "feedbackCategoryOther",
};

// The chrome (topbar, brand, language toggle, intro) reuses the changelog's
// classes so the two secondary pages cannot drift apart.
function renderTopbar(copy, locale) {
  return `
    <header class="changelog-topbar">
      <a class="changelog-brand" href="${LANDING_URL}" aria-label="${copy.navProduct}">
        <span class="changelog-brand__marks" aria-hidden="true">
          <img src="${PARTNER_MARK_SRC}" alt="" width="22" height="22" />
          <span></span>
          <img src="${BRAND_ICON_SRC}" alt="" width="28" height="28" />
        </span>
        <strong data-copy="navProduct">${copy.navProduct}</strong>
      </a>
      <div class="changelog-topbar__lang" role="group" aria-label="${copy.localeLabel}" data-active="${locale}">
        <span class="changelog-topbar__lang-thumb" aria-hidden="true"></span>
        <button type="button" data-locale="en" aria-pressed="${locale === "en"}">EN</button>
        <button type="button" data-locale="vi" aria-pressed="${locale === "vi"}">VI</button>
      </div>
      <a class="changelog-back" href="${LANDING_URL}">
        <span aria-hidden="true">←</span>
        <span data-copy="changelogBack">${copy.changelogBack}</span>
      </a>
    </header>
  `;
}

function renderForm(copy) {
  const categories = FEEDBACK_CATEGORIES.map(
    (category, index) => `
      <label class="feedback-chip">
        <input type="radio" name="category" value="${category}" ${index === 0 ? "checked" : ""} />
        <span data-copy="${CATEGORY_COPY[category]}">${copy[CATEGORY_COPY[category]]}</span>
      </label>
    `,
  ).join("");

  return `
    <form class="feedback-form" novalidate aria-labelledby="feedback-form-title">
      <h2 id="feedback-form-title" class="feedback-heading" data-copy="feedbackFormTitle">${copy.feedbackFormTitle}</h2>

      <fieldset class="feedback-field">
        <legend class="feedback-label" data-copy="feedbackCategoryLabel">${copy.feedbackCategoryLabel}</legend>
        <div class="feedback-chips">${categories}</div>
      </fieldset>

      <label class="feedback-field">
        <span class="feedback-label">
          <span data-copy="feedbackTitleLabel">${copy.feedbackTitleLabel}</span>
          <span class="feedback-count" data-count-for="title">0/${TITLE_MAX}</span>
        </span>
        <input
          class="feedback-input"
          name="title"
          type="text"
          required
          minlength="3"
          maxlength="${TITLE_MAX}"
          autocomplete="off"
          placeholder="${copy.feedbackTitlePlaceholder}"
          data-copy-placeholder="feedbackTitlePlaceholder"
        />
      </label>

      <label class="feedback-field">
        <span class="feedback-label">
          <span data-copy="feedbackBodyLabel">${copy.feedbackBodyLabel}</span>
          <span class="feedback-count" data-count-for="body">0/${BODY_MAX}</span>
        </span>
        <textarea
          class="feedback-input feedback-input--area"
          name="body"
          rows="6"
          maxlength="${BODY_MAX}"
          placeholder="${copy.feedbackBodyPlaceholder}"
          data-copy-placeholder="feedbackBodyPlaceholder"
        ></textarea>
      </label>

      <!-- Honeypot: hidden from people and assistive tech, filled by bots. -->
      <label class="feedback-trap" aria-hidden="true">
        Website
        <input name="website" type="text" tabindex="-1" autocomplete="off" />
      </label>

      <p class="feedback-notice" data-copy="feedbackNotice">${copy.feedbackNotice}</p>

      <div class="feedback-actions">
        <button class="feedback-submit" type="submit" data-copy="feedbackSubmit">${copy.feedbackSubmit}</button>
        <p class="feedback-result" data-form-result role="status" aria-live="polite"></p>
      </div>
    </form>
  `;
}

function renderColumns(copy) {
  return FEEDBACK_STATUSES.map(
    (status) => `
      <section class="feedback-column" data-column="${status}" aria-labelledby="feedback-column-${status}">
        <header class="feedback-column__head">
          <span class="feedback-column__mark" aria-hidden="true"></span>
          <h3 id="feedback-column-${status}" data-copy="${COLUMN_COPY[status]}">${copy[COLUMN_COPY[status]]}</h3>
          <span class="feedback-column__count" data-column-count>–</span>
        </header>
        <ol class="feedback-column__list" data-column-list></ol>
      </section>
    `,
  ).join("");
}

export function renderFeedbackShell(root, copy, locale) {
  root.className = "changelog-page feedback-page";
  root.dataset.boardState = "loading";
  root.innerHTML = `
    ${renderTopbar(copy, locale)}

    <section class="changelog-intro" aria-labelledby="feedback-title">
      <h1 id="feedback-title" data-copy="feedbackTitle">${copy.feedbackTitle}</h1>
      <p class="changelog-intro__body" data-copy="feedbackIntro">${copy.feedbackIntro}</p>
    </section>

    <div class="feedback-workspace">
      ${renderForm(copy)}
      <section class="feedback-board" aria-labelledby="feedback-board-title" aria-busy="true">
        <header class="feedback-board__head">
          <h2 id="feedback-board-title" class="feedback-heading" data-copy="feedbackBoardTitle">${copy.feedbackBoardTitle}</h2>
          <p class="feedback-board__status" data-board-status data-copy="feedbackLoading">${copy.feedbackLoading}</p>
        </header>
        <div class="feedback-columns">${renderColumns(copy)}</div>
      </section>
    </div>
  `;
}

function formatDay(value, locale) {
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short" }).format(
    new Date(value),
  );
}

function createCard(item, copy, locale, index) {
  const card = document.createElement("li");
  card.className = "feedback-card";
  card.style.setProperty("--card-index", String(Math.min(index, 8)));

  const meta = document.createElement("div");
  meta.className = "feedback-card__meta";

  const category = document.createElement("span");
  category.className = "feedback-card__tag";
  category.dataset.category = item.category;
  category.dataset.copy = CATEGORY_COPY[item.category];
  category.textContent = copy[CATEGORY_COPY[item.category]];

  const id = document.createElement("span");
  id.textContent = item.id;

  meta.append(category, id);

  // User-submitted text: always textContent, never markup.
  const title = document.createElement("p");
  title.className = "feedback-card__title";
  title.textContent = item.title;

  const time = document.createElement("time");
  time.className = "feedback-card__time";
  time.dateTime = item.updatedAt;
  time.dataset.feedbackDate = item.updatedAt;
  time.textContent = formatDay(item.updatedAt, locale);

  card.append(meta, title, time);
  return card;
}

function setBoardStatus(root, state, copyKey, copy, retryable = false) {
  const status = root.querySelector("[data-board-status]");
  root.dataset.boardState = state;
  root.querySelector(".feedback-board")?.setAttribute("aria-busy", String(state === "loading"));

  if (!status) {
    throw new Error("Feedback board status is missing.");
  }

  status.hidden = copyKey === null;

  if (copyKey === null) {
    return;
  }

  status.dataset.copy = copyKey;
  status.replaceChildren(document.createTextNode(copy[copyKey]));

  if (retryable) {
    const retry = document.createElement("button");
    retry.type = "button";
    retry.dataset.boardRetry = "";
    retry.dataset.copy = "changelogRetry";
    retry.textContent = copy.changelogRetry;
    status.append(document.createTextNode(" "), retry);
  }
}

export function renderBoardLoading(root, copy) {
  setBoardStatus(root, "loading", "feedbackLoading", copy);
}

export function renderBoardError(root, copy) {
  setBoardStatus(root, "error", "feedbackError", copy, true);
}

export function renderBoard(root, board, copy, locale) {
  for (const status of FEEDBACK_STATUSES) {
    const column = root.querySelector(`[data-column="${status}"]`);
    const list = column?.querySelector("[data-column-list]");
    const count = column?.querySelector("[data-column-count]");

    if (!list || !count) {
      throw new Error(`Feedback column "${status}" is missing.`);
    }

    const items = board[status];
    count.textContent = String(items.length);

    if (items.length === 0) {
      const empty = document.createElement("li");
      empty.className = "feedback-column__empty";
      empty.dataset.copy = "feedbackEmptyColumn";
      empty.textContent = copy.feedbackEmptyColumn;
      list.replaceChildren(empty);
      continue;
    }

    list.replaceChildren(...items.map((item, index) => createCard(item, copy, locale, index)));
  }

  setBoardStatus(root, "ready", null, copy);
}

/** @param {"idle" | "sending" | "sent" | "error"} state */
export function renderFormResult(root, state, copyKey, copy) {
  const form = root.querySelector(".feedback-form");
  const result = root.querySelector("[data-form-result]");
  const submit = root.querySelector(".feedback-submit");

  if (!form || !result || !submit) {
    throw new Error("Feedback form is missing.");
  }

  form.dataset.state = state;
  submit.disabled = state === "sending";
  submit.dataset.copy = state === "sending" ? "feedbackSending" : "feedbackSubmit";
  submit.textContent = copy[submit.dataset.copy];

  if (copyKey === null) {
    delete result.dataset.copy;
    result.textContent = "";
    return;
  }

  result.dataset.copy = copyKey;
  result.textContent = copy[copyKey];
}

export function updateFeedbackLocale(root, copy, locale) {
  for (const node of root.querySelectorAll("[data-copy]")) {
    const text = copy[node.dataset.copy];

    if (typeof text === "string") {
      node.firstChild?.remove();
      node.prepend(document.createTextNode(text));
    }
  }

  for (const node of root.querySelectorAll("[data-copy-placeholder]")) {
    node.placeholder = copy[node.dataset.copyPlaceholder] ?? node.placeholder;
  }

  root.querySelector(".changelog-brand")?.setAttribute("aria-label", copy.navProduct);

  const langGroup = root.querySelector(".changelog-topbar__lang");

  if (langGroup) {
    langGroup.setAttribute("aria-label", copy.localeLabel);
    langGroup.dataset.active = locale;

    for (const button of langGroup.querySelectorAll("button[data-locale]")) {
      button.setAttribute("aria-pressed", String(button.dataset.locale === locale));
    }
  }

  for (const time of root.querySelectorAll("time[data-feedback-date]")) {
    time.textContent = formatDay(time.dataset.feedbackDate, locale);
  }
}
