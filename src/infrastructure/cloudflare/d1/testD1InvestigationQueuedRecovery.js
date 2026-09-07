/*
 * D1 Investigation Queued Recovery Test
 *
 * Uses local SQLite with Scout migrations
 * 0001, 0002 and 0003.
 *
 *
 * We verify:
 *
 * 1. invalid timestamps rejected
 * 2. staleBefore cannot exceed now
 * 3. empty sweep works
 * 4. stale QUEUED + missing lease recovers
 * 5. fresh QUEUED is excluded
 * 6. PENDING outbox is excluded
 * 7. non-QUEUED lifecycle is excluded
 * 8. active lease is excluded
 * 9. expired lease is recoverable
 * 10. released lease is recoverable
 * 11. RUNNING historical execution does not block
 * 12. COMPLETE execution blocks recovery
 * 13. PARTIAL execution blocks recovery
 * 14. FAILED execution blocks recovery
 * 15. result metadata is mapped correctly
 * 16. limit is respected
 * 17. successful recovery keeps DISPATCHED
 * 18. original dispatched_at is preserved
 * 19. attempt_count increments
 * 20. updated_at becomes cooldown clock
 * 21. recovered row immediately leaves stale set
 */

import assert from "node:assert/strict";

import { readFileSync } from "node:fs";

import { fileURLToPath } from "node:url";

import { dirname, resolve } from "node:path";

import { DatabaseSync } from "node:sqlite";

import { createD1InvestigationQueuedRecovery } from "./d1InvestigationQueuedRecovery.js";

/*
 * =================================================
 * Paths
 * =================================================
 */

const currentFile = fileURLToPath(import.meta.url);

const currentDirectory = dirname(currentFile);

const projectRoot = resolve(currentDirectory, "../../../../");

/*
 * =================================================
 * Time fixtures
 * =================================================
 */

const NOW = "2026-09-07T19:00:00.000Z";

const STALE_BEFORE = "2026-09-07T18:30:00.000Z";

/*
 * =================================================
 * Local D1-compatible SQLite wrapper
 * =================================================
 */

function createD1CompatibleDatabase(sqlite) {
  return {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async all() {
              const statement = sqlite.prepare(sql);

              return {
                results: statement.all(...values),
              };
            },

            async run() {
              const statement = sqlite.prepare(sql);

              const result = statement.run(...values);

              return {
                meta: {
                  changes: Number(result.changes),
                },
              };
            },

            async first() {
              const statement = sqlite.prepare(sql);

              return statement.get(...values) ?? null;
            },
          };
        },
      };
    },
  };
}

/*
 * =================================================
 * Database + migrations
 * =================================================
 */

const sqlite = new DatabaseSync(":memory:");

sqlite.exec("PRAGMA foreign_keys = ON;");

for (const migrationName of [
  "0001_initial.sql",
  "0002_execution_leases.sql",
  "0003_investigation_executions.sql",
]) {
  const migrationPath = resolve(projectRoot, "migrations", migrationName);

  const sql = readFileSync(migrationPath, "utf8");

  sqlite.exec(sql);
}

const db = createD1CompatibleDatabase(sqlite);

const recovery = createD1InvestigationQueuedRecovery(db);

/*
 * =================================================
 * Fixture helpers
 * =================================================
 */

let sequence = 0;

function nextNumber() {
  sequence += 1;

  return sequence;
}

function insertInvestigation({
  investigationId,
  lifecycleState = "QUEUED",

  createdAt = "2026-09-07T17:00:00.000Z",

  updatedAt = "2026-09-07T17:00:00.000Z",
}) {
  const number = nextNumber();

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
        '{}',
        NULL
      )
    `,
    )
    .run(
      investigationId,
      createdAt,
      updatedAt,
      `repo_${number}`,
      `commit_${number}`,
      lifecycleState,
    );
}

function insertOutbox({
  investigationId,

  dispatchState = "DISPATCHED",

  attemptCount = 1,

  updatedAt = "2026-09-07T18:00:00.000Z",

  dispatchedAt = "2026-09-07T17:55:00.000Z",
}) {
  const result = sqlite
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
        VALUES (
          ?,
          'INVESTIGATION_REQUESTED',
          ?,
          ?,
          '2026-09-07T17:00:00.000Z',
          '2026-09-07T17:00:00.000Z',
          ?,
          ?,
          NULL
        )
      `,
    )
    .run(investigationId, dispatchState, attemptCount, updatedAt, dispatchedAt);

  return Number(result.lastInsertRowid);
}

