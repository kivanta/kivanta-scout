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

console.log("\n===== FIRST CLAIM =====");

console.log({
  status: firstClaim.status,

  joinedExisting: firstClaim.joinedExisting,

  investigationId: firstClaim.investigation.investigationId,
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

console.log("\n===== GET INVESTIGATION =====");

console.log({
  status: storedResult.status,

  investigationId: storedInvestigation.investigationId,

  lifecycleState: storedInvestigation.lifecycleState,

  commitSha: storedInvestigation.reviewKey.commitSha,
});

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

console.log("\n===== MISSING INVESTIGATION =====");

console.log({
  status: missingResult.status,

  investigation: missingResult.investigation,
});

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
 * Same exact review key.
 *
 * The second D1 batch should fail on the unique
 * active claim, roll back, and return the existing
 * investigation instead.
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

/*
 * Because D1 batch() rolled back,
 * inv_test_002 must NOT exist.
 */

const rolledBackResult = await repository.getInvestigation("inv_test_002");

assert.equal(rolledBackResult.status, "investigation_not_found");

assert.equal(rolledBackResult.investigation, null);

console.log("\n===== DUPLICATE CLAIM =====");

console.log({
  status: duplicateClaim.status,

  joinedExisting: duplicateClaim.joinedExisting,

  returnedInvestigation: duplicateClaim.investigation.investigationId,

  duplicateRowPersisted: rolledBackResult.status !== "investigation_not_found",
});

/*
 * =================================================
 * TEST 6
 * ACTIVE CLAIM COUNT
 * =================================================
 */

const activeClaimCount = sqlite
  .prepare(
    `
      SELECT COUNT(*) AS count
      FROM active_review_claims
      `,
  )
  .get();

assert.equal(Number(activeClaimCount.count), 1);

/*
 * =================================================
 * TEST 7
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

/*
 * Duplicate batch rollback means there must be
 * no outbox record for inv_test_002.
 */

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

console.log("\n===== OUTBOX =====");

console.log({
  investigationId: outboxRow.investigation_id,

  eventType: outboxRow.event_type,

  dispatchState: outboxRow.dispatch_state,

  duplicateOutboxExists: Boolean(duplicateOutboxRow),
});

/*
 * =================================================
 * TEST 8
 * UPDATE INVESTIGATION
 * =================================================
 */

const updateResult = await repository.updateInvestigation(
  "inv_test_001",

  {
    lifecycleState: "PREPARING_REVIEW",

    updatedAt: "2026-09-06T15:10:00.000Z",

    failureReason: null,
  },
);

assert.equal(updateResult.status, "investigation_updated");

assert.equal(updateResult.reason, null);

assert.ok(updateResult.investigation);

assert.equal(updateResult.investigation.lifecycleState, "PREPARING_REVIEW");

assert.equal(updateResult.investigation.updatedAt, "2026-09-06T15:10:00.000Z");

console.log("\n===== UPDATE INVESTIGATION =====");

console.log({
  status: updateResult.status,

  lifecycleState: updateResult.investigation.lifecycleState,

  updatedAt: updateResult.investigation.updatedAt,
});

/*
 * =================================================
 * TEST 9
 * GET UPDATED INVESTIGATION
 * =================================================
 */

const updatedStoredResult = await repository.getInvestigation("inv_test_001");

assert.equal(updatedStoredResult.status, "investigation_found");

assert.equal(
  updatedStoredResult.investigation.lifecycleState,
  "PREPARING_REVIEW",
);

assert.equal(
  updatedStoredResult.investigation.updatedAt,
  "2026-09-06T15:10:00.000Z",
);

/*
 * =================================================
 * TEST 10
 * UPDATE MISSING INVESTIGATION
 * =================================================
 */

const missingUpdateResult = await repository.updateInvestigation(
  "inv_missing",

  {
    lifecycleState: "PREPARING_REVIEW",

    updatedAt: "2026-09-06T15:20:00.000Z",
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

  duplicateProtection: true,

  batchRollback: true,

  outboxCreation: true,

  lifecycleUpdate: true,
});

sqlite.close();
