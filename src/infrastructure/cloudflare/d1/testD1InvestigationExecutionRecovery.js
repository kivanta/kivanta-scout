/*
 * D1 Investigation Execution Recovery Test
 *
 * Tests:
 *
 *   createD1InvestigationExecutionRecovery()
 *
 *
 * Recovery predicate:
 *
 * PREPARING_REVIEW
 *        +
 * lease missing / released / expired
 *        +
 * NO terminal execution
 *        ↓
 * recoverable
 *
 *
 * We verify:
 *
 * 1. invalid timestamp is rejected
 * 2. empty database returns zero recoverable rows
 * 3. missing lease is recoverable
 * 4. released lease is recoverable
 * 5. expired lease is recoverable
 * 6. active lease is NOT recoverable
 * 7. historical RUNNING execution does NOT block recovery
 * 8. COMPLETE execution blocks recovery
 * 9. PARTIAL execution blocks recovery
 * 10. FAILED execution blocks recovery
 * 11. non-PREPARING_REVIEW investigation is excluded
 * 12. lease metadata is mapped correctly
 * 13. latest execution status is surfaced
 * 14. result limit is respected
 */

import assert from "node:assert/strict";

import { readFileSync } from "node:fs";

import { dirname, resolve } from "node:path";

import { fileURLToPath } from "node:url";

import { DatabaseSync } from "node:sqlite";

import { createD1InvestigationExecutionRecovery } from "./d1InvestigationExecutionRecovery.js";

/*
 * =================================================
 * LOCAL D1 TEST WRAPPER
 * =================================================
 */

class TestD1Statement {
  constructor(database, sql) {
    this.database = database;

    this.sql = sql;

    this.values = [];
  }

  bind(...values) {
    this.values = values;

    return this;
  }

  async first() {
    const statement = this.database.prepare(this.sql);

    return statement.get(...this.values) || null;
  }

  async all() {
    const statement = this.database.prepare(this.sql);

    return {
      results: statement.all(...this.values),
    };
  }

  async run() {
    const statement = this.database.prepare(this.sql);

    const result = statement.run(...this.values);

    return {
      success: true,

      meta: {
        changes: Number(result.changes || 0),
      },
    };
  }
}

class TestD1Database {
  constructor(database) {
    this.database = database;
  }

  prepare(sql) {
    return new TestD1Statement(this.database, sql);
  }
}

/*
 * =================================================
 * DATABASE SETUP
 * =================================================
 */

const currentFile = fileURLToPath(import.meta.url);

const currentDirectory = dirname(currentFile);

function readMigration(filename) {
  return readFileSync(
    resolve(currentDirectory, `../../../../migrations/${filename}`),

    "utf8",
  );
}

const sqlite = new DatabaseSync(":memory:");

sqlite.exec("PRAGMA foreign_keys = ON;");

sqlite.exec(readMigration("0001_initial.sql"));

sqlite.exec(readMigration("0002_execution_leases.sql"));

sqlite.exec(readMigration("0003_investigation_executions.sql"));

const db = new TestD1Database(sqlite);

const recovery = createD1InvestigationExecutionRecovery(db);

/*
 * =================================================
 * FIXTURE HELPERS
 * =================================================
 */

const NOW = "2026-09-07T16:00:00.000Z";

function insertInvestigation({
  investigationId,

  lifecycleState = "PREPARING_REVIEW",

  updatedAt = "2026-09-07T15:00:00.000Z",
} = {}) {
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
      VALUES (
        ?,
        ?,
        ?,
        'github',
        ?,
        ?,
        'kivanta-scout-methodology',
        '1.0',
        ?,
        ?,
        NULL
      )
      `,
    )
    .run(
      investigationId,

      "2026-09-07T14:00:00.000Z",

      updatedAt,

      `repo_${investigationId}`,

      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",

      lifecycleState,

      JSON.stringify({
        fixture: investigationId,
      }),
    );
}

function insertLease({
  investigationId,

  leaseToken,

  attempt = 1,

  acquiredAt = "2026-09-07T15:00:00.000Z",

  heartbeatAt = "2026-09-07T15:00:00.000Z",

  expiresAt = "2026-09-07T15:30:00.000Z",

  releasedAt = null,
} = {}) {
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
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run(
      investigationId,

      leaseToken,

      attempt,

      acquiredAt,

      heartbeatAt,

      expiresAt,

      releasedAt,
    );
}

function insertExecution({
  executionId,

  investigationId,

  leaseToken,

  attempt = 1,

  executionStatus = "RUNNING",

  startedAt = "2026-09-07T15:05:00.000Z",

  completedAt = null,
} = {}) {
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
      VALUES (
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        NULL,
        NULL,
        ?,
        ?
      )
      `,
    )
    .run(
      executionId,

      investigationId,

      leaseToken,

      attempt,

      executionStatus,

      startedAt,

      completedAt,

      startedAt,

      completedAt || startedAt,
    );
}