function insertLease({
  investigationId,

  leaseToken,

  attempt = 1,

  acquiredAt = "2026-09-07T18:00:00.000Z",

  heartbeatAt = "2026-09-07T18:00:00.000Z",

  expiresAt = "2026-09-07T19:10:00.000Z",

  releasedAt = null,
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

  startedAt = "2026-09-07T18:00:00.000Z",
}) {
  const terminal = ["COMPLETE", "PARTIAL", "FAILED"].includes(executionStatus);

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

      terminal ? "2026-09-07T18:10:00.000Z" : null,

      startedAt,

      terminal ? "2026-09-07T18:10:00.000Z" : startedAt,
    );
}

function createQueuedFixture({
  investigationId,

  lifecycleState = "QUEUED",

  dispatchState = "DISPATCHED",

  outboxUpdatedAt = "2026-09-07T18:00:00.000Z",

  attemptCount = 1,
}) {
  insertInvestigation({
    investigationId,
    lifecycleState,
  });

  const outboxId = insertOutbox({
    investigationId,
    dispatchState,
    updatedAt: outboxUpdatedAt,
    attemptCount,
  });

  return {
    investigationId,
    outboxId,
  };
}

/*
 * =================================================
 * TEST 1
 * Invalid timestamps
 * =================================================
 */

const invalidTimestampResult =
  await recovery.getRecoverableQueuedInvestigations({
    now: "not-a-date",

    staleBefore: STALE_BEFORE,
  });

assert.equal(
  invalidTimestampResult.status,
  "recoverable_queued_investigations_query_failed",
);

assert.equal(
  invalidTimestampResult.reason,
  "valid_recovery_timestamps_required",
);

/*
 * =================================================
 * TEST 2
 * staleBefore cannot exceed now
 * =================================================
 */

const futureThresholdResult = await recovery.getRecoverableQueuedInvestigations(
  {
    now: NOW,

    staleBefore: "2026-09-07T19:30:00.000Z",
  },
);

assert.equal(
  futureThresholdResult.status,
  "recoverable_queued_investigations_query_failed",
);

assert.equal(futureThresholdResult.reason, "stale_before_must_not_exceed_now");

/*
 * =================================================
 * TEST 3
 * Empty sweep
 * =================================================
 */

const emptyResult = await recovery.getRecoverableQueuedInvestigations({
  now: NOW,

  staleBefore: STALE_BEFORE,
});

assert.equal(emptyResult.status, "recoverable_queued_investigations_found");

assert.equal(emptyResult.count, 0);

/*
 * =================================================
 * Candidate: missing lease
 * =================================================
 */

const missingLeaseFixture = createQueuedFixture({
  investigationId: "queued_missing_lease",

  outboxUpdatedAt: "2026-09-07T17:40:00.000Z",

  attemptCount: 1,
});

/*
 * Fresh Queue delivery — must NOT recover.
 */

createQueuedFixture({
  investigationId: "queued_fresh",

  outboxUpdatedAt: "2026-09-07T18:45:00.000Z",
});

/*
 * PENDING outbox — handled by initial dispatch
 * recovery, not queued recovery.
 */

createQueuedFixture({
  investigationId: "queued_pending_outbox",

  dispatchState: "PENDING",

  outboxUpdatedAt: "2026-09-07T17:30:00.000Z",
});

/*
 * PREPARING_REVIEW — handled by execution
 * recovery, not queued recovery.
 */

createQueuedFixture({
  investigationId: "not_queued_lifecycle",

  lifecycleState: "PREPARING_REVIEW",

  outboxUpdatedAt: "2026-09-07T17:30:00.000Z",
});

/*
 * =================================================
 * Active lease — excluded
 * =================================================
 */

createQueuedFixture({
  investigationId: "queued_active_lease",

  outboxUpdatedAt: "2026-09-07T17:35:00.000Z",
});

insertLease({
  investigationId: "queued_active_lease",

  leaseToken: "lease_active",

  expiresAt: "2026-09-07T19:20:00.000Z",
});

/*
 * =================================================
 * Expired lease — recoverable
 *
 * Important clock test:
 *
 * expiry = 18:55
 * staleBefore = 18:30
 * now = 19:00
 *
 * 18:55 is later than staleBefore,
 * but it IS expired at now.
 * =================================================
 */

createQueuedFixture({
  investigationId: "queued_expired_lease",

  outboxUpdatedAt: "2026-09-07T17:45:00.000Z",
});

insertLease({
  investigationId: "queued_expired_lease",

  leaseToken: "lease_expired",

  expiresAt: "2026-09-07T18:55:00.000Z",
});

/*
 * =================================================
 * Released lease — recoverable
 * =================================================
 */

