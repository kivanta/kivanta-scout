/*
 * =========================================================
 * KIVANTA SCOUT
 * CHECK 2 RESULT BUILDER
 * =========================================================
 *
 * Check 2:
 *
 * "Your Key, Password & Sensitive Information"
 *
 *
 * RESULT RULES
 *
 * CAUTION
 * -------
 * Scout positively observes materially important sensitive
 * information being:
 *
 * - stored
 * - transmitted
 * - exposed
 *
 *
 * PASS — SENSITIVE HANDLING ESTABLISHED
 * -------------------------------------
 * Scout observes sensitive input/process handling, the
 * planned evidence scope is complete, and no material
 * storage/transmission/exposure is observed.
 *
 *
 * PASS — NO SENSITIVE HANDLING OBSERVED
 * -------------------------------------
 * The planned evidence scope was completely inspected and
 * Scout did not observe materially important sensitive-
 * information handling within that inspected source scope.
 *
 *
 * UNKNOWN
 * -------
 * Evidence is unavailable or partial and Scout has not
 * positively established a material concern.
 *
 *
 * PASS is always scoped to the inspected source snapshot.
 * It is never a universal safety guarantee.
 */

export function buildCheck2Result(summary) {
  const title = "Your Key, Password & Sensitive Information";

  /*
   * -------------------------------------------------------
   * SUMMARY NOT AVAILABLE
   * -------------------------------------------------------
   */

  if (summary?.status !== "summary_ready") {
    return {
      status: "UNKNOWN",

      title,

      conclusion:
        "Scout could not establish materially important sensitive-information handling from the available source evidence.",

      evidence: [],
    };
  }

  const lifecycle = summary.lifecycle || {};

  const evidence = Array.isArray(summary.categories) ? summary.categories : [];

  /*
   * -------------------------------------------------------
   * POSITIVE MATERIAL CONCERN
   * -------------------------------------------------------
   *
   * A positively observed material fact does not disappear
   * merely because another planned file was unavailable.
   */

  const materialConcern =
    lifecycle.sensitiveStorage ||
    lifecycle.sensitiveTransmission ||
    lifecycle.sensitiveExposure;

  if (materialConcern) {
    const result = {
      status: "CAUTION",

      title,

      conclusion:
        "Source evidence shows sensitive information being stored, transmitted, or exposed in a way a user should understand before use.",

      lifecycle,

      evidence,
    };

    if (!summary.evidenceComplete) {
      result.limitation =
        "Scout established this material concern from observed source evidence, but some planned evidence could not be collected.";
    }

    return result;
  }

  /*
   * -------------------------------------------------------
   * INCOMPLETE EVIDENCE WITHOUT ESTABLISHED CONCERN
   * -------------------------------------------------------
   *
   * Absence of a material concern in partial evidence is
   * not sufficient for PASS.
   */

  if (!summary.evidenceComplete) {
    return {
      status: "UNKNOWN",

      title,

      conclusion:
        "Scout did not establish a material sensitive-information concern, but some planned evidence could not be collected.",

      lifecycle,

      evidence,

      limitation:
        "Incomplete evidence prevents Scout from treating the absence of an observed concern as a PASS.",
    };
  }

  /*
   * -------------------------------------------------------
   * COMPLETE SCOPE — SENSITIVE HANDLING ESTABLISHED
   * -------------------------------------------------------
   */

  const sensitiveHandlingEstablished =
    lifecycle.sensitiveInput || lifecycle.sensitiveProcessUse;

  if (sensitiveHandlingEstablished) {
    return {
      status: "PASS",

      title,

      conclusion:
        "Within the inspected source scope, Scout established sensitive-information handling without observing material storage, transmission, or exposure.",

      lifecycle,

      evidence,

      limitation:
        "PASS is limited to the inspected source evidence and does not mean sensitive information is universally safe.",
    };
  }

  /*
   * -------------------------------------------------------
   * COMPLETE SCOPE — NO MATERIAL SENSITIVE HANDLING
   * -------------------------------------------------------
   */

  return {
    status: "PASS",

    title,

    conclusion:
      "Within the inspected source scope, Scout did not observe materially important sensitive-information handling.",

    lifecycle,

    evidence,

    limitation:
      "PASS is limited to the inspected source evidence and does not prove that sensitive information can never be introduced or handled elsewhere.",
  };
}
