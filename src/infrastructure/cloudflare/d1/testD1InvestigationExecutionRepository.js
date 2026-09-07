/*
 * D1 Investigation Execution Repository Test
 *
 * Tests Scout's real durable execution repository
 * against the real migrations using an in-memory
 * SQLite database.
 *
 * This does NOT contact remote Cloudflare D1.
 *
 *
 * We verify:
 *
 * 1. repository satisfies application port
 * 2. current worker can create attempt 1
 * 3. duplicate attempt creation is rejected
 * 4. current worker can record outcome
 * 5. completed execution cannot be completed twice
 *
 * Then a stale-worker scenario:
 *
 * 6. Worker A creates attempt 1
 * 7. Worker A lease expires
 * 8. Worker B takes over attempt 2
 * 9. stale Worker A cannot write authoritative outcome
 * 10. Worker B can create attempt 2
 * 11. Worker B can record its outcome
 * 12. historical attempt 1 remains preserved
 */

import { DatabaseSync } from "node:sqlite";

import { readFileSync } from "node:fs";

import { createD1InvestigationExecutionRepository } from "./d1InvestigationExecutionRepository.js";

import { validateInvestigationExecutionRepository } from "../../../application/ports/investigationExecutionRepository.js";

/*
 * ------------------------------------------------
 * Minimal D1-compatible SQLite wrapper
 * ------------------------------------------------
 */

