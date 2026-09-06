/*
 * Kivanta Scout
 * Cloudflare D1 Investigation Repository
 *
 * Implements the application persistence port
 * using Cloudflare D1.
 *
 * Responsibilities:
 *
 * - claim one exact active review
 * - persist the investigation
 * - persist dispatch intent in the outbox
 * - return an existing active investigation
 *   when duplicate work is requested
 * - retrieve investigations
 * - update basic lifecycle state
 *
 * Queue sending comes later.
 */

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

    target: target,

    failureReason: row.failure_reason || null,
  };
}

/*
 * Create the Cloudflare D1 implementation
 * of Scout's Investigation Repository Port.
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
   * Find the active investigation that
   * currently owns one exact review key.
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
   * Atomically claim one active review.
   *
   * D1 batch() is used because all three
   * writes must succeed together:
   *
   * investigation
   *      +
   * active claim
   *      +
   * outbox dispatch intent
   *
   * If the active claim already exists,
   * the batch rolls back and Scout returns
   * the existing investigation instead.
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
     * An investigation exists durably
     * before Queue dispatch occurs.
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
         * 3. Record durable intent to
         *    dispatch this investigation.
         *
         * Queue sending happens later.
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
          .bind(investigation.investigationId, createdAt, createdAt, createdAt),
      ]);

      return {
        status: "investigation_claimed",

        reason: null,

        joinedExisting: false,

        investigation: {
          ...investigation,

          lifecycleState: lifecycleState,

          failureReason: null,
        },
      };
    } catch (error) {
      /*
       * The most important expected conflict
       * is another request winning the active
       * review claim first.
       *
       * Instead of creating duplicate work,
       * look up and return the winner.
       */
      const existing = await findActiveInvestigation(reviewKey);

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
       * Do not disguise it as a duplicate claim.
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
   * Retrieve one investigation by its
   * opaque investigation ID.
   */
  async function getInvestigation(investigationId) {
    if (!investigationId) {
      return null;
    }

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
      .bind(investigationId)
      .first();

    return mapInvestigationRow(row);
  }

  /*
   * Update the small set of investigation
   * fields currently owned by the application.
   *
   * Worker lease/version safeguards will be
   * added before execution-result writes.
   */
  async function updateInvestigation(investigationId, changes = {}) {
    if (!investigationId) {
      return {
        status: "investigation_not_updated",

        reason: "investigation_id_required",
      };
    }

    const lifecycleState = changes.lifecycleState;

    const updatedAt = changes.updatedAt;

    if (!lifecycleState || !updatedAt) {
      return {
        status: "investigation_not_updated",

        reason: "lifecycle_state_and_updated_at_required",
      };
    }

    const failureReason = changes.failureReason ?? null;

    const result = await db
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
      .bind(lifecycleState, updatedAt, failureReason, investigationId)
      .run();

    const changesCount = result?.meta?.changes ?? 0;

    if (changesCount === 0) {
      return {
        status: "investigation_not_updated",

        reason: "investigation_not_found",
      };
    }

    return {
      status: "investigation_updated",

      reason: null,

      investigation: await getInvestigation(investigationId),
    };
  }

  return {
    claimActiveInvestigation,
    getInvestigation,
    updateInvestigation,
  };
}
