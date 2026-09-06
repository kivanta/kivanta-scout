import { assessGitHubSource } from "./assessGitHubSource.js";

import { runCheck1 } from "./runCheck1.js";
import { runCheck2 } from "./runCheck2.js";
import { runCheck3 } from "./runCheck3.js";
import { runCheck4 } from "./runCheck4.js";
import { runCheck5 } from "./runCheck5.js";

import { aggregateMethodologyResult } from "./aggregateMethodologyResult.js";

export async function runMethodology(
  owner,
  repo,
  {
    sourceAssessor = assessGitHubSource,

    check1Runner = runCheck1,
    check2Runner = runCheck2,
    check3Runner = runCheck3,
    check4Runner = runCheck4,
    check5Runner = runCheck5,
  } = {},
) {
  const sourceAssessment = await sourceAssessor(owner, repo);

  /*
   * Methodology 1.0 only runs after
   * Scout has established a supported source.
   */
  if (sourceAssessment.status !== "supported_source") {
    return {
      status: "methodology_not_run",

      reason: sourceAssessment.reason,

      sourceAssessment: sourceAssessment,

      checks: [],
    };
  }

  /*
   * A supported production investigation
   * must have one exact frozen commit.
   *
   * We do not fall back to the moving branch.
   */
  const commitSha = sourceAssessment.repository?.commitSha;

  if (!commitSha) {
    return {
      status: "methodology_not_run",

      reason: "frozen_source_snapshot_not_available",

      sourceAssessment: sourceAssessment,

      checks: [],
    };
  }

  /*
   * Existing check/evidence functions use
   * the name "branch" for a Git ref.
   *
   * We deliberately pass the immutable
   * commit SHA through that parameter.
   */
  const sharedInput = {
    owner: owner,

    repo: repo,

    branch: commitSha,

    sourceAssessment: sourceAssessment,

    tree: sourceAssessment.tree,

    python: sourceAssessment.python,

    technocoreEvidence: sourceAssessment.technocoreEvidence,

    toolIdentity: sourceAssessment.toolIdentity,
  };

  const check1 = await check1Runner(sharedInput);

  const check2 = await check2Runner(sharedInput);

  const check3 = await check3Runner(sharedInput);

  const check4 = await check4Runner(sharedInput);

  const priorChecks = [check1, check2, check3, check4];

  const check5 = await check5Runner({
    sourceAssessment: sourceAssessment,

    priorChecks: priorChecks,
  });

  const checks = [check1, check2, check3, check4, check5];

  const aggregation = aggregateMethodologyResult(checks);

  return {
    status: "methodology_run",

    executionStatus: aggregation.executionStatus,

    resultStatus: aggregation.resultStatus,

    sourceAssessment: sourceAssessment,

    checks: checks,

    aggregation: {
      status: aggregation.status,

      counts: aggregation.counts || null,

      unknownChecks: aggregation.unknownChecks || [],

      cautionChecks: aggregation.cautionChecks || [],

      notApplicableChecks: aggregation.notApplicableChecks || [],

      partialChecks: aggregation.partialChecks || [],

      failedChecks: aggregation.failedChecks || [],

      notRunChecks: aggregation.notRunChecks || [],
    },
  };
}
