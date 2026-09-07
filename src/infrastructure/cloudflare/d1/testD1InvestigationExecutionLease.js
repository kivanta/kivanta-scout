/*
 * D1 Investigation Execution Lease Test
 *
 * Tests Scout's real execution-lease adapter
 * against the real D1 migration schema using
 * an in-memory SQLite database.
 *
 * This does NOT contact the remote Cloudflare
 * D1 database.
 *
 *
 * We verify:
 *
 * 1. first worker acquires attempt 1
 * 2. duplicate delivery sees BUSY
 * 3. current owner can heartbeat
 * 4. wrong token cannot heartbeat
 * 5. wrong token cannot release
 * 6. current owner can release
 * 7. released lease can be reacquired
 * 8. attempt increments
 * 9. old token becomes stale
 * 10. expired lease can be taken over
 * 11. attempt increments again
 * 12. previous worker cannot regain control
 */

import { DatabaseSync } from "node:sqlite";

import { readFileSync } from "node:fs";

import { createD1InvestigationExecutionLease } from "./d1InvestigationExecutionLease.js";

import { validateInvestigationExecutionLease } from "../../../application/ports/investigationExecutionLease.js";

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

/*
 * Enable foreign-key behavior so the test
 * resembles D1 more closely.
 */
sqlite.exec("PRAGMA foreign_keys = ON;");

/*
 * Apply both real Scout migrations.
 */

const initialMigration = readFileSync("migrations/0001_initial.sql", "utf8");

const executionLeaseMigration = readFileSync(
  "migrations/0002_execution_leases.sql",
  "utf8",
);

sqlite.exec(initialMigration);

sqlite.exec(executionLeaseMigration);

const db = createD1TestBinding(sqlite);

/*
 * ------------------------------------------------
 * Create one investigation fixture.
 * ------------------------------------------------
 */

const investigationId = "inv_execution_lease_001";

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
    "2026-09-07T10:00:00.000Z",
    "2026-09-07T10:00:00.000Z",
    "github",
    "repo_execution_lease",
    "cccccccccccccccccccccccccccccccccccccccc",
    "kivanta-scout-methodology",
    "1.0",
    "QUEUED",
    JSON.stringify({
      fixture: "execution-lease",
    }),
    null,
  );

/*
 * Create the real D1 execution-lease adapter.
 */

const executionLease = createD1InvestigationExecutionLease(db);

/*
 * ------------------------------------------------
 * TEST 1
 * Adapter satisfies the application port.
 * ------------------------------------------------
 */

const contractResult = validateInvestigationExecutionLease(executionLease);

console.log("\n===== EXECUTION LEASE CONTRACT =====");

console.dir(contractResult, {
  depth: null,
});

/*
 * ------------------------------------------------
 * TEST 2
 * First worker acquires lease.
 * ------------------------------------------------
 */

const workerAToken = "lease_worker_a";

const workerAAcquiredAt = "2026-09-07T10:00:00.000Z";

const workerAExpiresAt = "2026-09-07T10:05:00.000Z";

const firstAcquireResult = await executionLease.acquireExecutionLease({
  investigationId,

  leaseToken: workerAToken,

  acquiredAt: workerAAcquiredAt,

  expiresAt: workerAExpiresAt,
});

console.log("\n===== FIRST LEASE ACQUISITION =====");

console.dir(firstAcquireResult, {
  depth: null,
});

/*
 * ------------------------------------------------
 * TEST 3
 * Read current lease.
 * ------------------------------------------------
 */

const firstLeaseRead = await executionLease.getExecutionLease(investigationId);

console.log("\n===== FIRST LEASE READ =====");

console.dir(firstLeaseRead, {
  depth: null,
});

/*
 * ------------------------------------------------
 * TEST 4
 * Duplicate Queue delivery attempts acquisition
 * while Worker A still owns an active lease.
 *
 * Worker B must receive BUSY.
 * ------------------------------------------------
 */

const workerBToken = "lease_worker_b";

const busyAcquireResult = await executionLease.acquireExecutionLease({
  investigationId,

  leaseToken: workerBToken,

  acquiredAt: "2026-09-07T10:01:00.000Z",

  expiresAt: "2026-09-07T10:06:00.000Z",
});

console.log("\n===== ACTIVE LEASE DUPLICATE DELIVERY =====");

console.dir(busyAcquireResult, {
  depth: null,
});

/*
 * Confirm Worker A still owns the lease.
 */

