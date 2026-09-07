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
 * - no Methodology logic
 * - no SQL
 * - no ACK / RETRY business policy
 * - no recovery-selection SQL
 * - no publication logic
 */

import { handle } from "@astrojs/cloudflare/handler";

import { createD1InvestigationRepository } from "./infrastructure/cloudflare/d1/d1InvestigationRepository.js";

import { createD1InvestigationExecutionLease } from "./infrastructure/cloudflare/d1/d1InvestigationExecutionLease.js";

import { createD1InvestigationExecutionRepository } from "./infrastructure/cloudflare/d1/d1InvestigationExecutionRepository.js";

import { handleCloudflareInvestigationQueueBatch } from "./infrastructure/cloudflare/queue/handleCloudflareInvestigationQueueBatch.js";

import { handleCloudflareScheduledRecovery } from "./infrastructure/cloudflare/scheduled/handleCloudflareScheduledRecovery.js";

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
     * Build Scout's real Cloudflare D1 adapters.
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
     * Delegate all per-message execution and
     * ACK / RETRY translation to the tested
     * Cloudflare Queue adapter.
     */

    const result = await handleCloudflareInvestigationQueueBatch({
      batch,

      investigationRepository,

      executionLease,

      executionRepository,

      now: () => new Date().toISOString(),
    });

    /*
     * Bounded operational logging only.
     *
     * Never log raw Queue bodies,
     * source code,
     * Methodology evidence,
     * or persisted outcomes.
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
     *
     * Log only the bounded summaries produced by
     * the scheduled recovery boundary.
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
