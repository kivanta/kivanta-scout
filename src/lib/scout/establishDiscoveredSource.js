import { assessGitHubSource } from "./assessGitHubSource.js";

export async function establishDiscoveredSource(
  correlation,
  { sourceAssessor = assessGitHubSource } = {},
) {
  if (correlation?.status !== "candidate_source" || !correlation?.candidate) {
    return {
      status: "source_not_established",

      reason: correlation?.reason || "candidate_source_not_established",

      correlation: correlation,
    };
  }

  const candidate = correlation.candidate;

  const sourceAssessment = await sourceAssessor(
    candidate.owner,
    candidate.repo,
  );

  if (sourceAssessment.status !== "supported_source") {
    return {
      status: "source_not_established",

      reason: sourceAssessment.reason || sourceAssessment.status,

      candidate: candidate,

      evidence: correlation.evidence || [],

      sourceAssessment: sourceAssessment,

      correlation: correlation,
    };
  }

  return {
    status: "supported_source",

    candidate: candidate,

    canonicalSource: {
      owner: candidate.owner,

      repo: candidate.repo,

      canonicalUrl: candidate.canonicalUrl,
    },

    evidence: correlation.evidence || [],

    sourceAssessment: sourceAssessment,

    correlation: correlation,
  };
}
