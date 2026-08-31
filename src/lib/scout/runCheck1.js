import { buildCheck1EvidencePlan } from "./buildCheck1EvidencePlan.js";
import { collectCheck1Evidence } from "./collectCheck1Evidence.js";
import { extractCheck1Observations } from "./extractCheck1Observations.js";
import { summarizeCheck1Observations } from "./summarizeCheck1Observations.js";
import { buildCheck1Result } from "./buildCheck1Result.js";

export async function runCheck1({
  owner,
  repo,
  branch,
  sourceAssessment,
  tree,
  python,
  technocoreEvidence,
  toolIdentity,
  evidenceCollector = collectCheck1Evidence,
}) {
  if (sourceAssessment.status !== "supported_source") {
    return {
      status: "NOT_RUN",
      title: "What does this tool actually do?",
      reason: "supported_source_required",
      evidence: [],
    };
  }

  const evidencePlan = buildCheck1EvidencePlan({
    tree: tree,
    python: python,
    technocoreEvidence: technocoreEvidence,
    toolIdentity: toolIdentity,
  });

  if (evidencePlan.status !== "evidence_plan_ready") {
    return {
      status: "UNKNOWN",
      title: "What does this tool actually do?",
      reason: "evidence_plan_not_available",
      evidence: [],
    };
  }

  const evidence = await evidenceCollector({
    owner: owner,
    repo: repo,
    branch: branch,
    evidencePlan: evidencePlan,
  });

  const observations = extractCheck1Observations(evidence);

  const summary = summarizeCheck1Observations(observations);

  return buildCheck1Result(summary);
}
