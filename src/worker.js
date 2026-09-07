/*
 * Kivanta Scout
 * Cloudflare Worker Entrypoint
 *
 * Real Cloudflare runtime composition boundary.
 *
 *
 * HTTP:
 *
 * request
 *    ↓
 * Astro Cloudflare handler
 *    ↓
 * existing Scout website
 *
 *
 * Queue:
 *
 * Cloudflare MessageBatch
 *    ↓
 * env.DB
 *    ↓
 * real D1 adapters
 *    ↓
 * hardened GitHub request boundary
 *    ↓
 * frozen Scout Methodology 1.0
 *    ↓
 * handleCloudflareInvestigationQueueBatch()
 *    ↓
 * Scout investigation execution pipeline
 *
 *
 * Scheduled recovery:
 *
 * Cloudflare scheduled event
 *    ↓
 * handleCloudflareScheduledRecovery()
 *    │
 *    ├─ CREATED + PENDING recovery
 *    ├─ stale QUEUED recovery
 *    └─ stranded PREPARING_REVIEW recovery
 *
 *
 * IMPORTANT:
 *
 * This file contains:
 *
 * - no Methodology rules
 * - no SQL
 * - no ACK / RETRY business policy
 * - no recovery-selection SQL
 * - no publication logic
 *
 * It only composes tested runtime boundaries.
 */

import { handle } from "@astrojs/cloudflare/handler";

import { createD1InvestigationRepository } from "./infrastructure/cloudflare/d1/d1InvestigationRepository.js";

import { createD1InvestigationExecutionLease } from "./infrastructure/cloudflare/d1/d1InvestigationExecutionLease.js";

import { createD1InvestigationExecutionRepository } from "./infrastructure/cloudflare/d1/d1InvestigationExecutionRepository.js";

import { handleCloudflareInvestigationQueueBatch } from "./infrastructure/cloudflare/queue/handleCloudflareInvestigationQueueBatch.js";

import { handleCloudflareScheduledRecovery } from "./infrastructure/cloudflare/scheduled/handleCloudflareScheduledRecovery.js";

/*
 * Application composition boundaries.
 */

import { handleInvestigationQueueDelivery } from "./application/investigations/handleInvestigationQueueDelivery.js";

import { executePreparedScoutInvestigation } from "./application/investigations/executePreparedScoutInvestigation.js";

/*
 * Hardened GitHub runtime composition.
 */

import { createHardenedGitHubRequest } from "./infrastructure/github/createHardenedGitHubRequest.js";

import { createGitHubMethodologyRunner } from "./infrastructure/github/createGitHubMethodologyRunner.js";

