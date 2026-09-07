/*
 * D1 Investigation Dispatch Outbox Test
 *
 * Tests the real Scout outbox adapter against
 * the real initial D1 migration using an
 * in-memory SQLite database.
 *
 * This does NOT contact the remote Cloudflare
 * database.
 */

import { DatabaseSync } from "node:sqlite";

import { readFileSync } from "node:fs";

import { createD1InvestigationDispatchOutbox } from "./d1InvestigationDispatchOutbox.js";

import { validateInvestigationDispatchOutbox } from "../../../application/ports/investigationDispatchOutbox.js";

/*
 * ------------------------------------------------
 * Minimal D1-compatible SQLite wrapper
 * ------------------------------------------------
 *
 * Our production adapter expects Cloudflare D1:
 *
 * db.prepare(...)
 * db.batch(...)
 *
 * This wrapper gives the in-memory Node SQLite
 * database the small subset of that interface
 * needed by this test.
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

        const rows = statement.all(...bindings);

        return {
          success: true,
          results: rows,
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

    /*
     * Cloudflare D1 batch() executes the supplied
     * statements transactionally.
     *
     * This test wrapper mirrors that behavior.
     */
    async batch(statements) {
      database.exec("BEGIN IMMEDIATE");

      try {
        const results = [];

        for (const statement of statements) {
          const sqliteStatement = database.prepare(statement.sql);

          const result = sqliteStatement.run(...statement.bindings);

          results.push({
            success: true,
            meta: {
              changes: Number(result.changes ?? 0),
            },
          });
        }

        database.exec("COMMIT");

        return results;
      } catch (error) {
        database.exec("ROLLBACK");

        throw error;
      }
    },
  };
}

/*
 * ------------------------------------------------
 * Database setup
 * ------------------------------------------------
 */

const sqlite = new DatabaseSync(":memory:");

const migration = readFileSync("migrations/0001_initial.sql", "utf8");

sqlite.exec(migration);

const db = createD1TestBinding(sqlite);

/*
 * Create the real Scout D1 outbox adapter.
 */

const outbox = createD1InvestigationDispatchOutbox(db);

/*
 * ------------------------------------------------
 * TEST 1
 * Adapter satisfies application port.
 * ------------------------------------------------
 */

const contractResult = validateInvestigationDispatchOutbox(outbox);

console.log("\n===== OUTBOX CONTRACT =====");

console.dir(contractResult, {
  depth: null,
});

/*
 * ------------------------------------------------
 * Fixture timestamps
 * ------------------------------------------------
 */

const createdAt = "2026-09-07T08:00:00.000Z";

const queryNow = "2026-09-07T08:05:00.000Z";

const retryAvailableAt = "2026-09-07T08:10:00.000Z";

/*
 * ------------------------------------------------
 * Create two investigation fixtures.
 *
 * One will test successful dispatch.
 * One will test failed dispatch + retry.
 * ------------------------------------------------
 */

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
    "inv_dispatch_success",
    createdAt,
    createdAt,
    "github",
    "repo_success",
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "kivanta-scout-methodology",
    "1.0",
    "CREATED",
    JSON.stringify({
      fixture: "success",
    }),
    null,
  );

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
    "inv_dispatch_failure",
    createdAt,
    createdAt,
    "github",
    "repo_failure",
    "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "kivanta-scout-methodology",
    "1.0",
    "CREATED",
    JSON.stringify({
      fixture: "failure",
    }),
    null,
  );

/*
 * Create matching PENDING outbox rows.
 */

sqlite
  .prepare(
    `
  INSERT INTO investigation_dispatch_outbox (
    investigation_id,
    event_type,
    dispatch_state,
    attempt_count,
    available_at,
    created_at,
    updated_at,
    dispatched_at,
    last_error
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`,
  )
  .run(
    "inv_dispatch_success",
    "INVESTIGATION_REQUESTED",
    "PENDING",
    0,
    createdAt,
    createdAt,
    createdAt,
    null,
    null,
  );

sqlite
  .prepare(
    `
  INSERT INTO investigation_dispatch_outbox (
    investigation_id,
    event_type,
    dispatch_state,
    attempt_count,
    available_at,
    created_at,
    updated_at,
    dispatched_at,
    last_error
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`,
  )
  .run(
    "inv_dispatch_failure",
    "INVESTIGATION_REQUESTED",
    "PENDING",
    0,
    createdAt,
    createdAt,
    createdAt,
    null,
    null,
  );

/*
 * Resolve the generated outbox IDs.
 */

const successOutboxRow = sqlite
  .prepare(
    `
    SELECT outbox_id
    FROM investigation_dispatch_outbox
    WHERE investigation_id = ?
  `,
  )
  .get("inv_dispatch_success");

const failureOutboxRow = sqlite
  .prepare(
    `
    SELECT outbox_id
    FROM investigation_dispatch_outbox
    WHERE investigation_id = ?
  `,
  )
  .get("inv_dispatch_failure");

const successOutboxId = Number(successOutboxRow.outbox_id);

const failureOutboxId = Number(failureOutboxRow.outbox_id);

/*
 * ------------------------------------------------
 * TEST 2
 * Find ready PENDING dispatches.
 * ------------------------------------------------
 */

const pendingResult = await outbox.getPendingDispatches({
  now: queryNow,
  limit: 25,
});

console.log("\n===== PENDING DISPATCHES =====");

console.dir(pendingResult, {
  depth: null,
});

/*
 * ------------------------------------------------
 * TEST 3
 * Queue send failure remains recoverable.
 * ------------------------------------------------
 */

