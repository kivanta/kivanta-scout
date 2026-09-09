/*
 * D1 Investigation Execution Repository
 * Latest Execution Test
 *
 * Permanently verifies:
 *
 * getLatestExecutionForInvestigation()
 *
 *
 * Required behavior:
 *
 * - newest attempt is returned
 * - terminal status is preserved
 * - failure reason is preserved
 * - analysis outcome remains readable
 * - investigation with no executions returns
 *   execution_not_found
 * - invalid investigation ID fails closed
 */

import { DatabaseSync } from "node:sqlite";

import { readFileSync } from "node:fs";

import { createD1InvestigationExecutionRepository } from "./d1InvestigationExecutionRepository.js";

/*
 * ------------------------------------------------
 * Minimal D1-compatible SQLite wrapper
 * ------------------------------------------------
 */

function createD1TestBinding(database) {
  function createStatement(sql, bindings = []) {
    return {
      bind(...values) {
        return createStatement(sql, values);
      },

      async first() {
        const statement = database.prepare(sql);

        return statement.get(...bindings) ?? null;
      },

      async all() {
        const statement = database.prepare(sql);

        return {
          success: true,

          results: statement.all(...bindings),
        };
      },

      async run() {
        const statement = database.prepare(sql);

        const result = statement.run(...bindings);

        return {
          success: true,

          meta: {
            changes: Number(result.changes ?? 0),
          },
        };
      },
    };
  }

  return {
    prepare(sql) {
      return createStatement(sql);
    },
  };
}

/*
 * ------------------------------------------------
 * Database setup
 * ------------------------------------------------
 */

const sqlite = new DatabaseSync(":memory:");

sqlite.exec("PRAGMA foreign_keys = ON;");

const migration0001 = readFileSync("migrations/0001_initial.sql", "utf8");

const migration0002 = readFileSync(
  "migrations/0002_execution_leases.sql",
  "utf8",
);

const migration0003 = readFileSync(
  "migrations/0003_investigation_executions.sql",
  "utf8",
);

sqlite.exec(migration0001);

sqlite.exec(migration0002);

sqlite.exec(migration0003);

const db = createD1TestBinding(sqlite);

const repository = createD1InvestigationExecutionRepository(db);

/*
 * ------------------------------------------------
 * Fixture investigation
 * ------------------------------------------------
 */

const investigationId = "inv_latest_execution_001";

sqlite
  .prepare(
    `
    INSERT INTO investigations (
      investigation_id,
      created_at,
      updated_at,
      provider,
      repository_id,
      commit_sha,
      methodology_id,
      methodology_version,
      lifecycle_state,
      target_json,
      failure_reason
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  )
  .run(
    investigationId,

    "2026-09-09T20:00:00.000Z",

    "2026-09-09T20:00:00.000Z",

    "github",

    "1363107590",

    "29d6f23d5671d19e776b48064de5149aa5c4c666",

    "kivanta-scout-methodology",

    "1.0",

    "PREPARING_REVIEW",

    JSON.stringify({
      fixture: true,
    }),

    null,
  );

/*
 * ------------------------------------------------
 * Historical attempt 1
 * ------------------------------------------------
 *
 * Simulates an earlier RUNNING attempt.
 */

sqlite
  .prepare(
    `
    INSERT INTO investigation_executions (
      execution_id,
      investigation_id,
      lease_token,
      attempt,
      execution_status,
      started_at,
      completed_at,
      analysis_outcome_json,
      failure_reason,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  )
  .run(
    "exec_latest_attempt_1",

    investigationId,

    "lease_latest_attempt_1",

    1,

    "RUNNING",

    "2026-09-09T20:01:00.000Z",

    null,

    null,

    null,

    "2026-09-09T20:01:00.000Z",

    "2026-09-09T20:01:00.000Z",
  );

/*
 * ------------------------------------------------
 * Latest attempt 2
 * ------------------------------------------------
 *
 * This is the durable terminal execution Scout
 * must discover during Queue redelivery.
 */

sqlite
  .prepare(
    `
    INSERT INTO investigation_executions (
      execution_id,
      investigation_id,
      lease_token,
      attempt,
      execution_status,
      started_at,
      completed_at,
      analysis_outcome_json,
      failure_reason,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  )
  .run(
    "exec_latest_attempt_2",

    investigationId,

    "lease_latest_attempt_2",

    2,

    "FAILED",

    "2026-09-09T20:10:29.811Z",

    "2026-09-09T20:10:30.337Z",

    JSON.stringify({
      status: "execution_failed",

      reason: "repository_not_available",
    }),

    "repository_not_available",

    "2026-09-09T20:10:29.811Z",

    "2026-09-09T20:10:30.337Z",
  );

/*
 * ------------------------------------------------
 * Read latest execution
 * ------------------------------------------------
 */

console.log("\n===== LATEST EXECUTION =====");

const latestResult =
  await repository.getLatestExecutionForInvestigation(investigationId);

console.dir(latestResult, {
  depth: null,
});

/*
 * ------------------------------------------------
 * No execution history
 * ------------------------------------------------
 */

const emptyInvestigationId = "inv_latest_execution_empty";

sqlite
  .prepare(
    `
    INSERT INTO investigations (
      investigation_id,
      created_at,
      updated_at,
      provider,
      repository_id,
      commit_sha,
      methodology_id,
      methodology_version,
      lifecycle_state,
      target_json,
      failure_reason
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  )
  .run(
    emptyInvestigationId,

    "2026-09-09T21:00:00.000Z",

    "2026-09-09T21:00:00.000Z",

    "github",

    "1363107591",

    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",

    "kivanta-scout-methodology",

    "1.0",

    "PREPARING_REVIEW",

    JSON.stringify({
      fixture: true,
    }),

    null,
  );

console.log("\n===== NO EXECUTION HISTORY =====");

const emptyResult =
  await repository.getLatestExecutionForInvestigation(emptyInvestigationId);

console.dir(emptyResult, {
  depth: null,
});

/*
 * ------------------------------------------------
 * Invalid input
 * ------------------------------------------------
 */

console.log("\n===== INVALID INVESTIGATION ID =====");

const invalidResult = await repository.getLatestExecutionForInvestigation("");

console.dir(invalidResult, {
  depth: null,
});

/*
 * ------------------------------------------------
 * FINAL ASSERTIONS
 * ------------------------------------------------
 */

const tests = {
  latestExecutionFound: latestResult.status === "execution_found",

  latestAttemptSelected: latestResult.execution?.attempt === 2,

  latestExecutionIdCorrect:
    latestResult.execution?.executionId === "exec_latest_attempt_2",

  latestStatusFailed: latestResult.execution?.executionStatus === "FAILED",

  failureReasonPreserved:
    latestResult.execution?.failureReason === "repository_not_available",

  completionTimePreserved:
    latestResult.execution?.completedAt === "2026-09-09T20:10:30.337Z",

  analysisOutcomeParsed:
    latestResult.execution?.analysisOutcome?.reason ===
    "repository_not_available",

  emptyHistoryNotFound:
    emptyResult.status === "execution_not_found" &&
    emptyResult.execution === null,

  invalidIdFailsClosed:
    invalidResult.status === "execution_query_failed" &&
    invalidResult.reason === "investigation_id_required",
};

const allPassed = Object.values(tests).every(Boolean);

console.log("\n===== LATEST EXECUTION TEST =====");

console.dir(tests, {
  depth: null,
});

if (!allPassed) {
  throw new Error("Latest investigation execution test failed.");
}

console.log("\n===== LATEST EXECUTION TEST PASSED =====");

sqlite.close();
