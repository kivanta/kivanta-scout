import { assessGitHubSource } from "./assessGitHubSource.js";
import { runCheck1 } from "./runCheck1.js";

export async function runMethodology(
  owner,
  repo,
  { sourceAssessor = assessGitHubSource, check1Runner = runCheck1 } = {},
) {
  const sourceAssessment = await sourceAssessor(owner, repo);

  if (sourceAssessment.status !== "supported_source") {
    return {
      status: "methodology_not_run",
      reason: sourceAssessment.reason,
      sourceAssessment: sourceAssessment,
      checks: [],
    };
  }

  const check1 = await check1Runner({
    owner: owner,
    repo: repo,

    branch: sourceAssessment.repository.defaultBranch,

    sourceAssessment: sourceAssessment,

    tree: sourceAssessment.tree,

    python: sourceAssessment.python,

    technocoreEvidence: sourceAssessment.technocoreEvidence,

    toolIdentity: sourceAssessment.toolIdentity,
  });

  return {
    status: "methodology_run",
    sourceAssessment: sourceAssessment,

    checks: [check1],
  };
}
