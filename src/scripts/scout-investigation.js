/*
 * =========================================================
 * KIVANTA SCOUT
 * VISITOR INVESTIGATION WORKFLOW
 * =========================================================
 *
 * Connects the existing locked ScoutInput to:
 *
 * POST /api/investigations
 *          ↓
 * GET /api/investigations/:id
 *          ↓
 * GET /api/investigations/:id/result
 *
 *
 * TRUST RULES
 *
 * - use only the public API boundaries
 * - never read D1 directly
 * - never manufacture Methodology findings
 * - never convert operational failure to UNKNOWN
 * - never inject API strings through innerHTML
 * - render visitor-visible strings with textContent
 *
 *
 * The existing Hero markup remains untouched.
 */

/*
 * ---------------------------------------------------------
 * POLLING
 * ---------------------------------------------------------
 */

const POLL_INTERVAL_MS = 10_000;

const MAX_POLL_DURATION_MS = 10 * 60 * 1000;

/*
 * ---------------------------------------------------------
 * DOM
 * ---------------------------------------------------------
 */

const form = document.querySelector("#scout-input");

const referenceInput = document.querySelector("#scout-reference");

const submitButton = form?.querySelector(".scout-input__button");

const submitButtonLabel = submitButton?.querySelector("span");

const resultRegion = document.querySelector("#scout-result");

const resultTitle = document.querySelector("#scout-result-title");

const resultMessage = document.querySelector("#scout-result-message");

const resultContent = document.querySelector("#scout-result-content");

/*
 * Keep the original button label so repeated searches
 * restore the locked ScoutInput correctly.
 */

const originalButtonLabel =
  submitButtonLabel?.textContent?.trim() || "Scout it";

/*
 * ---------------------------------------------------------
 * BASIC HELPERS
 * ---------------------------------------------------------
 */

function delay(milliseconds) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

/*
 * Fetch JSON without trusting the body shape.
 */

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    cache: "no-store",

    ...options,
  });

  let body = null;

  try {
    body = await response.json();
  } catch {
    body = null;
  }

  return {
    response,

    body,
  };
}

/*
 * ---------------------------------------------------------
 * FORM STATE
 * ---------------------------------------------------------
 */

function setFormBusy(busy) {
  if (!form || !referenceInput || !submitButton) {
    return;
  }

  form.setAttribute("aria-busy", busy ? "true" : "false");

  referenceInput.disabled = busy;

  submitButton.disabled = busy;

  if (submitButtonLabel) {
    submitButtonLabel.textContent = busy ? "Scouting…" : originalButtonLabel;
  }
}

/*
 * ---------------------------------------------------------
 * RESULT REGION STATE
 * ---------------------------------------------------------
 */

function revealResultRegion() {
  if (!resultRegion) {
    return;
  }

  resultRegion.hidden = false;
}

function clearResultContent() {
  if (!resultContent) {
    return;
  }

  resultContent.replaceChildren();

  resultContent.hidden = true;
}

function showProgress(title, message) {
  revealResultRegion();

  clearResultContent();

  resultRegion?.setAttribute("aria-busy", "true");

  if (resultTitle) {
    resultTitle.textContent = title;
  }

  if (resultMessage) {
    resultMessage.textContent = message;
  }
}

function showFinalMessage(title, message) {
  revealResultRegion();

  clearResultContent();

  resultRegion?.setAttribute("aria-busy", "false");

  if (resultTitle) {
    resultTitle.textContent = title;
  }

  if (resultMessage) {
    resultMessage.textContent = message;
  }
}

/*
 * ---------------------------------------------------------
 * SAFE DOM CREATION
 * ---------------------------------------------------------
 *
 * Visitor-visible API values are always assigned through
 * textContent.
 *
 * No API-derived HTML is injected into the page.
 */

function createElement(tagName, className, text = null) {
  const element = document.createElement(tagName);

  if (className) {
    element.className = className;
  }

  if (text !== null && text !== undefined) {
    element.textContent = String(text);
  }

  return element;
}

function appendMetadata(parent, label, value) {
  if (!isNonEmptyString(value)) {
    return;
  }

  const row = createElement("p", "scout-result__metadata-row");

  const labelElement = createElement(
    "strong",
    "scout-result__metadata-label",
    `${label}: `,
  );

  row.append(labelElement, document.createTextNode(value.trim()));

  parent.append(row);
}

/*
 * ---------------------------------------------------------
 * LIFECYCLE COPY
 * ---------------------------------------------------------
 */

