import { buildCheck5MaterialFacts } from "./buildCheck5MaterialFacts.js";
import { buildCheck5Result } from "./buildCheck5Result.js";

export async function runCheck5({ sourceAssessment, priorChecks }) {
  const title = "What Should I Know Before I Use It?";

  if (sourceAssessment?.status !== "supported_source") {
    return {
      status: "NOT_RUN",
      title: title,
      reason: "supported_source_required",
      considerations: [],
      precautions: [],
    };
  }

  if (!Array.isArray(priorChecks) || priorChecks.length === 0) {
    return {
      status: "UNKNOWN",
      title: title,
      reason: "prior_checks_not_available",
      considerations: [],
      precautions: [],
    };
  }

  const materialFacts = buildCheck5MaterialFacts(priorChecks);

  return buildCheck5Result(materialFacts);
}
