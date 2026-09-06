import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

import { createD1InvestigationRepository } from "./d1InvestigationRepository.js";

/*
 * =========================================================
 * LOCAL D1 TEST WRAPPER
 * =========================================================
 *
 * Cloudflare gives us a D1 binding in production.
 *
 * For this test, we create a small wrapper around
 * Node's in-memory SQLite database that exposes the
 * D1 methods our repository uses:
 *
 * - prepare()
 * - bind()
 * - first()
 * - run()
 * - batch()
 *
 * Nothing here touches the real Cloudflare database.
 * =========================================================
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
   * If any statement fails, all earlier
   * writes in the batch are rolled back.
   */
  async batch(statements) {
    this.database.exec("BEGIN IMMEDIATE TRANSACTION;");

    try {
      const results = [];

      for (const statement of statements) {
        results.push(statement.runInsideTransaction());
      }

      this.database.exec("COMMIT;");

      return results;
    } catch (error) {
      this.database.exec("ROLLBACK;");

      throw error;
    }
  }
}

/*
 * =========================================================
 * LOAD SCOUT'S REAL D1 MIGRATION
 * =========================================================
 */

const currentFile = fileURLToPath(import.meta.url);

const currentDirectory = dirname(currentFile);

const migrationPath = resolve(
  currentDirectory,
  "../../../../migrations/0001_initial.sql",
);

const migrationSql = readFileSync(migrationPath, "utf8");

/*
 * Temporary in-memory database.
 *
 * It disappears when this test finishes.
 */
const sqlite = new DatabaseSync(":memory:");

sqlite.exec(migrationSql);

const db = new TestD1Database(sqlite);

/*
 * Create Scout's real repository adapter
 * using our temporary D1-compatible binding.
 */
const repository = createD1InvestigationRepository(db);

/*
 * =========================================================
 * INVESTIGATION FIXTURE
 * =========================================================
 */

function createFixture(investigationId, createdAt) {
  return {
    investigationId: investigationId,

    createdAt: createdAt,

    updatedAt: createdAt,

    reviewKey: {
      provider: "github",

      repositoryId: 123456789,

      commitSha: "1111111111111111111111111111111111111111",

      methodologyId: "kivanta-scout-methodology",

      methodologyVersion: "1.0",
    },

    target: {
      frozenAt: "2026-09-06T12:00:00.000Z",

      source: {
        repositoryId: 123456789,

        owner: "example",

        repo: "scout-tool",

        canonicalUrl: "https://github.com/example/scout-tool",

        defaultBranch: "main",

        commitSha: "1111111111111111111111111111111111111111",

        treeSha: "2222222222222222222222222222222222222222",
      },

      methodology: {
        id: "kivanta-scout-methodology",

        version: "1.0",
      },
    },
  };
}

/*
 * =========================================================
 * TEST 1
 * FIRST INVESTIGATION CLAIM
 * =========================================================
 */

const firstInvestigation = createFixture(
  "inv_test_001",
  "2026-09-06T15:00:00.000Z",
);

const firstClaim =
  await repository.claimActiveInvestigation(firstInvestigation);

assert.equal(firstClaim.status, "investigation_claimed");

assert.equal(firstClaim.joinedExisting, false);

assert.equal(firstClaim.investigation.lifecycleState, "CREATED");

console.log("\n===== FIRST CLAIM =====");

console.log({
  status: firstClaim.status,

  joinedExisting: firstClaim.joinedExisting,

  investigationId: firstClaim.investigation.investigationId,

  lifecycleState: firstClaim.investigation.lifecycleState,
});

/*
 * =========================================================
 * TEST 2
 * GET INVESTIGATION
 * =========================================================
 */

const storedInvestigation = await repository.getInvestigation("inv_test_001");

assert.equal(storedInvestigation.investigationId, "inv_test_001");

assert.equal(storedInvestigation.lifecycleState, "CREATED");

assert.equal(storedInvestigation.reviewKey.methodologyVersion, "1.0");

console.log("\n===== GET INVESTIGATION =====");

console.log({
  investigationId: storedInvestigation.investigationId,

  lifecycleState: storedInvestigation.lifecycleState,

  commitSha: storedInvestigation.reviewKey.commitSha,
});

/*
 * =========================================================
 * TEST 3
 * DUPLICATE ACTIVE REVIEW
 * =========================================================
 *
 * This investigation has a different ID,
 * but the SAME:
 *
 * repository
 * commit
 * methodology
 *
 * Scout must join the already-active
 * investigation instead of duplicating work.
 * =========================================================
 */

const duplicateInvestigation = createFixture(
  "inv_test_002",
  "2026-09-06T15:05:00.000Z",
);

const duplicateClaim = await repository.claimActiveInvestigation(
  duplicateInvestigation,
);

assert.equal(duplicateClaim.status, "investigation_claimed");

assert.equal(duplicateClaim.joinedExisting, true);

assert.equal(duplicateClaim.investigation.investigationId, "inv_test_001");

/*
 * Because D1 batch() rolled back,
 * inv_test_002 must NOT exist.
 */
const rolledBackInvestigation =
  await repository.getInvestigation("inv_test_002");

assert.equal(rolledBackInvestigation, null);

console.log("\n===== DUPLICATE CLAIM =====");

console.log({
  status: duplicateClaim.status,

  joinedExisting: duplicateClaim.joinedExisting,

  returnedInvestigation: duplicateClaim.investigation.investigationId,

  duplicateRowPersisted: rolledBackInvestigation !== null,
});

/*
 * =========================================================
 * TEST 4
 * OUTBOX CREATED
 * =========================================================
 */

const outboxRow = await db
  .prepare(
    `
      SELECT
        investigation_id,
        event_type,
        dispatch_state,
        attempt_count

      FROM investigation_dispatch_outbox

      WHERE investigation_id = ?1
      `,
  )
  .bind("inv_test_001")
  .first();

assert.equal(outboxRow.investigation_id, "inv_test_001");

assert.equal(outboxRow.event_type, "INVESTIGATION_REQUESTED");

assert.equal(outboxRow.dispatch_state, "PENDING");

assert.equal(outboxRow.attempt_count, 0);

console.log("\n===== OUTBOX =====");

console.log(outboxRow);

/*
 * =========================================================
 * TEST 5
 * UPDATE INVESTIGATION
 * =========================================================
 */

const updateResult = await repository.updateInvestigation("inv_test_001", {
  lifecycleState: "PREPARING_REVIEW",

  updatedAt: "2026-09-06T15:10:00.000Z",

  failureReason: null,
});

assert.equal(updateResult.status, "investigation_updated");

assert.equal(updateResult.investigation.lifecycleState, "PREPARING_REVIEW");

console.log("\n===== UPDATE INVESTIGATION =====");

console.log({
  status: updateResult.status,

  investigationId: updateResult.investigation.investigationId,

  lifecycleState: updateResult.investigation.lifecycleState,
});

/*
 * =========================================================
 * FINAL RESULT
 * =========================================================
 */

console.log("\n===== D1 REPOSITORY TEST PASSED =====");

console.log({
  firstClaim: true,

  retrieval: true,

  duplicateProtection: true,

  batchRollback: true,

  outboxCreation: true,

  lifecycleUpdate: true,
});

sqlite.close();