/*
 * =================================================
 * TEST 1
 * INVALID TIMESTAMP
 * =================================================
 */

console.log("\n===== INVALID RECOVERY TIMESTAMP =====");

const invalidTimestampResult = await recovery.getRecoverableInvestigations({
  now: "not-a-date",
});

console.dir(invalidTimestampResult, {
  depth: null,
});

assert.equal(
  invalidTimestampResult.status,
  "recoverable_investigations_query_failed",
);

assert.equal(invalidTimestampResult.reason, "valid_now_timestamp_required");

assert.equal(invalidTimestampResult.count, 0);

/*
 * =================================================
 * TEST 2
 * EMPTY DATABASE
 * =================================================
 */

console.log("\n===== EMPTY RECOVERY SWEEP =====");

const emptyResult = await recovery.getRecoverableInvestigations({
  now: NOW,
});

console.dir(emptyResult, {
  depth: null,
});

assert.equal(emptyResult.status, "recoverable_investigations_found");

assert.equal(emptyResult.count, 0);

assert.deepEqual(emptyResult.investigations, []);

/*
 * =================================================
 * TEST 3
 * MISSING LEASE
 * =================================================
 */

insertInvestigation({
  investigationId: "inv_missing_lease",

  updatedAt: "2026-09-07T15:01:00.000Z",
});

/*
 * =================================================
 * TEST 4
 * RELEASED LEASE
 * =================================================
 */

insertInvestigation({
  investigationId: "inv_released_lease",

  updatedAt: "2026-09-07T15:02:00.000Z",
});

insertLease({
  investigationId: "inv_released_lease",

  leaseToken: "lease_released",

  attempt: 2,

  expiresAt: "2026-09-07T17:00:00.000Z",

  releasedAt: "2026-09-07T15:20:00.000Z",
});

/*
 * =================================================
 * TEST 5
 * EXPIRED LEASE
 * =================================================
 */

insertInvestigation({
  investigationId: "inv_expired_lease",

  updatedAt: "2026-09-07T15:03:00.000Z",
});

insertLease({
  investigationId: "inv_expired_lease",

  leaseToken: "lease_expired",

  attempt: 3,

  expiresAt: "2026-09-07T15:59:00.000Z",
});

/*
 * =================================================
 * TEST 6
 * ACTIVE LEASE — MUST NOT RECOVER
 * =================================================
 */

insertInvestigation({
  investigationId: "inv_active_lease",

  updatedAt: "2026-09-07T15:04:00.000Z",
});

insertLease({
  investigationId: "inv_active_lease",

  leaseToken: "lease_active",

  attempt: 1,

  expiresAt: "2026-09-07T16:30:00.000Z",
});

/*
 * =================================================
 * TEST 7
 * HISTORICAL RUNNING EXECUTION
 * =================================================
 *
 * RUNNING does not block recovery once ownership
 * has expired.
 */

insertInvestigation({
  investigationId: "inv_running_expired",

  updatedAt: "2026-09-07T15:05:00.000Z",
});

insertLease({
  investigationId: "inv_running_expired",

  leaseToken: "lease_running_expired",

  attempt: 1,

  expiresAt: "2026-09-07T15:45:00.000Z",
});

insertExecution({
  executionId: "exec_running_expired",

  investigationId: "inv_running_expired",

  leaseToken: "lease_running_expired",

  attempt: 1,

  executionStatus: "RUNNING",
});

/*
 * =================================================
 * TEST 8
 * COMPLETE BLOCKS RECOVERY
 * =================================================
 */

insertInvestigation({
  investigationId: "inv_complete",

  updatedAt: "2026-09-07T15:06:00.000Z",
});

insertLease({
  investigationId: "inv_complete",

  leaseToken: "lease_complete",

  expiresAt: "2026-09-07T15:30:00.000Z",
});

insertExecution({
  executionId: "exec_complete",

  investigationId: "inv_complete",

  leaseToken: "lease_complete",

  executionStatus: "COMPLETE",

  completedAt: "2026-09-07T15:20:00.000Z",
});

/*
 * =================================================
 * TEST 9
 * PARTIAL BLOCKS RECOVERY
 * =================================================
 */

insertInvestigation({
  investigationId: "inv_partial",

  updatedAt: "2026-09-07T15:07:00.000Z",
});

insertLease({
  investigationId: "inv_partial",

  leaseToken: "lease_partial",

  expiresAt: "2026-09-07T15:30:00.000Z",
});

