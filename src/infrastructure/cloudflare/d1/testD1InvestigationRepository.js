import assert from "node:assert/strict";

import { readFileSync } from "node:fs";

import { dirname, resolve } from "node:path";

import { fileURLToPath } from "node:url";

import { DatabaseSync } from "node:sqlite";

import { createD1InvestigationRepository } from "./d1InvestigationRepository.js";

/*
 * =================================================
 * LOCAL D1 TEST WRAPPER
 * =================================================
 *
 * Cloudflare provides a D1 binding in production.
 *
 * For this deterministic local test we create an
 * in-memory SQLite wrapper exposing the D1 methods
 * used by the repository:
 *
 * - prepare()
 * - bind()
 * - first()
 * - run()
 * - batch()
 *
 * Nothing here touches the real Cloudflare D1
 * database.
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

    const row = statement.get(...this.values);

    return row || null;
  }

  async run() {
    return this.runInsideTransaction();
  }

  runInsideTransaction() {
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

  /*
   * D1 batch() behaves transactionally.
   *
   * If one statement fails, every statement in
   * the batch must roll back.
   */

  async batch(statements) {
    this.database.exec("BEGIN");

    try {
      const results = [];

      for (const statement of statements) {
        results.push(statement.runInsideTransaction());
      }

      this.database.exec("COMMIT");

      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");

      throw error;
    }
  }
}

/*
 * =================================================
 * DATABASE SETUP
 * =================================================
 */

const currentFile = fileURLToPath(import.meta.url);

const currentDirectory = dirname(currentFile);

const migrationPath = resolve(
  currentDirectory,
  "../../../../migrations/0001_initial.sql",
);

const migrationSql = readFileSync(migrationPath, "utf8");

const sqlite = new DatabaseSync(":memory:");

sqlite.exec(migrationSql);

const db = new TestD1Database(sqlite);

const repository = createD1InvestigationRepository(db);

/*
 * =================================================
 * FIXTURES
 * =================================================
 */

const reviewKey = {
  provider: "github",

  repositoryId: "123456789",

  commitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",

  methodologyId: "kivanta-scout-methodology",

  methodologyVersion: "1.0",
};

const frozenTarget = {
  frozenAt: "2026-09-06T15:00:00.000Z",

  source: {
    repositoryId: "123456789",

    owner: "kivanta",

    repo: "fixture-agent",

    canonicalUrl: "https://github.com/kivanta/fixture-agent",

    defaultBranch: "main",

    commitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",

    treeSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  },

  methodology: {
    id: "kivanta-scout-methodology",

    version: "1.0",
  },
};

function createInvestigation({ investigationId, createdAt } = {}) {
  return {
    investigationId,

    createdAt,

    updatedAt: createdAt,

    reviewKey: {
      ...reviewKey,
    },

    lifecycleState: "CREATED",

    target: {
      ...frozenTarget,
    },

    failureReason: null,
  };
}

function getActiveClaimCount() {
  const row = sqlite
    .prepare(
      `
        SELECT COUNT(*) AS count
        FROM active_review_claims
        `,
    )
    .get();

  return Number(row.count);
}

function getActiveClaimInvestigationId() {
  const row = sqlite
    .prepare(
      `
        SELECT investigation_id
        FROM active_review_claims
        LIMIT 1
        `,
    )
    .get();

  return row?.investigation_id ?? null;
}

/*
 * =================================================
 * TEST 1
 * FIRST ACTIVE CLAIM
 * =================================================
 */

const firstInvestigation = createInvestigation({
  investigationId: "inv_test_001",

  createdAt: "2026-09-06T15:00:00.000Z",
});

const firstClaim =
  await repository.claimActiveInvestigation(firstInvestigation);

assert.equal(firstClaim.status, "investigation_claimed");

assert.equal(firstClaim.reason, null);

assert.equal(firstClaim.joinedExisting, false);

assert.equal(firstClaim.investigation.investigationId, "inv_test_001");

assert.equal(firstClaim.investigation.lifecycleState, "CREATED");