function showLifecycleState(lifecycleState) {
  switch (lifecycleState) {
    case "CREATED":
      showProgress(
        "Investigation accepted",
        "Scout has frozen the investigation target and is waiting for durable dispatch.",
      );

      break;

    case "QUEUED":
      showProgress(
        "Investigation queued",
        "Scout has queued the investigation and is preparing the frozen review.",
      );

      break;

    case "PREPARING_REVIEW":
      showProgress(
        "Investigating public evidence",
        "Scout is inspecting the frozen public source using Methodology 1.0.",
      );

      break;

    default:
      showProgress(
        "Investigation in progress",
        "Scout is continuing the investigation.",
      );
  }
}

/*
 * ---------------------------------------------------------
 * RESULT RENDERING
 * ---------------------------------------------------------
 *
 * This first visitor-facing version renders:
 *
 * - overall Methodology status
 * - methodology identity
 * - frozen source identity
 * - exact commit
 * - five check titles
 * - five check statuses
 * - established conclusions
 * - limitations when present
 *
 *
 * Detailed evidence-reference presentation comes in the
 * next UI checkpoint.
 */

function renderPublicResult(result) {
  if (!resultContent || !result) {
    showFinalMessage(
      "Result unavailable",
      "Scout completed the investigation, but the public result could not be displayed.",
    );

    return;
  }

  resultContent.replaceChildren();

  /*
   * -------------------------------------------------------
   * SUMMARY
   * -------------------------------------------------------
   */

  const summary = createElement("div", "scout-result__summary");

  const overall = createElement("p", "scout-result__overall");

  overall.append(
    createElement(
      "strong",
      "scout-result__overall-label",
      "Methodology result: ",
    ),

    document.createTextNode(
      isNonEmptyString(result.resultStatus)
        ? result.resultStatus
        : "Unavailable",
    ),
  );

  summary.append(overall);

  appendMetadata(summary, "Methodology", result.methodology?.id);

  appendMetadata(summary, "Version", result.methodology?.version);

  const owner = result.source?.owner;

  const repo = result.source?.repo;

  if (isNonEmptyString(owner) && isNonEmptyString(repo)) {
    appendMetadata(summary, "Source", `${owner}/${repo}`);
  }

  appendMetadata(summary, "Commit", result.source?.commitSha);

  resultContent.append(summary);

  /*
   * -------------------------------------------------------
   * FIVE METHODOLOGY CHECKS
   * -------------------------------------------------------
   */

  const checksHeading = createElement(
    "h3",
    "scout-result__checks-title",
    "Methodology checks",
  );

  resultContent.append(checksHeading);

  const checksContainer = createElement("div", "scout-result__checks");

  const checks = Array.isArray(result.checks) ? result.checks : [];

  for (const check of checks) {
    if (!check || typeof check !== "object") {
      continue;
    }

    const card = createElement("article", "scout-result__check");

    const headingRow = createElement("div", "scout-result__check-heading");

    const title = createElement(
      "h4",
      "scout-result__check-title",
      check.title || "Methodology check",
    );

    const status = createElement(
      "span",
      "scout-result__check-status",
      check.status || "UNKNOWN",
    );

    headingRow.append(title, status);

    card.append(headingRow);

    /*
     * Preserve null conclusions exactly.
     *
     * If Methodology did not establish a conclusion,
     * the UI does not manufacture replacement text.
     */

    if (isNonEmptyString(check.conclusion)) {
      card.append(
        createElement("p", "scout-result__check-conclusion", check.conclusion),
      );
    }

    if (isNonEmptyString(check.limitation)) {
      const limitation = createElement("p", "scout-result__check-limitation");

      limitation.append(
        createElement("strong", null, "Limitation: "),

        document.createTextNode(check.limitation.trim()),
      );

      card.append(limitation);
    }

    checksContainer.append(card);
  }

  resultContent.append(checksContainer);

  resultContent.hidden = false;

  resultRegion?.setAttribute("aria-busy", "false");

  if (resultTitle) {
    resultTitle.textContent = "Scout investigation complete";
  }

  if (resultMessage) {
    resultMessage.textContent =
      "The result below reflects only what Scout established from the frozen public evidence.";
  }
}

/*
 * ---------------------------------------------------------
 * LOAD TERMINAL RESULT
 * ---------------------------------------------------------
 */

async function loadPublicResult(investigationId) {
  const { response, body } = await fetchJson(
    `/api/investigations/${encodeURIComponent(investigationId)}/result`,
  );

  /*
   * A very small race can theoretically occur between
   * lifecycle polling and result availability.
   */

  if (response.status === 202 && body?.status === "result_not_ready") {
    showProgress(
      "Finalizing investigation",
      "Scout has completed the investigation and is preparing the public result.",
    );

    await delay(2_000);

    return loadPublicResult(investigationId);
  }

  /*
   * Operational failure remains operational failure.
   *
   * Do NOT convert this to UNKNOWN.
   */

  if (response.ok && body?.status === "investigation_failed") {
    showFinalMessage(
      "Investigation could not be completed",
      "Scout did not produce a Methodology finding for this investigation.",
    );

    return;
  }

  if (
    response.ok &&
    body?.status === "investigation_result_ready" &&
    body?.result
  ) {
    renderPublicResult(body.result);

    return;
  }

  throw new Error("public_result_not_available");
}

