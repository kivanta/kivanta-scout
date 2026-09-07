/*
 * Investigation Queue Port
 *
 * This defines what the Scout application
 * needs from a Queue implementation.
 *
 * The application does NOT know whether the
 * implementation is Cloudflare Queue,
 * a test queue, or something else.
 *
 * Cloudflare Queue will implement this
 * contract later.
 */

/*
 * Methods every investigation Queue
 * implementation must provide.
 */
const requiredMethods = ["sendInvestigation"];

/*
 * Validate that a Queue adapter satisfies
 * the application contract.
 */
export function validateInvestigationQueue(queue) {
  if (!queue || typeof queue !== "object") {
    return {
      status: "queue_not_ready",
      reason: "queue_required",
      missingMethods: requiredMethods,
    };
  }

  const missingMethods = requiredMethods.filter(
    (method) => typeof queue[method] !== "function",
  );

  if (missingMethods.length > 0) {
    return {
      status: "queue_not_ready",
      reason: "queue_methods_missing",
      missingMethods: missingMethods,
    };
  }

  return {
    status: "queue_ready",
    reason: null,
    missingMethods: [],
  };
}

/*
 * Queue contract:
 *
 * sendInvestigation(message)
 *
 * Sends one investigation request to the
 * execution Queue.
 *
 * The message should contain only the durable
 * identity needed by the consumer, such as:
 *
 * {
 *   investigationId: "inv_...",
 * }
 *
 * The Queue message does NOT need to contain
 * the complete frozen target.
 *
 * The consumer will load the authoritative
 * investigation record from D1 using the
 * investigation ID.
 *
 * This keeps D1 as Scout's source of truth.
 */

/*
 * Export the contract so tests and
 * infrastructure adapters can inspect it.
 */
export const investigationQueueContract = Object.freeze({
  requiredMethods: [...requiredMethods],
});