assert.equal(getActiveClaimCount(), 1);

assert.equal(getActiveClaimInvestigationId(), "inv_test_001");

console.log("\n===== FIRST CLAIM =====");

console.log({
  status: firstClaim.status,

  joinedExisting: firstClaim.joinedExisting,

  investigationId: firstClaim.investigation.investigationId,

  activeClaims: getActiveClaimCount(),
});

/*
 * =================================================
 * TEST 2
 * GET INVESTIGATION — FOUND ENVELOPE
 * =================================================
 */

const storedResult = await repository.getInvestigation("inv_test_001");

assert.equal(storedResult.status, "investigation_found");

assert.equal(storedResult.reason, null);

assert.ok(storedResult.investigation);

const storedInvestigation = storedResult.investigation;

assert.equal(storedInvestigation.investigationId, "inv_test_001");

assert.equal(storedInvestigation.lifecycleState, "CREATED");

assert.equal(storedInvestigation.reviewKey.methodologyVersion, "1.0");

assert.equal(storedInvestigation.reviewKey.repositoryId, "123456789");

assert.equal(
  storedInvestigation.target.source.commitSha,
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
);

/*
 * =================================================
 * TEST 3
 * MISSING INVESTIGATION ENVELOPE
 * =================================================
 */

const missingResult = await repository.getInvestigation("inv_missing");

assert.equal(missingResult.status, "investigation_not_found");

assert.equal(missingResult.reason, null);

assert.equal(missingResult.investigation, null);

/*
 * =================================================
 * TEST 4
 * INVALID INVESTIGATION QUERY
 * =================================================
 */

const invalidQueryResult = await repository.getInvestigation("");

assert.equal(invalidQueryResult.status, "investigation_query_failed");

assert.equal(invalidQueryResult.reason, "investigation_id_required");

assert.equal(invalidQueryResult.investigation, null);

/*
 * =================================================
 * TEST 5
 * DUPLICATE ACTIVE CLAIM
 * =================================================
 *
 * Same exact review key while inv_test_001 is still
 * active.
 *
 * The second D1 batch must fail on the unique active
 * claim, roll back, and return inv_test_001.
 */

const duplicateInvestigation = createInvestigation({
  investigationId: "inv_test_002",

  createdAt: "2026-09-06T15:05:00.000Z",
});

const duplicateClaim = await repository.claimActiveInvestigation(
  duplicateInvestigation,
);

assert.equal(duplicateClaim.status, "investigation_claimed");

assert.equal(duplicateClaim.reason, "active_investigation_exists");

assert.equal(duplicateClaim.joinedExisting, true);

assert.equal(duplicateClaim.investigation.investigationId, "inv_test_001");

const rolledBackResult = await repository.getInvestigation("inv_test_002");

assert.equal(rolledBackResult.status, "investigation_not_found");

assert.equal(rolledBackResult.investigation, null);

assert.equal(getActiveClaimCount(), 1);

assert.equal(getActiveClaimInvestigationId(), "inv_test_001");

console.log("\n===== DUPLICATE ACTIVE CLAIM =====");

console.log({
  joinedExisting: duplicateClaim.joinedExisting,

  returnedInvestigation: duplicateClaim.investigation.investigationId,

  activeClaims: getActiveClaimCount(),
});

/*
 * =================================================
 * TEST 6
 * OUTBOX CREATION
 * =================================================
 */

const outboxRow = sqlite
  .prepare(
    `
      SELECT
        investigation_id,
        event_type,
        dispatch_state,
        attempt_count

      FROM investigation_dispatch_outbox

      WHERE investigation_id = ?
      `,
  )
  .get("inv_test_001");

assert.ok(outboxRow);

assert.equal(outboxRow.investigation_id, "inv_test_001");

assert.equal(outboxRow.event_type, "INVESTIGATION_REQUESTED");

assert.equal(outboxRow.dispatch_state, "PENDING");

assert.equal(Number(outboxRow.attempt_count), 0);