insertExecution({
  executionId: "exec_partial",

  investigationId: "inv_partial",

  leaseToken: "lease_partial",

  executionStatus: "PARTIAL",

  completedAt: "2026-09-07T15:21:00.000Z",
});

/*
 * =================================================
 * TEST 10
 * FAILED BLOCKS RECOVERY
 * =================================================
 */

insertInvestigation({
  investigationId: "inv_failed",

  updatedAt: "2026-09-07T15:08:00.000Z",
});

insertLease({
  investigationId: "inv_failed",

  leaseToken: "lease_failed",

  expiresAt: "2026-09-07T15:30:00.000Z",
});

insertExecution({
  executionId: "exec_failed",

  investigationId: "inv_failed",

  leaseToken: "lease_failed",

  executionStatus: "FAILED",

  completedAt: "2026-09-07T15:22:00.000Z",
});

/*
 * =================================================
 * TEST 11
 * NON-PREPARING INVESTIGATION EXCLUDED
 * =================================================
 */

insertInvestigation({
  investigationId: "inv_queued",

  lifecycleState: "QUEUED",

  updatedAt: "2026-09-07T15:09:00.000Z",
});

/*
 * =================================================
 * MAIN RECOVERY QUERY
 * =================================================
 */

console.log("\n===== RECOVERABLE INVESTIGATIONS =====");

const recoveryResult = await recovery.getRecoverableInvestigations({
  now: NOW,

  limit: 25,
});

console.dir(recoveryResult, {
  depth: null,
});

assert.equal(recoveryResult.status, "recoverable_investigations_found");

assert.equal(recoveryResult.reason, null);

/*
 * Expected recoverable:
 *
 * - missing lease
 * - released lease
 * - expired lease
 * - expired lease + RUNNING historical execution
 */

assert.equal(recoveryResult.count, 4);

const byId = new Map(
  recoveryResult.investigations.map((item) => [item.investigationId, item]),
);

/*
 * =================================================
 * ASSERT RECOVERABLE CASES
 * =================================================
 */

assert.equal(byId.has("inv_missing_lease"), true);

assert.equal(byId.get("inv_missing_lease").leaseState, "MISSING");

assert.equal(byId.get("inv_missing_lease").leaseAttempt, null);

assert.equal(byId.get("inv_missing_lease").leaseExpiresAt, null);

assert.equal(byId.has("inv_released_lease"), true);

assert.equal(byId.get("inv_released_lease").leaseState, "RELEASED");

assert.equal(byId.get("inv_released_lease").leaseAttempt, 2);

assert.equal(byId.has("inv_expired_lease"), true);

assert.equal(byId.get("inv_expired_lease").leaseState, "EXPIRED");

assert.equal(byId.get("inv_expired_lease").leaseAttempt, 3);

assert.equal(
  byId.get("inv_expired_lease").leaseExpiresAt,
  "2026-09-07T15:59:00.000Z",
);

assert.equal(byId.has("inv_running_expired"), true);

assert.equal(byId.get("inv_running_expired").latestExecutionStatus, "RUNNING");

/*
 * =================================================
 * ASSERT EXCLUDED CASES
 * =================================================
 */

assert.equal(byId.has("inv_active_lease"), false);

assert.equal(byId.has("inv_complete"), false);

assert.equal(byId.has("inv_partial"), false);

assert.equal(byId.has("inv_failed"), false);

assert.equal(byId.has("inv_queued"), false);

/*
 * =================================================
 * TEST 14
 * LIMIT
 * =================================================
 */

console.log("\n===== RECOVERY LIMIT =====");

const limitedResult = await recovery.getRecoverableInvestigations({
  now: NOW,

  limit: 1,
});

console.dir(limitedResult, {
  depth: null,
});

assert.equal(limitedResult.status, "recoverable_investigations_found");

assert.equal(limitedResult.count, 1);

assert.equal(limitedResult.investigations.length, 1);

/*
 * Oldest updated_at should come first.
 */

assert.equal(
  limitedResult.investigations[0].investigationId,
  "inv_missing_lease",
);

/*
 * =================================================
 * FINAL
 * =================================================
 */

console.log("\n===== D1 INVESTIGATION EXECUTION RECOVERY TEST PASSED =====");

console.log({
  invalidTimestampRejected: true,

  emptySweepHandled: true,

  missingLeaseRecoverable: true,

  releasedLeaseRecoverable: true,

  expiredLeaseRecoverable: true,

  activeLeaseExcluded: true,

  runningExecutionRecoverable: true,

  completeExecutionExcluded: true,

  partialExecutionExcluded: true,

  failedExecutionExcluded: true,

  nonPreparingExcluded: true,

  recoveryMetadataMapped: true,

  limitRespected: true,
});

sqlite.close();
