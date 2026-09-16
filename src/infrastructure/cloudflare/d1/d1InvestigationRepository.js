/*
 * Kivanta Scout
 * Cloudflare D1 Investigation Repository
 *
 * Implements Scout's application Investigation
 * Repository Port using Cloudflare D1.
 *
 *
 * Responsibilities:
 *
 * - claim one exact active review
 * - persist the investigation
 * - persist dispatch intent in the outbox
 * - return an existing active investigation when
 *   duplicate work is requested
 * - retrieve investigations through a stable
 *   application-level result envelope
 * - update basic lifecycle state
 * - release active-review claims when an
 *   investigation becomes terminal
 *
 *
 * IMPORTANT CONTRACT:
 *
 * getInvestigation() never returns the investigation
 * object directly.
 *
 * It returns:
 *
 * investigation_found
 * investigation_not_found
 * investigation_query_failed
 *
 * This matches the application layer consumed by:
 *
 * processQueuedInvestigation()
 */

/*
 * ------------------------------------------------
 * Helpers
 * ------------------------------------------------
 */

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

/*
 * Terminal investigations no longer represent
 * active work.
 *
 * Their active-review claim must therefore be
 * released when the terminal transition is written.
 */

const TERMINAL_LIFECYCLE_STATES = new Set(["COMPLETE", "PARTIAL", "FAILED"]);

/*
 * Convert one D1 row back into the
 * application-level investigation shape.
 */

function mapInvestigationRow(row) {
  if (!row) {
    return null;
  }

  let target = null;

  try {
    target =
      typeof row.target_json === "string" ? JSON.parse(row.target_json) : null;
  } catch {
    target = null;
  }

  return {
    investigationId: row.investigation_id,

    createdAt: row.created_at,

    updatedAt: row.updated_at,

    reviewKey: {
      provider: row.provider,

      repositoryId: row.repository_id,

      commitSha: row.commit_sha,

      methodologyId: row.methodology_id,

      methodologyVersion: row.methodology_version,
    },

    lifecycleState: row.lifecycle_state,

    target,

    failureReason: row.failure_reason || null,
  };
}

/*
 * ------------------------------------------------
 * Adapter factory
 * ------------------------------------------------
 */