const duplicateOutboxRow = sqlite
  .prepare(
    `
      SELECT investigation_id

      FROM investigation_dispatch_outbox

      WHERE investigation_id = ?
      `,
  )
  .get("inv_test_002");

assert.equal(duplicateOutboxRow, undefined);

/*
 * =================================================
 * TEST 7
 * NON-TERMINAL UPDATE KEEPS CLAIM
 * =================================================
 */

const activeUpdateResult = await repository.updateInvestigation(
  "inv_test_001",
  {
    lifecycleState: "PREPARING_REVIEW",

    updatedAt: "2026-09-06T15:10:00.000Z",

    failureReason: null,
  },
);

assert.equal(activeUpdateResult.status, "investigation_updated");

assert.equal(activeUpdateResult.reason, null);

assert.equal(
  activeUpdateResult.investigation.lifecycleState,
  "PREPARING_REVIEW",
);

assert.equal(getActiveClaimCount(), 1);

assert.equal(getActiveClaimInvestigationId(), "inv_test_001");

console.log("\n===== NON-TERMINAL UPDATE =====");

console.log({
  lifecycleState: activeUpdateResult.investigation.lifecycleState,

  activeClaims: getActiveClaimCount(),

  activeInvestigation: getActiveClaimInvestigationId(),
});

/*
 * =================================================
 * TEST 8
 * COMPLETE RELEASES CLAIM
 * =================================================
 */

const completeResult = await repository.updateInvestigation("inv_test_001", {
  lifecycleState: "COMPLETE",

  updatedAt: "2026-09-06T15:15:00.000Z",

  failureReason: null,
});

assert.equal(completeResult.status, "investigation_updated");

assert.equal(completeResult.reason, null);

assert.equal(completeResult.investigation.lifecycleState, "COMPLETE");

assert.equal(getActiveClaimCount(), 0);

assert.equal(getActiveClaimInvestigationId(), null);

console.log("\n===== COMPLETE RELEASE =====");

console.log({
  lifecycleState: completeResult.investigation.lifecycleState,

  activeClaims: getActiveClaimCount(),
});

/*
 * =================================================
 * TEST 9
 * SAME REVIEW CAN BE CLAIMED AFTER COMPLETE
 * =================================================
 *
 * This is the regression that failed in production:
 *
 * terminal investigation
 *      ↓
 * old claim remained
 *      ↓
 * identical future request joined old result
 *
 * After COMPLETE the exact same review identity must
 * be claimable again as fresh work.
 */

const afterCompleteInvestigation = createInvestigation({
  investigationId: "inv_test_003",

  createdAt: "2026-09-06T15:20:00.000Z",
});

const afterCompleteClaim = await repository.claimActiveInvestigation(
  afterCompleteInvestigation,
);

assert.equal(afterCompleteClaim.status, "investigation_claimed");

assert.equal(afterCompleteClaim.reason, null);

assert.equal(afterCompleteClaim.joinedExisting, false);

assert.equal(afterCompleteClaim.investigation.investigationId, "inv_test_003");

assert.equal(getActiveClaimCount(), 1);

assert.equal(getActiveClaimInvestigationId(), "inv_test_003");

console.log("\n===== RECLAIM AFTER COMPLETE =====");

console.log({
  joinedExisting: afterCompleteClaim.joinedExisting,

  investigationId: afterCompleteClaim.investigation.investigationId,

  activeClaims: getActiveClaimCount(),
});

/*
 * =================================================
 * TEST 10
 * PARTIAL RELEASES CLAIM
 * =================================================
 */

const partialResult = await repository.updateInvestigation("inv_test_003", {
  lifecycleState: "PARTIAL",

  updatedAt: "2026-09-06T15:25:00.000Z",

  failureReason: null,
});

assert.equal(partialResult.status, "investigation_updated");

assert.equal(partialResult.reason, null);

assert.equal(partialResult.investigation.lifecycleState, "PARTIAL");

assert.equal(getActiveClaimCount(), 0);

assert.equal(getActiveClaimInvestigationId(), null);

console.log("\n===== PARTIAL RELEASE =====");