const leaseAfterBusyAttempt =
  await executionLease.getExecutionLease(investigationId);

console.log("\n===== LEASE AFTER BUSY ATTEMPT =====");

console.dir(leaseAfterBusyAttempt, {
  depth: null,
});

/*
 * ------------------------------------------------
 * TEST 5
 * Current owner heartbeat succeeds.
 * ------------------------------------------------
 */

const heartbeatAResult = await executionLease.heartbeatExecutionLease({
  investigationId,

  leaseToken: workerAToken,

  heartbeatAt: "2026-09-07T10:02:00.000Z",

  expiresAt: "2026-09-07T10:07:00.000Z",
});

console.log("\n===== CURRENT OWNER HEARTBEAT =====");

console.dir(heartbeatAResult, {
  depth: null,
});

/*
 * ------------------------------------------------
 * TEST 6
 * Wrong token cannot heartbeat.
 * ------------------------------------------------
 */

const staleHeartbeatBResult = await executionLease.heartbeatExecutionLease({
  investigationId,

  leaseToken: workerBToken,

  heartbeatAt: "2026-09-07T10:02:30.000Z",

  expiresAt: "2026-09-07T10:07:30.000Z",
});

console.log("\n===== WRONG TOKEN HEARTBEAT =====");

console.dir(staleHeartbeatBResult, {
  depth: null,
});

/*
 * ------------------------------------------------
 * TEST 7
 * Wrong token cannot release Worker A's lease.
 * ------------------------------------------------
 */

const staleReleaseBResult = await executionLease.releaseExecutionLease({
  investigationId,

  leaseToken: workerBToken,

  releasedAt: "2026-09-07T10:03:00.000Z",
});

console.log("\n===== WRONG TOKEN RELEASE =====");

console.dir(staleReleaseBResult, {
  depth: null,
});

/*
 * ------------------------------------------------
 * TEST 8
 * Worker A releases its own lease.
 * ------------------------------------------------
 */

const releaseAResult = await executionLease.releaseExecutionLease({
  investigationId,

  leaseToken: workerAToken,

  releasedAt: "2026-09-07T10:03:00.000Z",
});

console.log("\n===== CURRENT OWNER RELEASE =====");

console.dir(releaseAResult, {
  depth: null,
});

/*
 * ------------------------------------------------
 * TEST 9
 * Released lease can be reacquired.
 *
 * Worker C should become attempt 2.
 * ------------------------------------------------
 */

const workerCToken = "lease_worker_c";

const acquireCResult = await executionLease.acquireExecutionLease({
  investigationId,

  leaseToken: workerCToken,

  acquiredAt: "2026-09-07T10:04:00.000Z",

  expiresAt: "2026-09-07T10:09:00.000Z",
});

console.log("\n===== REACQUIRE RELEASED LEASE =====");

console.dir(acquireCResult, {
  depth: null,
});

/*
 * ------------------------------------------------
 * TEST 10
 * Old Worker A token is now stale.
 * ------------------------------------------------
 */

const staleHeartbeatAResult = await executionLease.heartbeatExecutionLease({
  investigationId,

  leaseToken: workerAToken,

  heartbeatAt: "2026-09-07T10:05:00.000Z",

  expiresAt: "2026-09-07T10:10:00.000Z",
});

console.log("\n===== OLD WORKER HEARTBEAT AFTER TAKEOVER =====");

console.dir(staleHeartbeatAResult, {
  depth: null,
});

/*
 * Old Worker A also cannot release Worker C.
 */

const staleReleaseAResult = await executionLease.releaseExecutionLease({
  investigationId,

  leaseToken: workerAToken,

  releasedAt: "2026-09-07T10:05:00.000Z",
});

console.log("\n===== OLD WORKER RELEASE AFTER TAKEOVER =====");

console.dir(staleReleaseAResult, {
  depth: null,
});

/*
 * ------------------------------------------------
 * TEST 11
 * Worker C is allowed to remain owner until its
 * expiry at 10:09.
 *
 * At 10:10 Worker D should be able to take over.
 * ------------------------------------------------
 */

const workerDToken = "lease_worker_d";

const acquireDResult = await executionLease.acquireExecutionLease({
  investigationId,

  leaseToken: workerDToken,

  acquiredAt: "2026-09-07T10:10:00.000Z",

  expiresAt: "2026-09-07T10:15:00.000Z",
});

console.log("\n===== EXPIRED LEASE TAKEOVER =====");

console.dir(acquireDResult, {
  depth: null,
});