export function createD1InvestigationRepository(db) {
  /*
   * Fail early if the Cloudflare binding
   * is missing or malformed.
   */

  if (
    !db ||
    typeof db.prepare !== "function" ||
    typeof db.batch !== "function"
  ) {
    throw new Error("A valid Cloudflare D1 database binding is required.");
  }

  /*
   * ------------------------------------------------
   * findActiveInvestigation
   * ------------------------------------------------
   *
   * Internal helper used only while resolving a
   * duplicate active-review claim.
   *
   * Unlike public getInvestigation(), this helper
   * deliberately returns the mapped record directly
   * because it is an internal claim-resolution step.
   */

  async function findActiveInvestigation(reviewKey) {
    const row = await db
      .prepare(
        `
          SELECT
            i.investigation_id,
            i.created_at,
            i.updated_at,
            i.provider,
            i.repository_id,
            i.commit_sha,
            i.methodology_id,
            i.methodology_version,
            i.lifecycle_state,
            i.target_json,
            i.failure_reason

          FROM active_review_claims AS c

          INNER JOIN investigations AS i
            ON i.investigation_id =
               c.investigation_id

          WHERE c.provider = ?1
            AND c.repository_id = ?2
            AND c.commit_sha = ?3
            AND c.methodology_id = ?4
            AND c.methodology_version = ?5

          LIMIT 1
          `,
      )
      .bind(
        reviewKey.provider,
        String(reviewKey.repositoryId),
        reviewKey.commitSha,
        reviewKey.methodologyId,
        reviewKey.methodologyVersion,
      )
      .first();

    return mapInvestigationRow(row);
  }

  /*
   * ------------------------------------------------
   * claimActiveInvestigation
   * ------------------------------------------------
   *
   * Atomically claim one active review.
   *
   * D1 batch() is used because all three writes
   * must succeed together:
   *
   * investigation
   *      +
   * active review claim
   *      +
   * outbox dispatch intent
   *
   *
   * If another request already owns the exact
   * review identity, the batch rolls back and
   * Scout returns the existing investigation.
   */

  async function claimActiveInvestigation(investigation) {
    if (
      !investigation?.investigationId ||
      !investigation?.reviewKey ||
      !investigation?.target
    ) {
      return {
        status: "investigation_not_claimed",

        reason: "investigation_record_required",

        investigation: null,
      };
    }

    const reviewKey = investigation.reviewKey;

    if (
      !reviewKey.provider ||
      !reviewKey.repositoryId ||
      !reviewKey.commitSha ||
      !reviewKey.methodologyId ||
      !reviewKey.methodologyVersion
    ) {
      return {
        status: "investigation_not_claimed",

        reason: "review_key_required",

        investigation: null,
      };
    }

    const targetJson = JSON.stringify(investigation.target);

    const createdAt = investigation.createdAt;

    const updatedAt = investigation.updatedAt;

    /*
     * An investigation exists durably before
     * Queue dispatch occurs.
     */

    const lifecycleState = "CREATED";

    try {
      await db.batch([
        /*
         * 1. Persist investigation.
         */

        db
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
              ?1,
              ?2,
              ?3,
              ?4,
              ?5,
              ?6,
              ?7,
              ?8,
              ?9,
              ?10,
              NULL
            )
            `,
          )
          .bind(
            investigation.investigationId,

            createdAt,

            updatedAt,

            reviewKey.provider,

            String(reviewKey.repositoryId),

            reviewKey.commitSha,

            reviewKey.methodologyId,

            reviewKey.methodologyVersion,

            lifecycleState,

            targetJson,
          ),

        /*
         * 2. Atomically claim the exact
         *    active review identity.
         */

        db
          .prepare(
            `
            INSERT INTO active_review_claims (
              provider,
              repository_id,
              commit_sha,
              methodology_id,
              methodology_version,
              investigation_id,
              claimed_at
            )
            VALUES (
              ?1,
              ?2,
              ?3,
              ?4,
              ?5,
              ?6,
              ?7
            )
            `,
          )
          .bind(
            reviewKey.provider,

            String(reviewKey.repositoryId),

            reviewKey.commitSha,

            reviewKey.methodologyId,

            reviewKey.methodologyVersion,

            investigation.investigationId,

            createdAt,
          ),

        /*
         * 3. Record durable intent to dispatch
         *    this investigation.
         *
         * Queue sending is handled separately.
         */

        db
          .prepare(
            `
            INSERT INTO
              investigation_dispatch_outbox (
                investigation_id,
                event_type,
                dispatch_state,
                attempt_count,
                available_at,
                created_at,
                updated_at
              )
            VALUES (
              ?1,
              'INVESTIGATION_REQUESTED',
              'PENDING',
              0,
              ?2,
              ?3,
              ?4
            )
            `,
          )
          .bind(
            investigation.investigationId,

            createdAt,

            createdAt,

            createdAt,
          ),
      ]);

      return {
        status: "investigation_claimed",

        reason: null,

        joinedExisting: false,

        investigation: {
          ...investigation,

          lifecycleState,

          failureReason: null,
        },
      };
    } catch (error) {
      /*
       * The expected conflict is another request
       * winning the active-review claim first.
       *
       * Try to resolve the existing winner.
       */

      let existing = null;

      try {
        existing = await findActiveInvestigation(reviewKey);
      } catch {
        /*
         * If the recovery lookup itself fails,
         * preserve the original claim failure.
         */
      }

      if (existing) {
        return {
          status: "investigation_claimed",

          reason: "active_investigation_exists",

          joinedExisting: true,

          investigation: existing,
        };
      }

      /*
       * A different database failure occurred.
       */

      return {
        status: "investigation_not_claimed",

        reason: "d1_claim_failed",

        investigation: null,

        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /*
   * ------------------------------------------------
   * getInvestigation
   * ------------------------------------------------
   *
   * Retrieve one investigation by its opaque ID.
   *
   *
   * CONTRACT:
   *
   * Found:
   *
   * {
   *   status: "investigation_found",
   *   reason: null,
   *   investigation: {...}
   * }
   *
   *
   * Missing:
   *
   * {
   *   status: "investigation_not_found",
   *   reason: null,
   *   investigation: null
   * }
   *
   *
   * Read failure:
   *
   * {
   *   status: "investigation_query_failed",
   *   reason: "...",
   *   investigation: null
   * }
   */

  async function getInvestigation(investigationId) {
    if (!isNonEmptyString(investigationId)) {
      return {
        status: "investigation_query_failed",

        reason: "investigation_id_required",

        investigation: null,
      };
    }

    const normalizedInvestigationId = investigationId.trim();

    try {
      const row = await db
        .prepare(
          `
            SELECT
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

            FROM investigations

            WHERE investigation_id = ?1

            LIMIT 1
            `,
        )
        .bind(normalizedInvestigationId)
        .first();

      if (!row) {
        return {
          status: "investigation_not_found",

          reason: null,

          investigation: null,
        };
      }

      return {
        status: "investigation_found",

        reason: null,

        investigation: mapInvestigationRow(row),
      };
    } catch (error) {
      return {
        status: "investigation_query_failed",

        reason: "d1_investigation_query_failed",

        investigation: null,

        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /*
   * ------------------------------------------------
   * updateInvestigation
   * ------------------------------------------------
   *
   * Update the small set of investigation fields
   * currently owned by the application.
   *
   * Active lifecycle transitions update only the
   * investigation row.
   *
   * Terminal lifecycle transitions additionally
   * release the active-review claim in the same
   * D1 batch so completed or failed work cannot
   * block a future investigation of the same exact
   * review identity.
   */

  async function updateInvestigation(investigationId, changes = {}) {
    if (!isNonEmptyString(investigationId)) {
      return {
        status: "investigation_not_updated",

        reason: "investigation_id_required",

        investigation: null,
      };
    }

    const normalizedInvestigationId = investigationId.trim();

    const lifecycleState = changes.lifecycleState;

    const updatedAt = changes.updatedAt;

    if (!lifecycleState || !updatedAt) {
      return {
        status: "investigation_not_updated",

        reason: "lifecycle_state_and_updated_at_required",

        investigation: null,
      };
    }

    const failureReason = changes.failureReason ?? null;

    const investigationUpdateStatement = db
      .prepare(
        `
          UPDATE investigations

          SET
            lifecycle_state = ?1,
            updated_at = ?2,
            failure_reason = ?3

          WHERE investigation_id = ?4
          `,
      )
      .bind(
        lifecycleState,

        updatedAt,

        failureReason,

        normalizedInvestigationId,
      );

    let result;

    try {
      if (TERMINAL_LIFECYCLE_STATES.has(lifecycleState)) {
        /*
         * Terminal transition:
         *
         * 1. persist terminal lifecycle
         * 2. release active-review claim
         *
         * D1 batch keeps these writes atomic.
         */

        const batchResults = await db.batch([
          investigationUpdateStatement,

          db
            .prepare(
              `
                DELETE FROM active_review_claims

                WHERE investigation_id = ?1
                `,
            )
            .bind(normalizedInvestigationId),
        ]);

        result = batchResults?.[0] ?? null;
      } else {
        /*
         * Non-terminal transition:
         *
         * Keep the active-review claim because this
         * investigation still represents active work.
         */

        result = await investigationUpdateStatement.run();
      }
    } catch (error) {
      return {
        status: "investigation_not_updated",

        reason: "d1_investigation_update_failed",

        investigation: null,

        error: error instanceof Error ? error.message : String(error),
      };
    }

    const changesCount = result?.meta?.changes ?? result?.changes ?? 0;

    if (changesCount === 0) {
      return {
        status: "investigation_not_updated",

        reason: "investigation_not_found",

        investigation: null,
      };
    }

    /*
     * getInvestigation() now returns the stable
     * application result envelope.
     *
     * Unwrap it before returning the updated record.
     */

    const reloadResult = await getInvestigation(normalizedInvestigationId);

    if (reloadResult.status !== "investigation_found") {
      return {
        status: "investigation_not_updated",

        reason: "updated_investigation_could_not_be_reloaded",

        investigation: null,
      };
    }

    return {
      status: "investigation_updated",

      reason: null,

      investigation: reloadResult.investigation,
    };
  }

  /*
   * ------------------------------------------------
   * Application-facing adapter
   * ------------------------------------------------
   */

  return {
    claimActiveInvestigation,

    getInvestigation,

    updateInvestigation,
  };
}
