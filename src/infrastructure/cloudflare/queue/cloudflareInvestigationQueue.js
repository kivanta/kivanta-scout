/*
 * Cloudflare Investigation Queue Adapter
 *
 * Implements Scout's application Queue port
 * using a Cloudflare Queue producer binding.
 *
 * D1 remains Scout's authoritative source of truth.
 * The Queue message contains only the durable
 * investigation ID needed by the consumer.
 */

/*
 * Create a Cloudflare Queue implementation.
 *
 * Expected binding:
 *
 * env.INVESTIGATION_QUEUE
 *
 * Cloudflare Queue producer bindings expose:
 *
 * queue.send(message)
 */
export function createCloudflareInvestigationQueue(queueBinding) {
  /*
   * Validate the Cloudflare binding early.
   */
  if (!queueBinding || typeof queueBinding.send !== "function") {
    throw new Error("A valid Cloudflare Queue producer binding is required.");
  }

  /*
   * Send one investigation to the Queue.
   *
   * The application passes:
   *
   * {
   *   investigationId: "..."
   * }
   *
   * We intentionally do NOT put the frozen
   * investigation target into the Queue message.
   *
   * The future Queue consumer will load the
   * authoritative investigation from D1.
   */
  async function sendInvestigation(message) {
    const investigationId = message?.investigationId;

    if (
      typeof investigationId !== "string" ||
      investigationId.trim().length === 0
    ) {
      return {
        status: "queue_send_failed",
        reason: "investigation_id_required",
        investigationId: null,
      };
    }

    const normalizedInvestigationId = investigationId.trim();

    /*
     * Keep the Queue payload intentionally small
     * and versioned.
     *
     * Versioning gives us room to evolve the
     * message shape later without silently
     * changing old Queue messages.
     */
    const queueMessage = {
      version: 1,
      type: "investigation_requested",
      investigationId: normalizedInvestigationId,
    };

    try {
      await queueBinding.send(queueMessage);

      return {
        status: "investigation_queued",
        reason: null,
        investigationId: normalizedInvestigationId,
        messageVersion: 1,
      };
    } catch (error) {
      return {
        status: "queue_send_failed",
        reason: "cloudflare_queue_send_failed",
        investigationId: normalizedInvestigationId,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /*
   * Return the application-facing Queue adapter.
   */
  return {
    sendInvestigation,
  };
}
