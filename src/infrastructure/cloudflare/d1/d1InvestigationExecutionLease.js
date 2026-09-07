/*
 * D1 Investigation Execution Lease Adapter
 *
 * Implements Scout's application execution-lease
 * port using Cloudflare D1.
 *
 * Cloudflare Queues are at-least-once, so the same
 * investigation may be delivered more than once.
 *
 * This adapter ensures only one current worker owns
 * execution rights at a time.
 *
 *
 * Lease lifecycle:
 *
 * acquire
 *   ↓
 * heartbeat
 *   ↓
 * heartbeat
 *   ↓
 * release
 *
 *
 * If a lease expires:
 *
 * old worker token = abc
 *         ↓
 * lease expires
 *         ↓
 * new worker acquires token = xyz
 *         ↓
 * attempt increments
 *
 * The old abc token must no longer be able to
 * heartbeat or release the lease.
 */

/*
 * ------------------------------------------------
 * Helpers
 * ------------------------------------------------
 */

/*
 * Validate a non-empty string.
 */
function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

/*
 * Validate an ISO-compatible timestamp.
 */
function isValidTimestamp(value) {
  return isNonEmptyString(value) && !Number.isNaN(Date.parse(value));
}

/*
 * Confirm one timestamp occurs strictly
 * after another.
 */
function isAfter(later, earlier) {
  return Date.parse(later) > Date.parse(earlier);
}

/*
 * Convert the persisted D1 row into the
 * application-facing lease shape.
 */
function mapLeaseRow(row) {
  if (!row) {
    return null;
  }

  return {
    investigationId: row.investigation_id,

    leaseToken: row.lease_token,

    attempt: Number(row.attempt),

    acquiredAt: row.acquired_at,

    heartbeatAt: row.heartbeat_at,

    expiresAt: row.expires_at,

    releasedAt: row.released_at ?? null,
  };
}

/*
 * Cloudflare D1 exposes affected rows through:
 *
 * result.meta.changes
 *
 * Supporting result.changes as well keeps our
 * local SQLite-compatible tests simple.
 */
function getChangeCount(result) {
  return result?.meta?.changes ?? result?.changes ?? 0;
}

/*
 * ------------------------------------------------
 * Adapter factory
 * ------------------------------------------------
 */

