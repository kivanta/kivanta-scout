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
 * IMPORTANT:
 *
 * This file contains:
 *
 * - no Methodology logic
 * - no SQL
 * - no ACK / RETRY business policy
 */

import { handle } from "@astrojs/cloudflare/handler";

import { createD1InvestigationRepository } from "./infrastructure/cloudflare/d1/d1InvestigationRepository.js";

import { createD1InvestigationExecutionLease } from "./infrastructure/cloudflare/d1/d1InvestigationExecutionLease.js";

import { createD1InvestigationExecutionRepository } from "./infrastructure/cloudflare/d1/d1InvestigationExecutionRepository.js";

import { handleCloudflareInvestigationQueueBatch } from "./infrastructure/cloudflare/queue/handleCloudflareInvestigationQueueBatch.js";

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
};
