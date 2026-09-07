/*
 * Execute Prepared Scout Investigation
 *
 * Production composition service.
 *
 * This file joins the durable execution
 * orchestration to Scout's real Methodology
 * execution and persistence-safe outcome layer.
 *
 *
 * Flow:
 *
 * PREPARING_REVIEW
 *      ↓
 * executePreparedInvestigation()
 *      ↓
 * runFrozenMethodology()
 *      ↓
 * existing Scout Methodology 1.0
 *      ↓
 * preparePersistableMethodologyOutcome()
 *      ↓
 * durable execution outcome
 *
 *
 * IMPORTANT:
 *
 * This service contains no Methodology logic,
 * no D1 SQL, no Queue logic, and no publication
 * logic.
 *
 * It is deliberately only a composition boundary.
 */

import { executePreparedInvestigation } from "./executePreparedInvestigation.js";

import { runFrozenMethodology } from "./runFrozenMethodology.js";

import { preparePersistableMethodologyOutcome } from "./preparePersistableMethodologyOutcome.js";

/*
 * ------------------------------------------------
 * executePreparedScoutInvestigation
 * ------------------------------------------------
 *
 * Required runtime dependencies:
 *
 * prepared
 *   successful result from:
 *
 *   processQueuedInvestigation()
 *
 * executionRepository
 *   durable investigation execution repository
 *
 * executionLease
 *   durable execution-lease repository
 *
 *
 * Optional execution controls are forwarded to
 * executePreparedInvestigation():
 *
 * createExecutionId
 * startedAt
 * now
 *
 *
 * The second argument contains dependency seams
 * used by tests.
 *
 * Production callers normally omit it completely.
 */

export async function executePreparedScoutInvestigation(
  {
    prepared,

    executionRepository,

    executionLease,

    createExecutionId,

    startedAt,

    now,
  } = {},

  {
    executor = executePreparedInvestigation,

    methodologyRunner = runFrozenMethodology,

    persistableOutcomePreparer = preparePersistableMethodologyOutcome,
  } = {},
) {
  /*
   * =================================================
   * Validate composition dependencies
   * =================================================
   *
   * Lower application layers perform their own
   * detailed validation.
   *
   * These checks simply prevent a broken composition
   * boundary from being invoked.
   */

  if (typeof executor !== "function") {
    return {
      status: "scout_execution_not_ready",

      reason: "prepared_execution_service_required",
    };
  }

  if (typeof methodologyRunner !== "function") {
    return {
      status: "scout_execution_not_ready",

      reason: "frozen_methodology_runner_required",
    };
  }

  if (typeof persistableOutcomePreparer !== "function") {
    return {
      status: "scout_execution_not_ready",

      reason: "persistable_outcome_preparer_required",
    };
  }

  /*
   * =================================================
   * Compose real Scout execution
   * =================================================
   *
   * executePreparedInvestigation() already owns:
   *
   * - durable RUNNING execution creation
   * - lease-aware execution ownership
   * - Methodology execution
   * - persistence-safe outcome preparation
   * - COMPLETE / PARTIAL / FAILED persistence
   * - lease release
   *
   *
   * This service supplies the two real Scout
   * boundaries that its earlier unit test injected
   * as fakes:
   *
   *   runFrozenMethodology
   *
   *   preparePersistableMethodologyOutcome
   */

  return executor({
    prepared,

    executionRepository,

    executionLease,

    runMethodology: methodologyRunner,

    preparePersistableOutcome: persistableOutcomePreparer,

    createExecutionId,

    startedAt,

    now,
  });
}