const longError = `simulated queue failure ${"x".repeat(700)}`;

const failureResult = await outbox.markDispatchFailed({
  outboxId: failureOutboxId,

  error: longError,

  availableAt: retryAvailableAt,

  updatedAt: queryNow,
});

console.log("\n===== FAILED DISPATCH =====");

console.dir(failureResult, {
  depth: null,
});

/*
 * Inspect persisted failure state.
 */

const persistedFailure = sqlite
  .prepare(
    `
    SELECT
      dispatch_state,
      attempt_count,
      available_at,
      last_error,
      dispatched_at
    FROM investigation_dispatch_outbox
    WHERE outbox_id = ?
  `,
  )
  .get(failureOutboxId);

console.log("\n===== PERSISTED FAILURE STATE =====");

console.dir(persistedFailure, {
  depth: null,
});

/*
 * ------------------------------------------------
 * TEST 4
 * Retry delay is respected.
 *
 * At 08:05 the failed row has been moved to
 * 08:10, so it should no longer be returned.
 * ------------------------------------------------
 */

const beforeRetryResult = await outbox.getPendingDispatches({
  now: queryNow,
  limit: 25,
});

console.log("\n===== BEFORE RETRY WINDOW =====");

console.dir(beforeRetryResult, {
  depth: null,
});

/*
 * ------------------------------------------------
 * TEST 5
 * Successful Queue delivery is recorded.
 *
 * This must atomically:
 *
 * outbox       -> DISPATCHED
 * investigation -> QUEUED
 * ------------------------------------------------
 */

const successResult = await outbox.markDispatchSucceeded({
  outboxId: successOutboxId,

  dispatchedAt: queryNow,

  updatedAt: queryNow,
});

console.log("\n===== SUCCESSFUL DISPATCH =====");

console.dir(successResult, {
  depth: null,
});

/*
 * Inspect durable success state.
 */

const persistedSuccess = sqlite
  .prepare(
    `
    SELECT
      o.dispatch_state,
      o.attempt_count,
      o.dispatched_at,
      o.last_error,
      i.lifecycle_state
    FROM investigation_dispatch_outbox AS o
    JOIN investigations AS i
      ON i.investigation_id =
         o.investigation_id
    WHERE o.outbox_id = ?
  `,
  )
  .get(successOutboxId);

console.log("\n===== PERSISTED SUCCESS STATE =====");

console.dir(persistedSuccess, {
  depth: null,
});

/*
 * ------------------------------------------------
 * TEST 6
 * Same success transition cannot be applied twice.
 * ------------------------------------------------
 */

const duplicateSuccessResult = await outbox.markDispatchSucceeded({
  outboxId: successOutboxId,

  dispatchedAt: "2026-09-07T08:06:00.000Z",

  updatedAt: "2026-09-07T08:06:00.000Z",
});

console.log("\n===== DUPLICATE SUCCESS ATTEMPT =====");

console.dir(duplicateSuccessResult, {
  depth: null,
});

/*
 * ------------------------------------------------
 * TEST 7
 * Failed row becomes eligible again when its
 * retry time arrives.
 * ------------------------------------------------
 */

const retryResult = await outbox.getPendingDispatches({
  now: "2026-09-07T08:10:00.000Z",

  limit: 25,
});

console.log("\n===== RETRY WINDOW REACHED =====");

console.dir(retryResult, {
  depth: null,
});

/*
 * ------------------------------------------------
 * FINAL ASSERTIONS
 * ------------------------------------------------
 */

const tests = {
  contractReady: contractResult.status === "dispatch_outbox_ready",

  initialPendingFound:
    pendingResult.status === "pending_dispatches_found" &&
    pendingResult.count === 2,

  failureRetryScheduled: failureResult.status === "dispatch_retry_scheduled",

  failureStayedPending: persistedFailure.dispatch_state === "PENDING",

  failureAttemptIncremented: Number(persistedFailure.attempt_count) === 1,

  failureRetryTimeMoved: persistedFailure.available_at === retryAvailableAt,

  failureErrorBounded:
    typeof persistedFailure.last_error === "string" &&
    persistedFailure.last_error.length <= 500,

  failureNotMarkedDispatched: persistedFailure.dispatched_at === null,

  retryDelayRespected: beforeRetryResult.dispatches.every(
    (dispatch) => dispatch.investigationId !== "inv_dispatch_failure",
  ),

  successRecorded: successResult.status === "dispatch_succeeded",

  successOutboxDispatched: persistedSuccess.dispatch_state === "DISPATCHED",

  successAttemptIncremented: Number(persistedSuccess.attempt_count) === 1,

  successInvestigationQueued: persistedSuccess.lifecycle_state === "QUEUED",

  successTimestampRecorded: persistedSuccess.dispatched_at === queryNow,

  successErrorCleared: persistedSuccess.last_error === null,

  duplicateSuccessRejected:
    duplicateSuccessResult.status === "dispatch_success_not_recorded" &&
    duplicateSuccessResult.reason === "pending_dispatch_not_found",

  failedDispatchBecomesRetryable: retryResult.dispatches.some(
    (dispatch) => dispatch.investigationId === "inv_dispatch_failure",
  ),
};

const allPassed = Object.values(tests).every(Boolean);

console.log("\n===== D1 DISPATCH OUTBOX TEST =====");

console.dir(tests, {
  depth: null,
});

if (!allPassed) {
  throw new Error("D1 investigation dispatch outbox test failed.");
}

console.log("\n===== D1 DISPATCH OUTBOX TEST PASSED =====");

/*
 * Close the in-memory database cleanly.
 */
sqlite.close();