createQueuedFixture({
  investigationId: "queued_released_lease",

  outboxUpdatedAt: "2026-09-07T17:50:00.000Z",
});

insertLease({
  investigationId: "queued_released_lease",

  leaseToken: "lease_released",

  expiresAt: "2026-09-07T19:20:00.000Z",

  releasedAt: "2026-09-07T18:20:00.000Z",
});

/*
 * =================================================
 * RUNNING execution + expired lease
 *
 * Historical RUNNING does not block recovery.
 * =================================================
 */

createQueuedFixture({
  investigationId: "queued_running_execution",

  outboxUpdatedAt: "2026-09-07T17:55:00.000Z",
});

insertLease({
  investigationId: "queued_running_execution",

  leaseToken: "lease_running_old",

  expiresAt: "2026-09-07T18:40:00.000Z",
});

insertExecution({
  executionId: "execution_running",

  investigationId: "queued_running_execution",

  leaseToken: "lease_running_old",

  executionStatus: "RUNNING",
});

/*
 * =================================================
 * Terminal executions — all excluded
 * =================================================
 */

for (const executionStatus of ["COMPLETE", "PARTIAL", "FAILED"]) {
  const suffix = executionStatus.toLowerCase();

  const investigationId = `queued_terminal_${suffix}`;

  const leaseToken = `lease_terminal_${suffix}`;

  createQueuedFixture({
    investigationId,

    outboxUpdatedAt: "2026-09-07T17:20:00.000Z",
  });

  insertLease({
    investigationId,
    leaseToken,

    expiresAt: "2026-09-07T18:20:00.000Z",
  });

  insertExecution({
    executionId: `execution_${suffix}`,

    investigationId,

    leaseToken,

    executionStatus,
  });
}

/*
 * =================================================
 * Main recovery query
 * =================================================
 */

const recoveryResult = await recovery.getRecoverableQueuedInvestigations({
  now: NOW,

  staleBefore: STALE_BEFORE,

  limit: 25,
});

console.log("\n===== RECOVERABLE QUEUED INVESTIGATIONS =====");

console.dir(recoveryResult, {
  depth: null,
});

assert.equal(recoveryResult.status, "recoverable_queued_investigations_found");

const recoveredIds = recoveryResult.investigations.map(
  (item) => item.investigationId,
);

/*
 * Expected:
 *
 * missing lease
 * expired lease
 * released lease
 * historical RUNNING + expired lease
 */

assert.equal(recoveredIds.includes("queued_missing_lease"), true);

assert.equal(recoveredIds.includes("queued_expired_lease"), true);

assert.equal(recoveredIds.includes("queued_released_lease"), true);

assert.equal(recoveredIds.includes("queued_running_execution"), true);

/*
 * Exclusions
 */

assert.equal(recoveredIds.includes("queued_fresh"), false);

assert.equal(recoveredIds.includes("queued_pending_outbox"), false);

assert.equal(recoveredIds.includes("not_queued_lifecycle"), false);

assert.equal(recoveredIds.includes("queued_active_lease"), false);

assert.equal(recoveredIds.includes("queued_terminal_complete"), false);

assert.equal(recoveredIds.includes("queued_terminal_partial"), false);

assert.equal(recoveredIds.includes("queued_terminal_failed"), false);

/*
 * =================================================
 * Metadata mapping
 * =================================================
 */

const expiredCandidate = recoveryResult.investigations.find(
  (item) => item.investigationId === "queued_expired_lease",
);

assert.equal(expiredCandidate?.leaseState, "EXPIRED");

assert.equal(expiredCandidate?.leaseAttempt, 1);

assert.equal(expiredCandidate?.leaseExpiresAt, "2026-09-07T18:55:00.000Z");

const runningCandidate = recoveryResult.investigations.find(
  (item) => item.investigationId === "queued_running_execution",
);

assert.equal(runningCandidate?.latestExecutionStatus, "RUNNING");

/*
 * =================================================
 * Limit
 * =================================================
 */

const limitedResult = await recovery.getRecoverableQueuedInvestigations({
  now: NOW,

  staleBefore: STALE_BEFORE,

  limit: 1,
});

assert.equal(limitedResult.count, 1);

/*
 * =================================================
 * Cooldown mutation
 * =================================================
 */

const beforeCooldown = sqlite
  .prepare(
    `
      SELECT
        dispatch_state,
        attempt_count,
        dispatched_at,
        updated_at

      FROM investigation_dispatch_outbox

      WHERE outbox_id = ?
    `,
  )
  .get(missingLeaseFixture.outboxId);

const cooldownResult = await recovery.markQueuedRecoveryDispatched({
  outboxId: missingLeaseFixture.outboxId,

  recoveredAt: NOW,
});