function createD1TestBinding(database) {
  function createStatement(sql, bindings = []) {
    return {
      sql,
      bindings,

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

/*
 * Apply the real Scout migrations.
 */

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
 * Helper: create investigation
 * ------------------------------------------------
 */

function insertInvestigation({ investigationId, repositoryId, commitSha }) {
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
      "2026-09-07T11:00:00.000Z",
      "2026-09-07T11:00:00.000Z",
      "github",
      repositoryId,
      commitSha,
      "kivanta-scout-methodology",
      "1.0",
      "PREPARING_REVIEW",
      JSON.stringify({
        fixture: true,
      }),
      null,
    );
}

/*
 * ------------------------------------------------
 * Helper: insert current execution lease
 * ------------------------------------------------
 */

function insertLease({
  investigationId,
  leaseToken,
  attempt,
  acquiredAt,
  expiresAt,
}) {
  sqlite
    .prepare(
      `
    INSERT INTO investigation_execution_leases (
      investigation_id,
      lease_token,
      attempt,
      acquired_at,
      heartbeat_at,
      expires_at,
      released_at
    )
    VALUES (?, ?, ?, ?, ?, ?, NULL)
  `,
    )
    .run(
      investigationId,
      leaseToken,
      attempt,
      acquiredAt,
      acquiredAt,
      expiresAt,
    );
}

/*
 * ------------------------------------------------
 * TEST 1
 * Repository satisfies application contract.
 * ------------------------------------------------
 */

const contractResult = validateInvestigationExecutionRepository(repository);

console.log("\n===== EXECUTION REPOSITORY CONTRACT =====");

console.dir(contractResult, {
  depth: null,
});

/*
 * =================================================
 * SCENARIO A
 *
 * Current worker completes normally.
 * =================================================
 */

const normalInvestigationId = "inv_execution_normal";

const normalLeaseToken = "lease_execution_normal";

const normalExecutionId = "exec_execution_normal";

insertInvestigation({
  investigationId: normalInvestigationId,

  repositoryId: "repo_execution_normal",

  commitSha: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
});

insertLease({
  investigationId: normalInvestigationId,

  leaseToken: normalLeaseToken,

  attempt: 1,

  acquiredAt: "2026-09-07T11:00:00.000Z",

  expiresAt: "2026-09-07T11:10:00.000Z",
});

/*
 * TEST 2
 * Current lease owner creates attempt 1.
 */

const normalCreateResult = await repository.createExecution({
  executionId: normalExecutionId,

  investigationId: normalInvestigationId,

  leaseToken: normalLeaseToken,

  attempt: 1,

  startedAt: "2026-09-07T11:01:00.000Z",
});

console.log("\n===== NORMAL EXECUTION CREATED =====");

console.dir(normalCreateResult, {
  depth: null,
});

/*
 * TEST 3
 * Duplicate durable attempt must be rejected.
 */

const duplicateCreateResult = await repository.createExecution({
  executionId: "exec_duplicate_attempt",

  investigationId: normalInvestigationId,

  leaseToken: normalLeaseToken,

  attempt: 1,

  startedAt: "2026-09-07T11:02:00.000Z",
});

console.log("\n===== DUPLICATE EXECUTION ATTEMPT =====");

console.dir(duplicateCreateResult, {
  depth: null,
});

/*
 * TEST 4
 * Current lease owner records a COMPLETE outcome.
 */

const normalOutcome = {
  executionStatus: "complete",

  resultStatus: "PASS",

  checks: [
    {
      check: 1,
      status: "PASS",
    },
  ],

  evidence: [
    {
      type: "fixture",
    },
  ],
};

const normalOutcomeResult = await repository.recordExecutionOutcome({
  executionId: normalExecutionId,

  investigationId: normalInvestigationId,

  leaseToken: normalLeaseToken,

  executionStatus: "COMPLETE",

  completedAt: "2026-09-07T11:03:00.000Z",

  analysisOutcome: normalOutcome,

  failureReason: null,
});

console.log("\n===== NORMAL EXECUTION OUTCOME =====");

console.dir(normalOutcomeResult, {
  depth: null,
});

/*
 * TEST 5
 * Completed execution cannot be completed again.
 */

const duplicateOutcomeResult = await repository.recordExecutionOutcome({
  executionId: normalExecutionId,

  investigationId: normalInvestigationId,

  leaseToken: normalLeaseToken,

  executionStatus: "FAILED",

  completedAt: "2026-09-07T11:04:00.000Z",

  analysisOutcome: null,

  failureReason: "should not overwrite completed execution",
});

console.log("\n===== DUPLICATE OUTCOME ATTEMPT =====");

console.dir(duplicateOutcomeResult, {
  depth: null,
});

/*
 * =================================================
 * SCENARIO B
 *
 * Stale worker protection.
 * =================================================
 */

const staleInvestigationId = "inv_execution_stale";

const workerAToken = "lease_execution_worker_a";

const workerBToken = "lease_execution_worker_b";

const workerAExecutionId = "exec_execution_worker_a";

const workerBExecutionId = "exec_execution_worker_b";

insertInvestigation({
  investigationId: staleInvestigationId,

  repositoryId: "repo_execution_stale",

  commitSha: "ffffffffffffffffffffffffffffffffffffffff",
});

/*
 * Worker A owns attempt 1.
 */

insertLease({
  investigationId: staleInvestigationId,

  leaseToken: workerAToken,

  attempt: 1,

  acquiredAt: "2026-09-07T12:00:00.000Z",

  expiresAt: "2026-09-07T12:05:00.000Z",
});

/*
 * TEST 6
 * Worker A creates execution attempt 1.
 */

const workerACreateResult = await repository.createExecution({
  executionId: workerAExecutionId,

  investigationId: staleInvestigationId,

  leaseToken: workerAToken,

  attempt: 1,

  startedAt: "2026-09-07T12:01:00.000Z",
});

console.log("\n===== WORKER A EXECUTION CREATED =====");

console.dir(workerACreateResult, {
  depth: null,
});

/*
 * ------------------------------------------------
 * Simulate lease expiry and Worker B takeover.
 *
 * The lease table keeps one current row per
 * investigation, so replace ownership and advance
 * the attempt to 2.
 * ------------------------------------------------
 */

sqlite
  .prepare(
    `
  UPDATE investigation_execution_leases
  SET
    lease_token = ?,
    attempt = 2,
    acquired_at = ?,
    heartbeat_at = ?,
    expires_at = ?,
    released_at = NULL
  WHERE investigation_id = ?
`,
  )
  .run(
    workerBToken,
    "2026-09-07T12:06:00.000Z",
    "2026-09-07T12:06:00.000Z",
    "2026-09-07T12:11:00.000Z",
    staleInvestigationId,
  );

/*
 * TEST 7
 * Worker A tries to record an outcome using its
 * stale token.
 *
 * This MUST fail.
 */

const staleWorkerOutcomeResult = await repository.recordExecutionOutcome({
  executionId: workerAExecutionId,

  investigationId: staleInvestigationId,

  leaseToken: workerAToken,

  executionStatus: "COMPLETE",

  completedAt: "2026-09-07T12:07:00.000Z",

  analysisOutcome: {
    resultStatus: "PASS",

    warning: "stale worker must not persist this",
  },

  failureReason: null,
});

console.log("\n===== STALE WORKER OUTCOME ATTEMPT =====");

console.dir(staleWorkerOutcomeResult, {
  depth: null,
});

/*
 * TEST 8
 * Worker B creates attempt 2.
 */

const workerBCreateResult = await repository.createExecution({
  executionId: workerBExecutionId,

  investigationId: staleInvestigationId,

  leaseToken: workerBToken,

  attempt: 2,

  startedAt: "2026-09-07T12:07:00.000Z",
});

console.log("\n===== WORKER B EXECUTION CREATED =====");

console.dir(workerBCreateResult, {
  depth: null,
});

/*
 * TEST 9
 * Worker B records its authoritative outcome.
 */

const workerBOutcomeResult = await repository.recordExecutionOutcome({
  executionId: workerBExecutionId,

  investigationId: staleInvestigationId,

  leaseToken: workerBToken,

  executionStatus: "PARTIAL",

  completedAt: "2026-09-07T12:09:00.000Z",

  analysisOutcome: {
    executionStatus: "partial",

    resultStatus: "UNKNOWN",

    limitations: ["fixture limitation"],
  },

  failureReason: null,
});

console.log("\n===== WORKER B OUTCOME RECORDED =====");

console.dir(workerBOutcomeResult, {
  depth: null,
});

/*
 * ------------------------------------------------
 * Read both historical attempts.
 * ------------------------------------------------
 */

const workerARead = await repository.getExecution(workerAExecutionId);

const workerBRead = await repository.getExecution(workerBExecutionId);

console.log("\n===== HISTORICAL ATTEMPT 1 =====");

console.dir(workerARead, {
  depth: null,
});

console.log("\n===== HISTORICAL ATTEMPT 2 =====");

console.dir(workerBRead, {
  depth: null,
});

/*
 * ------------------------------------------------
 * Inspect persisted history directly.
 * ------------------------------------------------
 */

const persistedAttempts = sqlite
  .prepare(
    `
    SELECT
      execution_id,
      investigation_id,
      lease_token,
      attempt,
      execution_status,
      completed_at,
      analysis_outcome_json,
      failure_reason
    FROM investigation_executions
    WHERE investigation_id = ?
    ORDER BY attempt ASC
  `,
  )
  .all(staleInvestigationId);

console.log("\n===== PERSISTED EXECUTION HISTORY =====");

console.dir(persistedAttempts, {
  depth: null,
});

/*
 * ------------------------------------------------
 * FINAL ASSERTIONS
 * ------------------------------------------------
 */

const tests = {
  contractReady: contractResult.status === "execution_repository_ready",

  normalExecutionCreated: normalCreateResult.status === "execution_created",

  normalStartsRunning:
    normalCreateResult.execution?.executionStatus === "RUNNING",

  normalAttemptIsOne: normalCreateResult.execution?.attempt === 1,

  duplicateAttemptRejected:
    duplicateCreateResult.status === "execution_not_created",

  normalOutcomeRecorded:
    normalOutcomeResult.status === "execution_outcome_recorded",

  normalOutcomeComplete:
    normalOutcomeResult.execution?.executionStatus === "COMPLETE",

  normalAnalysisOutcomePreserved:
    normalOutcomeResult.execution?.analysisOutcome?.resultStatus === "PASS",

  duplicateOutcomeRejected:
    duplicateOutcomeResult.status === "execution_outcome_not_recorded",

  workerAExecutionCreated: workerACreateResult.status === "execution_created",

  workerAAttemptIsOne: workerACreateResult.execution?.attempt === 1,

  staleWorkerWriteRejected:
    staleWorkerOutcomeResult.status === "execution_outcome_not_recorded" &&
    staleWorkerOutcomeResult.reason ===
      "stale_execution_lease_or_execution_not_running",

  workerBExecutionCreated: workerBCreateResult.status === "execution_created",

  workerBAttemptIsTwo: workerBCreateResult.execution?.attempt === 2,

  workerBOutcomeRecorded:
    workerBOutcomeResult.status === "execution_outcome_recorded",

  workerBOutcomePartial:
    workerBOutcomeResult.execution?.executionStatus === "PARTIAL",

  historicalAttemptOnePreserved:
    workerARead.status === "execution_found" &&
    workerARead.execution?.attempt === 1,

  staleAttemptOneStillRunning:
    workerARead.execution?.executionStatus === "RUNNING",

  historicalAttemptTwoPreserved:
    workerBRead.status === "execution_found" &&
    workerBRead.execution?.attempt === 2,

  persistedTwoAttempts: persistedAttempts.length === 2,

  persistedAttemptOrderCorrect:
    Number(persistedAttempts[0].attempt) === 1 &&
    Number(persistedAttempts[1].attempt) === 2,

  persistedAttemptOneNotOverwritten:
    persistedAttempts[0].execution_status === "RUNNING" &&
    persistedAttempts[0].completed_at === null,

  persistedAttemptTwoAuthoritative:
    persistedAttempts[1].execution_status === "PARTIAL",
};

const allPassed = Object.values(tests).every(Boolean);

console.log("\n===== D1 EXECUTION REPOSITORY TEST =====");

console.dir(tests, {
  depth: null,
});

if (!allPassed) {
  throw new Error("D1 investigation execution repository test failed.");
}

console.log("\n===== D1 EXECUTION REPOSITORY TEST PASSED =====");

/*
 * Close test database.
 */
sqlite.close();