/*
 * ---------------------------------------------------------
 * POLL INVESTIGATION
 * ---------------------------------------------------------
 */

async function pollInvestigation(investigationId) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < MAX_POLL_DURATION_MS) {
    const { response, body } = await fetchJson(
      `/api/investigations/${encodeURIComponent(investigationId)}`,
    );

    if (
      !response.ok ||
      body?.status !== "investigation_found" ||
      !body?.investigation
    ) {
      throw new Error("investigation_status_not_available");
    }

    const lifecycleState = body.investigation.lifecycleState;

    if (
      lifecycleState === "COMPLETE" ||
      lifecycleState === "PARTIAL" ||
      lifecycleState === "FAILED"
    ) {
      await loadPublicResult(investigationId);

      return;
    }

    showLifecycleState(lifecycleState);

    await delay(POLL_INTERVAL_MS);
  }

  showFinalMessage(
    "Investigation still in progress",
    "Scout is taking longer than expected. The investigation has not been converted into a finding.",
  );
}

/*
 * ---------------------------------------------------------
 * INVALID REQUEST COPY
 * ---------------------------------------------------------
 */

function showInvalidReference(reason) {
  if (reason === "reference_required") {
    showFinalMessage(
      "Add a public reference",
      "Paste a public project or agent reference before starting Scout.",
    );

    return;
  }

  if (reason === "reference_too_long") {
    showFinalMessage(
      "Reference is too long",
      "Use the direct public website, GitHub repository, Technocore link, did:key, or ENS reference.",
    );

    return;
  }

  showFinalMessage(
    "Scout could not use that reference",
    "Try a public website, GitHub repository, Technocore link, did:key, or ENS reference.",
  );
}

/*
 * ---------------------------------------------------------
 * SUBMIT
 * ---------------------------------------------------------
 */

async function handleSubmit(event) {
  event.preventDefault();

  if (!form || !referenceInput || !submitButton) {
    return;
  }

  const reference = referenceInput.value.trim();

  if (!reference) {
    showInvalidReference("reference_required");

    return;
  }

  setFormBusy(true);

  showProgress(
    "Starting Scout",
    "Scout is resolving the public reference and checking whether a supported source can be established.",
  );

  try {
    const { response, body } = await fetchJson("/api/investigations", {
      method: "POST",

      headers: {
        "content-type": "application/json",
      },

      body: JSON.stringify({
        reference,
      }),
    });

    /*
     * -----------------------------------------------------
     * VISITOR INPUT ERROR
     * -----------------------------------------------------
     */

    if (body?.status === "invalid_request") {
      showInvalidReference(body.reason);

      return;
    }

    /*
     * -----------------------------------------------------
     * DISCOVERY ONLY
     * -----------------------------------------------------
     *
     * No Methodology findings exist in this state.
     */

    if (response.ok && body?.status === "discovery_only") {
      showFinalMessage(
        "Supported source not established",
        "Scout completed discovery but could not establish the supported public GitHub source required for Methodology 1.0. No Methodology findings were produced.",
      );

      return;
    }

    /*
     * -----------------------------------------------------
     * INVESTIGATION ACCEPTED
     * -----------------------------------------------------
     */

    if (
      response.status === 202 &&
      body?.status === "investigation_accepted" &&
      isNonEmptyString(body.investigationId)
    ) {
      const investigationId = body.investigationId.trim();

      /*
       * An exact review may already exist.
       *
       * COMPLETE / PARTIAL / FAILED can therefore be
       * returned immediately for a joined investigation.
       */

      if (
        body.lifecycleState === "COMPLETE" ||
        body.lifecycleState === "PARTIAL" ||
        body.lifecycleState === "FAILED"
      ) {
        await loadPublicResult(investigationId);

        return;
      }

      showLifecycleState(body.lifecycleState);

      await pollInvestigation(investigationId);

      return;
    }

    /*
     * -----------------------------------------------------
     * TEMPORARY SERVICE FAILURE
     * -----------------------------------------------------
     */

    throw new Error("investigation_request_not_accepted");
  } catch {
    showFinalMessage(
      "Scout is temporarily unavailable",
      "The investigation could not be started or completed right now. No Methodology finding was produced.",
    );
  } finally {
    setFormBusy(false);
  }
}

/*
 * ---------------------------------------------------------
 * START
 * ---------------------------------------------------------
 */

if (
  form &&
  referenceInput &&
  submitButton &&
  resultRegion &&
  resultTitle &&
  resultMessage &&
  resultContent
) {
  form.addEventListener("submit", handleSubmit);
}