console.log("\n===== QUEUED RECOVERY COOLDOWN UPDATE =====");

console.dir(cooldownResult, {
  depth: null,
});

assert.equal(cooldownResult.status, "queued_recovery_dispatch_recorded");

const afterCooldown = sqlite
  .prepare(
    `
      SELECT
        dispatch_state,
        attempt_count,
        dispatched_at,
        updated_at

      FROM investigation_dispatch_outbox

      WHERE outbox_id = ?
    `,
  )
  .get(missingLeaseFixture.outboxId);

assert.equal(afterCooldown.dispatch_state, "DISPATCHED");

assert.equal(
  Number(afterCooldown.attempt_count),
  Number(beforeCooldown.attempt_count) + 1,
);

assert.equal(afterCooldown.dispatched_at, beforeCooldown.dispatched_at);

assert.equal(afterCooldown.updated_at, NOW);

/*
 * The successful recovery send refreshed
 * updated_at to NOW.
 *
 * Therefore it must no longer qualify using
 * the old staleBefore threshold.
 */

const afterCooldownQuery = await recovery.getRecoverableQueuedInvestigations({
  now: NOW,

  staleBefore: STALE_BEFORE,
});

const afterCooldownIds = afterCooldownQuery.investigations.map(
  (item) => item.investigationId,
);

assert.equal(afterCooldownIds.includes("queued_missing_lease"), false);

/*
 * =================================================
 * Invalid cooldown writes
 * =================================================
 */

const invalidOutboxResult = await recovery.markQueuedRecoveryDispatched({
  outboxId: 0,

  recoveredAt: NOW,
});

assert.equal(invalidOutboxResult.reason, "valid_outbox_id_required");

const invalidRecoveredAtResult = await recovery.markQueuedRecoveryDispatched({
  outboxId: missingLeaseFixture.outboxId,

  recoveredAt: "not-a-date",
});

assert.equal(
  invalidRecoveredAtResult.reason,
  "valid_recovered_at_timestamp_required",
);

/*
 * =================================================
 * Final summary
 * =================================================
 */

const tests = {
  invalidTimestampRejected:
    invalidTimestampResult.reason === "valid_recovery_timestamps_required",

  futureStaleThresholdRejected:
    futureThresholdResult.reason === "stale_before_must_not_exceed_now",

  emptySweepHandled: emptyResult.count === 0,

  missingLeaseRecoverable: recoveredIds.includes("queued_missing_lease"),

  freshQueuedExcluded: !recoveredIds.includes("queued_fresh"),

  pendingOutboxExcluded: !recoveredIds.includes("queued_pending_outbox"),

  nonQueuedLifecycleExcluded: !recoveredIds.includes("not_queued_lifecycle"),

  activeLeaseExcluded: !recoveredIds.includes("queued_active_lease"),

  expiredLeaseRecoverable: recoveredIds.includes("queued_expired_lease"),

  releasedLeaseRecoverable: recoveredIds.includes("queued_released_lease"),

  runningExecutionRecoverable: recoveredIds.includes(
    "queued_running_execution",
  ),

  completeExecutionExcluded: !recoveredIds.includes("queued_terminal_complete"),

  partialExecutionExcluded: !recoveredIds.includes("queued_terminal_partial"),

  failedExecutionExcluded: !recoveredIds.includes("queued_terminal_failed"),

  recoveryMetadataMapped:
    expiredCandidate?.leaseState === "EXPIRED" &&
    runningCandidate?.latestExecutionStatus === "RUNNING",

  limitRespected: limitedResult.count === 1,

  cooldownRecorded:
    cooldownResult.status === "queued_recovery_dispatch_recorded",

  dispatchedStatePreserved: afterCooldown.dispatch_state === "DISPATCHED",

  originalDispatchPreserved:
    afterCooldown.dispatched_at === beforeCooldown.dispatched_at,

  attemptCountIncremented:
    Number(afterCooldown.attempt_count) ===
    Number(beforeCooldown.attempt_count) + 1,

  cooldownClockRefreshed: afterCooldown.updated_at === NOW,

  recoveredRowLeavesStaleSet: !afterCooldownIds.includes(
    "queued_missing_lease",
  ),
};

const allPassed = Object.values(tests).every(Boolean);

console.log("\n===== D1 INVESTIGATION QUEUED RECOVERY TEST =====");

console.dir(tests, {
  depth: null,
});

if (!allPassed) {
  throw new Error("D1 investigation queued recovery test failed.");
}

console.log("\n===== D1 INVESTIGATION QUEUED RECOVERY TEST PASSED =====");

sqlite.close();
