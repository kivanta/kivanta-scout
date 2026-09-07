/*
 * Create GitHub Methodology Runner
 *
 * Production composition boundary for Scout's
 * hardened GitHub reads.
 *
 *
 * One injected request function is propagated to:
 *
 * frozen source assessment
 *      ├─ repository metadata
 *      ├─ commit
 *      ├─ tree
 *      └─ Technocore raw evidence
 *
 * Methodology checks
 *      ├─ Check 1 file evidence
 *      ├─ Check 2 file evidence
 *      └─ Check 3 file evidence
 *
 *
 * IMPORTANT:
 *
 * This file contains no Methodology rules.
 *
 * It only binds existing dependency seams.
 */

import { runFrozenMethodology } from "../../application/investigations/runFrozenMethodology.js";

import { assessFrozenGitHubSource } from "../../lib/scout/assessFrozenGitHubSource.js";

import { runMethodology } from "../../lib/scout/runMethodology.js";

import { runCheck1 } from "../../lib/scout/runCheck1.js";
import { runCheck2 } from "../../lib/scout/runCheck2.js";
import { runCheck3 } from "../../lib/scout/runCheck3.js";

import { collectCheck1Evidence } from "../../lib/scout/collectCheck1Evidence.js";
import { collectCheck2Evidence } from "../../lib/scout/collectCheck2Evidence.js";
import { collectCheck3Evidence } from "../../lib/scout/collectCheck3Evidence.js";

/*
 * ------------------------------------------------
 * Composition error
 * ------------------------------------------------
 */

function createCompositionError(code) {
  const error = new Error(code);

  error.code = code;

  return error;
}

/*
 * ------------------------------------------------
 * createGitHubMethodologyRunner
 * ------------------------------------------------
 *
 * request
 *
 *   Scout's hardened GitHub request function.
 *
 *
 * The second argument contains dependency seams
 * used by tests.
 */

export function createGitHubMethodologyRunner(
  { request } = {},

  {
    frozenMethodologyRunner = runFrozenMethodology,

    frozenSourceAssessor = assessFrozenGitHubSource,

    methodologyRunner = runMethodology,

    check1Runner = runCheck1,

    check2Runner = runCheck2,

    check3Runner = runCheck3,

    check1EvidenceCollector = collectCheck1Evidence,

    check2EvidenceCollector = collectCheck2Evidence,

    check3EvidenceCollector = collectCheck3Evidence,
  } = {},
) {
  /*
   * =================================================
   * Validate runtime request boundary
   * =================================================
   */

  if (typeof request !== "function") {
    throw createCompositionError("github_request_boundary_required");
  }

  /*
   * =================================================
   * Bind frozen source assessment
   * =================================================
   */

  const frozenSourceAssessorWithRequest = async (target) => {
    return frozenSourceAssessor(
      target,

      {
        request,
      },
    );
  };

  /*
   * =================================================
   * Bind Check 1 evidence
   * =================================================
   */

  const check1EvidenceCollectorWithRequest = async (input) => {
    return check1EvidenceCollector({
      ...input,

      request,
    });
  };

  const check1RunnerWithRequest = async (input) => {
    return check1Runner({
      ...input,

      evidenceCollector: check1EvidenceCollectorWithRequest,
    });
  };

  /*
   * =================================================
   * Bind Check 2 evidence
   * =================================================
   */

  const check2EvidenceCollectorWithRequest = async (input) => {
    return check2EvidenceCollector({
      ...input,

      request,
    });
  };

  const check2RunnerWithRequest = async (input) => {
    return check2Runner({
      ...input,

      evidenceCollector: check2EvidenceCollectorWithRequest,
    });
  };

  /*
   * =================================================
   * Bind Check 3 evidence
   * =================================================
   */

  const check3EvidenceCollectorWithRequest = async (input) => {
    return check3EvidenceCollector({
      ...input,

      request,
    });
  };

  const check3RunnerWithRequest = async (input) => {
    return check3Runner({
      ...input,

      evidenceCollector: check3EvidenceCollectorWithRequest,
    });
  };

  /*
   * =================================================
   * Bind existing Methodology 1.0 engine
   * =================================================
   *
   * runFrozenMethodology() supplies its frozen
   * sourceAssessor closure here.
   *
   * We preserve that closure exactly and only add
   * the hardened Check 1–3 runners.
   */

  const methodologyRunnerWithRequest = async (
    owner,
    repo,
    { sourceAssessor } = {},
  ) => {
    return methodologyRunner(
      owner,
      repo,

      {
        sourceAssessor,

        check1Runner: check1RunnerWithRequest,

        check2Runner: check2RunnerWithRequest,

        check3Runner: check3RunnerWithRequest,
      },
    );
  };

  /*
   * =================================================
   * Return production-compatible frozen runner
   * =================================================
   *
   * The returned function has the exact runner shape
   * expected by:
   *
   * executePreparedScoutInvestigation()
   */

  return async function githubMethodologyRunner(input) {
    return frozenMethodologyRunner(
      input,

      {
        frozenSourceAssessor: frozenSourceAssessorWithRequest,

        methodologyRunner: methodologyRunnerWithRequest,
      },
    );
  };
}
