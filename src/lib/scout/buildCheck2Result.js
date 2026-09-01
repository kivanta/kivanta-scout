export function buildCheck2Result(summary) {
  const title = "Your Key, Password & Sensitive Information";

  if (summary.status !== "summary_ready") {
    return {
      status: "UNKNOWN",
      title: title,
      conclusion:
        "Scout could not establish materially important sensitive-information handling from the available source evidence.",
      evidence: [],
    };
  }

  const lifecycle = summary.lifecycle || {};

  const materialConcern =
    lifecycle.sensitiveStorage ||
    lifecycle.sensitiveTransmission ||
    lifecycle.sensitiveExposure;

  if (materialConcern) {
    return {
      status: "CAUTION",
      title: title,
      conclusion:
        "Source evidence shows sensitive information being stored, transmitted, or exposed in a way a user should understand before use.",
      lifecycle: lifecycle,
      evidence: summary.categories,
    };
  }

  const sensitiveHandlingEstablished =
    lifecycle.sensitiveInput || lifecycle.sensitiveProcessUse;

  if (sensitiveHandlingEstablished) {
    return {
      status: "PASS",
      title: title,
      conclusion:
        "Within the inspected source scope, Scout established sensitive-information handling without observing material storage, transmission, or exposure.",
      lifecycle: lifecycle,
      evidence: summary.categories,
      limitation:
        "PASS is limited to the inspected source evidence and does not mean sensitive information is universally safe.",
    };
  }

  return {
    status: "UNKNOWN",
    title: title,
    conclusion:
      "Scout did not find enough evidence to establish how materially important sensitive information is handled.",
    lifecycle: lifecycle,
    evidence: summary.categories,
  };
}