export default {
  /*
   * =================================================
   * HTTP / Astro
   * =================================================
   */

  async fetch(request, env, ctx) {
    return handle(request, env, ctx);
  },

  /*
   * =================================================
   * Cloudflare Queue consumer
   * =================================================
   */

  async queue(batch, env, _ctx) {
    /*
     * Fail safe if authoritative D1 persistence
     * is unavailable.
     */

    if (!env?.DB) {
      batch.retryAll();

      console.error({
        status: "scout_queue_runtime_not_ready",

        reason: "d1_binding_required",

        messageCount: batch?.messages?.length ?? 0,
      });

      return;
    }

    let investigationRepository;

    let executionLease;

    let executionRepository;

    /*
     * =================================================
     * Compose authoritative D1 adapters
     * =================================================
     */

    try {
      investigationRepository = createD1InvestigationRepository(env.DB);

      executionLease = createD1InvestigationExecutionLease(env.DB);

      executionRepository = createD1InvestigationExecutionRepository(env.DB);
    } catch {
      /*
       * If the authoritative persistence layer
       * cannot be constructed, retry the batch.
       */

      batch.retryAll();

      console.error({
        status: "scout_queue_runtime_not_ready",

        reason: "d1_repository_composition_failed",

        messageCount: batch?.messages?.length ?? 0,
      });

      return;
    }

    /*
     * =================================================
     * Compose hardened GitHub execution
     * =================================================
     *
     * GITHUB_TOKEN is optional.
     *
     * If no Cloudflare secret has been configured,
     * Scout still uses the hardened request boundary
     * but GitHub API requests remain unauthenticated.
     *
     * The token itself never enters:
     *
     * - investigation state
     * - Queue bodies
     * - Methodology results
     * - D1
     * - logs
     */

    let deliveryHandler;

    try {
      /*
       * One hardened request boundary owns:
       *
       * - GitHub host allowlisting
       * - HTTPS enforcement
       * - request timeout
       * - response-size limits
       * - REST API headers
       * - optional API authentication
       */

      const githubRequest = createHardenedGitHubRequest({
        token: env?.GITHUB_TOKEN ?? null,
      });

      /*
       * Bind that exact request boundary through:
       *
       * frozen repository verification
       * commit verification
       * tree verification
       * Technocore evidence
       * Check 1 file evidence
       * Check 2 file evidence
       * Check 3 file evidence
       */

      const githubMethodologyRunner = createGitHubMethodologyRunner({
        request: githubRequest,
      });

      /*
       * Bind the hardened Methodology runner into
       * Scout's existing durable execution service.
       *
       * executePreparedScoutInvestigation() still
       * owns no Cloudflare env knowledge.
       */

      const scoutExecutor = async (input) => {
        return executePreparedScoutInvestigation(
          input,

          {
            methodologyRunner: githubMethodologyRunner,
          },
        );
      };

      /*
       * Bind that Scout executor into the existing
       * neutral Queue delivery application boundary.
       *
       * ACK / RETRY policy remains entirely inside:
       *
       * handleInvestigationQueueDelivery()
       */

      deliveryHandler = async (input) => {
        return handleInvestigationQueueDelivery(
          input,

          {
            scoutExecutor,
          },
        );
      };
    } catch {
      /*
       * Production GitHub composition must fail
       * closed.
       *
       * Do not fall back silently to an unhardened
       * execution path.
       */

      batch.retryAll();

      console.error({
        status: "scout_queue_runtime_not_ready",

        reason: "github_runtime_composition_failed",

        messageCount: batch?.messages?.length ?? 0,
      });

      return;
    }

    /*
     * =================================================
     * Delegate Queue batch
     * =================================================
     *
     * All per-message preparation, execution,
     * durable outcome handling, and ACK / RETRY
     * translation remain in the already-tested
     * application + Cloudflare Queue boundaries.
     */

    const result = await handleCloudflareInvestigationQueueBatch(
      {
        batch,

        investigationRepository,

        executionLease,

        executionRepository,

        now: () => new Date().toISOString(),
      },

      {
        deliveryHandler,
      },
    );

    /*
     * Bounded operational logging only.
     *
     * Never log:
     *
     * - raw Queue bodies
     * - GitHub credentials
     * - source code
     * - Methodology evidence
     * - persisted outcomes
     */

    console.log({
      status: result.status,

      reason: result.reason,

      messageCount: result.messageCount,

      acknowledgedCount: result.acknowledgedCount,

      retriedCount: result.retriedCount,

      failedCount: result.failedCount,
    });
  },

  /*
   * =================================================
   * Cloudflare Scheduled Recovery
   * =================================================
   *
   * This handler is inert until a Cron Trigger is
   * configured in Wrangler / Cloudflare.
   *
   * We are only wiring the runtime handler here.
   *
   * We are NOT enabling the schedule yet.
   */

  async scheduled(controller, env, _ctx) {
    /*
     * Use Cloudflare's scheduled event time when
     * available.
     *
     * Fall back to the current runtime clock if the
     * handler is invoked somewhere that does not
     * provide scheduledTime.
     */

    const scheduledTime = Number.isFinite(controller?.scheduledTime)
      ? controller.scheduledTime
      : Date.now();

    const now = new Date(scheduledTime).toISOString();

    /*
     * The scheduled recovery boundary validates
     * and composes its own real D1 + Queue adapters.
     *
     * All three recovery jobs run independently:
     *
     * 1. CREATED + PENDING
     * 2. stale QUEUED
     * 3. stranded PREPARING_REVIEW
     */

    let result;

    try {
      result = await handleCloudflareScheduledRecovery({
        db: env?.DB,

        queueBinding: env?.INVESTIGATION_QUEUE,

        now,
      });
    } catch {
      /*
       * Unexpected boundary failure.
       *
       * Keep the operational log bounded and do
       * not expose raw exception information.
       */

      console.error({
        status: "scout_scheduled_recovery_failed",

        reason: "scheduled_recovery_boundary_threw",

        now,
      });

      return;
    }

    /*
     * Bounded scheduled-recovery logging.
     *
     * IMPORTANT:
     *
     * Do not log:
     *
     * - dispatchResult
     * - queuedRecoveryResult
     * - executionRecoveryResult
     *
     * Those may contain per-record operational
     * details.
     */

    console.log({
      status: result.status,

      reason: result.reason,

      now: result.now,

      dispatch: {
        status: result.dispatch?.status ?? null,

        reason: result.dispatch?.reason ?? null,

        checked: result.dispatch?.checked ?? 0,

        dispatched: result.dispatch?.dispatched ?? 0,

        retriesScheduled: result.dispatch?.retriesScheduled ?? 0,

        stateErrors: result.dispatch?.stateErrors ?? 0,
      },

      queuedRecovery: {
        status: result.queuedRecovery?.status ?? null,

        reason: result.queuedRecovery?.reason ?? null,

        checked: result.queuedRecovery?.checked ?? 0,

        requeued: result.queuedRecovery?.requeued ?? 0,

        queueFailures: result.queuedRecovery?.queueFailures ?? 0,

        stateFailures: result.queuedRecovery?.stateFailures ?? 0,

        invalidRecords: result.queuedRecovery?.invalidRecords ?? 0,

        staleBefore: result.queuedRecovery?.staleBefore ?? null,
      },

      executionRecovery: {
        status: result.executionRecovery?.status ?? null,

        reason: result.executionRecovery?.reason ?? null,

        checked: result.executionRecovery?.checked ?? 0,

        requeued: result.executionRecovery?.requeued ?? 0,

        queueFailures: result.executionRecovery?.queueFailures ?? 0,

        invalidRecords: result.executionRecovery?.invalidRecords ?? 0,
      },
    });
  },
};