export function createD1InvestigationExecutionLease(db) {
  if (!db || typeof db.prepare !== "function") {
    throw new Error("A valid Cloudflare D1 binding is required.");
  }

  /*
   * ------------------------------------------------
   * getExecutionLease
   * ------------------------------------------------
   *
   * Reads the current durable lease record for an
   * investigation.
   */
  async function getExecutionLease(investigationId) {
    if (!isNonEmptyString(investigationId)) {
      return {
        status: "execution_lease_query_failed",

        reason: "investigation_id_required",

        lease: null,
      };
    }

    const normalizedInvestigationId = investigationId.trim();

    try {
      const row = await db
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
        .bind(normalizedInvestigationId)
        .first();

      if (!row) {
        return {
          status: "execution_lease_not_found",

          reason: null,

          lease: null,
        };
      }

      return {
        status: "execution_lease_found",

        reason: null,

        lease: mapLeaseRow(row),
      };
    } catch (error) {
      return {
        status: "execution_lease_query_failed",

        reason: "d1_execution_lease_query_failed",

        lease: null,

        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /*
   * ------------------------------------------------
   * acquireExecutionLease
   * ------------------------------------------------
   *
   * Attempts to acquire execution ownership.
   *
   * This uses one atomic SQLite UPSERT.
   *
   * If no lease exists:
   *   → INSERT attempt 1
   *
   * If a lease exists AND is expired/released:
   *   → replace token
   *   → increment attempt
   *
   * If an active unexpired lease exists:
   *   → no row changes
   *   → caller receives execution_lease_busy
   *
   *
   * This avoids:
   *
   * SELECT lease
   *      ↓
   * race window ❌
   *      ↓
   * UPDATE lease
   *
   * because the ownership decision occurs inside
   * one database statement.
   */
  async function acquireExecutionLease(input = {}) {
    const { investigationId, leaseToken, acquiredAt, expiresAt } = input;

    if (!isNonEmptyString(investigationId)) {
      return {
        status: "execution_lease_not_acquired",

        reason: "investigation_id_required",

        investigationId: null,
      };
    }

    const normalizedInvestigationId = investigationId.trim();

    if (!isNonEmptyString(leaseToken)) {
      return {
        status: "execution_lease_not_acquired",

        reason: "lease_token_required",

        investigationId: normalizedInvestigationId,
      };
    }

    const normalizedLeaseToken = leaseToken.trim();

    if (!isValidTimestamp(acquiredAt) || !isValidTimestamp(expiresAt)) {
      return {
        status: "execution_lease_not_acquired",

        reason: "valid_timestamp_required",

        investigationId: normalizedInvestigationId,
      };
    }

    if (!isAfter(expiresAt, acquiredAt)) {
      return {
        status: "execution_lease_not_acquired",

        reason: "lease_expiry_must_follow_acquisition",

        investigationId: normalizedInvestigationId,
      };
    }

    try {
      /*
       * IMPORTANT:
       *
       * A conflicting investigation row is replaced
       * only when its current lease is:
       *
       * - explicitly released
       * OR
       * - expired at acquiredAt
       *
       * Otherwise the UPSERT performs no update.
       */
      const result = await db
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
          VALUES (?, ?, 1, ?, ?, ?, NULL)

          ON CONFLICT(investigation_id)
          DO UPDATE SET
            lease_token =
              excluded.lease_token,

            attempt =
              investigation_execution_leases.attempt + 1,

            acquired_at =
              excluded.acquired_at,

            heartbeat_at =
              excluded.heartbeat_at,

            expires_at =
              excluded.expires_at,

            released_at =
              NULL

          WHERE
            investigation_execution_leases.released_at
              IS NOT NULL

            OR

            investigation_execution_leases.expires_at
              <= excluded.acquired_at
        `,
        )
        .bind(
          normalizedInvestigationId,
          normalizedLeaseToken,
          acquiredAt,
          acquiredAt,
          expiresAt,
        )
        .run();

      const changes = getChangeCount(result);

      /*
       * Zero changes means another worker still
       * owns an active lease.
       */
      if (changes === 0) {
        const currentLeaseResult = await getExecutionLease(
          normalizedInvestigationId,
        );

        return {
          status: "execution_lease_busy",

          reason: "active_execution_lease_exists",

          investigationId: normalizedInvestigationId,

          expiresAt: currentLeaseResult.lease?.expiresAt ?? null,

          attempt: currentLeaseResult.lease?.attempt ?? null,
        };
      }

      /*
       * Read the row we just acquired so the caller
       * receives the authoritative attempt number.
       */
      const acquiredLeaseResult = await getExecutionLease(
        normalizedInvestigationId,
      );

      if (acquiredLeaseResult.status !== "execution_lease_found") {
        return {
          status: "execution_lease_not_acquired",

          reason: "acquired_lease_could_not_be_reloaded",

          investigationId: normalizedInvestigationId,
        };
      }

      const lease = acquiredLeaseResult.lease;

      /*
       * Defensive verification:
       *
       * The token persisted in D1 must be the token
       * we attempted to acquire.
       */
      if (lease.leaseToken !== normalizedLeaseToken) {
        return {
          status: "execution_lease_not_acquired",

          reason: "lease_token_verification_failed",

          investigationId: normalizedInvestigationId,
        };
      }

      return {
        status: "execution_lease_acquired",

        reason: null,

        investigationId: normalizedInvestigationId,

        leaseToken: normalizedLeaseToken,

        attempt: lease.attempt,

        acquiredAt: lease.acquiredAt,

        expiresAt: lease.expiresAt,
      };
    } catch (error) {
      return {
        status: "execution_lease_not_acquired",

        reason: "d1_execution_lease_acquire_failed",

        investigationId: normalizedInvestigationId,

        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /*
   * ------------------------------------------------
   * heartbeatExecutionLease
   * ------------------------------------------------
   *
   * Extends an active lease.
   *
   * The update succeeds only when:
   *
   * - investigation matches
   * - lease token matches
   * - lease has not been released
   * - old expiry has not already passed
   *
   * This prevents stale workers from renewing.
   */
  async function heartbeatExecutionLease(input = {}) {
    const { investigationId, leaseToken, heartbeatAt, expiresAt } = input;

    if (!isNonEmptyString(investigationId) || !isNonEmptyString(leaseToken)) {
      return {
        status: "execution_lease_not_renewed",

        reason: "investigation_id_and_lease_token_required",
      };
    }

    const normalizedInvestigationId = investigationId.trim();

    const normalizedLeaseToken = leaseToken.trim();

    if (!isValidTimestamp(heartbeatAt) || !isValidTimestamp(expiresAt)) {
      return {
        status: "execution_lease_not_renewed",

        reason: "valid_timestamp_required",

        investigationId: normalizedInvestigationId,
      };
    }

    if (!isAfter(expiresAt, heartbeatAt)) {
      return {
        status: "execution_lease_not_renewed",

        reason: "lease_expiry_must_follow_heartbeat",

        investigationId: normalizedInvestigationId,
      };
    }

    try {
      const result = await db
        .prepare(
          `
          UPDATE investigation_execution_leases
          SET
            heartbeat_at = ?,
            expires_at = ?
          WHERE investigation_id = ?
            AND lease_token = ?
            AND released_at IS NULL
            AND expires_at > ?
        `,
        )
        .bind(
          heartbeatAt,
          expiresAt,
          normalizedInvestigationId,
          normalizedLeaseToken,
          heartbeatAt,
        )
        .run();

      const changes = getChangeCount(result);

      if (changes === 0) {
        return {
          status: "execution_lease_not_renewed",

          reason: "stale_execution_lease",

          investigationId: normalizedInvestigationId,
        };
      }

      return {
        status: "execution_lease_renewed",

        reason: null,

        investigationId: normalizedInvestigationId,

        leaseToken: normalizedLeaseToken,

        heartbeatAt,

        expiresAt,
      };
    } catch (error) {
      return {
        status: "execution_lease_not_renewed",

        reason: "d1_execution_lease_heartbeat_failed",

        investigationId: normalizedInvestigationId,

        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /*
   * ------------------------------------------------
   * releaseExecutionLease
   * ------------------------------------------------
   *
   * Releases execution ownership.
   *
   * The supplied token must still be the current,
   * unexpired owner.
   */
  async function releaseExecutionLease(input = {}) {
    const { investigationId, leaseToken, releasedAt } = input;

    if (!isNonEmptyString(investigationId) || !isNonEmptyString(leaseToken)) {
      return {
        status: "execution_lease_not_released",

        reason: "investigation_id_and_lease_token_required",
      };
    }

    const normalizedInvestigationId = investigationId.trim();

    const normalizedLeaseToken = leaseToken.trim();

    if (!isValidTimestamp(releasedAt)) {
      return {
        status: "execution_lease_not_released",

        reason: "valid_release_timestamp_required",

        investigationId: normalizedInvestigationId,
      };
    }

    try {
      const result = await db
        .prepare(
          `
          UPDATE investigation_execution_leases
          SET
            released_at = ?,
            heartbeat_at = ?
          WHERE investigation_id = ?
            AND lease_token = ?
            AND released_at IS NULL
            AND expires_at > ?
        `,
        )
        .bind(
          releasedAt,
          releasedAt,
          normalizedInvestigationId,
          normalizedLeaseToken,
          releasedAt,
        )
        .run();

      const changes = getChangeCount(result);

      if (changes === 0) {
        return {
          status: "execution_lease_not_released",

          reason: "stale_execution_lease",

          investigationId: normalizedInvestigationId,
        };
      }

      return {
        status: "execution_lease_released",

        reason: null,

        investigationId: normalizedInvestigationId,

        leaseToken: normalizedLeaseToken,

        releasedAt,
      };
    } catch (error) {
      return {
        status: "execution_lease_not_released",

        reason: "d1_execution_lease_release_failed",

        investigationId: normalizedInvestigationId,

        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /*
   * ------------------------------------------------
   * Application-facing adapter
   * ------------------------------------------------
   */
  return {
    acquireExecutionLease,
    getExecutionLease,
    heartbeatExecutionLease,
    releaseExecutionLease,
  };
}