console.log({
  lifecycleState: partialResult.investigation.lifecycleState,

  activeClaims: getActiveClaimCount(),
});

/*
 * =================================================
 * TEST 11
 * SAME REVIEW CAN BE CLAIMED AFTER PARTIAL
 * =================================================
 */

const afterPartialInvestigation = createInvestigation({
  investigationId: "inv_test_004",

  createdAt: "2026-09-06T15:30:00.000Z",
});

const afterPartialClaim = await repository.claimActiveInvestigation(
  afterPartialInvestigation,
);

assert.equal(afterPartialClaim.status, "investigation_claimed");

assert.equal(afterPartialClaim.reason, null);

assert.equal(afterPartialClaim.joinedExisting, false);

assert.equal(afterPartialClaim.investigation.investigationId, "inv_test_004");

assert.equal(getActiveClaimCount(), 1);

assert.equal(getActiveClaimInvestigationId(), "inv_test_004");

/*
 * =================================================
 * TEST 12
 * FAILED RELEASES CLAIM
 * =================================================
 */

const failedResult = await repository.updateInvestigation("inv_test_004", {
  lifecycleState: "FAILED",

  updatedAt: "2026-09-06T15:35:00.000Z",

  failureReason: "methodology_execution_failed",
});

assert.equal(failedResult.status, "investigation_updated");

assert.equal(failedResult.reason, null);

assert.equal(failedResult.investigation.lifecycleState, "FAILED");

assert.equal(
  failedResult.investigation.failureReason,
  "methodology_execution_failed",
);

assert.equal(getActiveClaimCount(), 0);

assert.equal(getActiveClaimInvestigationId(), null);

console.log("\n===== FAILED RELEASE =====");

console.log({
  lifecycleState: failedResult.investigation.lifecycleState,

  failureReason: failedResult.investigation.failureReason,

  activeClaims: getActiveClaimCount(),
});

/*
 * =================================================
 * TEST 13
 * SAME REVIEW CAN BE CLAIMED AFTER FAILED
 * =================================================
 */

const afterFailedInvestigation = createInvestigation({
  investigationId: "inv_test_005",

  createdAt: "2026-09-06T15:40:00.000Z",
});

const afterFailedClaim = await repository.claimActiveInvestigation(
  afterFailedInvestigation,
);

assert.equal(afterFailedClaim.status, "investigation_claimed");

assert.equal(afterFailedClaim.reason, null);

assert.equal(afterFailedClaim.joinedExisting, false);

assert.equal(afterFailedClaim.investigation.investigationId, "inv_test_005");

assert.equal(getActiveClaimCount(), 1);

assert.equal(getActiveClaimInvestigationId(), "inv_test_005");

console.log("\n===== RECLAIM AFTER FAILED =====");

console.log({
  joinedExisting: afterFailedClaim.joinedExisting,

  investigationId: afterFailedClaim.investigation.investigationId,

  activeClaims: getActiveClaimCount(),
});

/*
 * =================================================
 * TEST 14
 * UPDATE MISSING INVESTIGATION
 * =================================================
 */

const missingUpdateResult = await repository.updateInvestigation(
  "inv_missing",
  {
    lifecycleState: "PREPARING_REVIEW",

    updatedAt: "2026-09-06T15:45:00.000Z",
  },
);

assert.equal(missingUpdateResult.status, "investigation_not_updated");

assert.equal(missingUpdateResult.reason, "investigation_not_found");

assert.equal(missingUpdateResult.investigation, null);

/*
 * =================================================
 * FINAL
 * =================================================
 */

console.log("\n===== D1 REPOSITORY TEST PASSED =====");

console.log({
  firstClaim: true,

  retrievalEnvelope: true,

  missingEnvelope: true,

  duplicateProtectionWhileActive: true,

  batchRollback: true,

  outboxCreation: true,

  nonTerminalClaimPreserved: true,

  completeClaimReleased: true,

  partialClaimReleased: true,

  failedClaimReleased: true,

  reclaimAfterTerminalState: true,
});

sqlite.close();