/*
 * ------------------------------------------------
 * TEST 12
 * Expired Worker C must now be stale.
 * ------------------------------------------------
 */

const staleHeartbeatCResult = await executionLease.heartbeatExecutionLease({
  investigationId,

  leaseToken: workerCToken,

  heartbeatAt: "2026-09-07T10:11:00.000Z",

  expiresAt: "2026-09-07T10:16:00.000Z",
});

console.log("\n===== EXPIRED WORKER HEARTBEAT AFTER TAKEOVER =====");

console.dir(staleHeartbeatCResult, {
  depth: null,
});

/*
 * ------------------------------------------------
 * TEST 13
 * Read authoritative current lease.
 * ------------------------------------------------
 */

const finalLeaseRead = await executionLease.getExecutionLease(investigationId);

console.log("\n===== FINAL CURRENT LEASE =====");

console.dir(finalLeaseRead, {
  depth: null,
});

/*
 * ------------------------------------------------
 * Inspect the underlying persisted row.
 * ------------------------------------------------
 */

const persistedLease = sqlite
  .prepare(
    `
    SELECT
      investigation_id,
      lease_token,
      attempt,
      acquired_at,
      heartbeat_at,
      expires_at,
      released_at
    FROM investigation_execution_leases
    WHERE investigation_id = ?
  `,
  )
  .get(investigationId);

console.log("\n===== PERSISTED LEASE STATE =====");

console.dir(persistedLease, {
  depth: null,
});

/*
 * ------------------------------------------------
 * FINAL ASSERTIONS
 * ------------------------------------------------
 */

const tests = {
  contractReady: contractResult.status === "execution_lease_ready",

  firstLeaseAcquired: firstAcquireResult.status === "execution_lease_acquired",

  firstAttemptIsOne: firstAcquireResult.attempt === 1,

  firstLeaseOwnedByWorkerA: firstLeaseRead.lease?.leaseToken === workerAToken,

  duplicateDeliveryBlocked:
    busyAcquireResult.status === "execution_lease_busy" &&
    busyAcquireResult.reason === "active_execution_lease_exists",

  busyAttemptDidNotReplaceOwner:
    leaseAfterBusyAttempt.lease?.leaseToken === workerAToken,

  currentOwnerHeartbeatWorks:
    heartbeatAResult.status === "execution_lease_renewed",

  wrongTokenHeartbeatRejected:
    staleHeartbeatBResult.status === "execution_lease_not_renewed" &&
    staleHeartbeatBResult.reason === "stale_execution_lease",

  wrongTokenReleaseRejected:
    staleReleaseBResult.status === "execution_lease_not_released" &&
    staleReleaseBResult.reason === "stale_execution_lease",

  ownerReleaseWorks: releaseAResult.status === "execution_lease_released",

  releasedLeaseReacquired: acquireCResult.status === "execution_lease_acquired",

  reacquireIncrementedAttempt: acquireCResult.attempt === 2,

  oldWorkerHeartbeatRejected:
    staleHeartbeatAResult.status === "execution_lease_not_renewed" &&
    staleHeartbeatAResult.reason === "stale_execution_lease",

  oldWorkerReleaseRejected:
    staleReleaseAResult.status === "execution_lease_not_released" &&
    staleReleaseAResult.reason === "stale_execution_lease",

  expiredLeaseTakenOver: acquireDResult.status === "execution_lease_acquired",

  expiredTakeoverIncrementedAttempt: acquireDResult.attempt === 3,

  expiredWorkerNowStale:
    staleHeartbeatCResult.status === "execution_lease_not_renewed" &&
    staleHeartbeatCResult.reason === "stale_execution_lease",

  finalOwnerIsWorkerD: finalLeaseRead.lease?.leaseToken === workerDToken,

  finalAttemptIsThree: finalLeaseRead.lease?.attempt === 3,

  persistedOwnerMatches: persistedLease.lease_token === workerDToken,

  persistedAttemptMatches: Number(persistedLease.attempt) === 3,

  finalLeaseNotReleased: persistedLease.released_at === null,
};

const allPassed = Object.values(tests).every(Boolean);

console.log("\n===== D1 EXECUTION LEASE TEST =====");

console.dir(tests, {
  depth: null,
});

if (!allPassed) {
  throw new Error("D1 investigation execution lease test failed.");
}

console.log("\n===== D1 EXECUTION LEASE TEST PASSED =====");

/*
 * Close the in-memory database cleanly.
 */
sqlite.close();
