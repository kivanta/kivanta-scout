import { validateInvestigationQueue } from "../../../application/ports/investigationQueue.js";

import { createCloudflareInvestigationQueue } from "./cloudflareInvestigationQueue.js";

/*
 * TEST 1
 * Invalid Cloudflare binding should be rejected.
 */

console.log("\n===== INVALID BINDING =====");

try {
  createCloudflareInvestigationQueue(null);

  console.log({
    invalidBindingRejected: false,
  });
} catch (error) {
  console.log({
    invalidBindingRejected: true,
    error: error instanceof Error ? error.message : String(error),
  });
}

/*
 * TEST 2
 * Create a fake Cloudflare Queue binding.
 *
 * This behaves like:
 *
 * env.INVESTIGATION_QUEUE.send(...)
 *
 * but does not contact Cloudflare.
 */

const sentMessages = [];

const fakeQueueBinding = {
  async send(message) {
    sentMessages.push(message);
  },
};

/*
 * Create the real Scout adapter around
 * our fake Cloudflare binding.
 */

const queue = createCloudflareInvestigationQueue(fakeQueueBinding);

/*
 * TEST 3
 * Confirm the Cloudflare adapter satisfies
 * Scout's application Queue contract.
 */

const contractResult = validateInvestigationQueue(queue);

console.log("\n===== QUEUE CONTRACT =====");

console.dir(contractResult, {
  depth: null,
});

/*
 * TEST 4
 * Missing investigation ID should not
 * be sent to Cloudflare Queue.
 */

const missingIdResult = await queue.sendInvestigation({});

console.log("\n===== MISSING INVESTIGATION ID =====");

console.dir(missingIdResult, {
  depth: null,
});

/*
 * TEST 5
 * Valid investigation should be sent.
 */

const validResult = await queue.sendInvestigation({
  investigationId: "inv_test_001",
});

console.log("\n===== VALID QUEUE SEND =====");

console.dir(validResult, {
  depth: null,
});

/*
 * TEST 6
 * Inspect exactly what would have been
 * placed onto Cloudflare Queue.
 */

console.log("\n===== QUEUE MESSAGE =====");

console.dir(sentMessages, {
  depth: null,
});

/*
 * TEST 7
 * Simulate Cloudflare Queue failing.
 */

const failingQueueBinding = {
  async send() {
    throw new Error("simulated Cloudflare Queue failure");
  },
};

const failingQueue = createCloudflareInvestigationQueue(failingQueueBinding);

const failureResult = await failingQueue.sendInvestigation({
  investigationId: "inv_test_002",
});

console.log("\n===== QUEUE FAILURE =====");

console.dir(failureResult, {
  depth: null,
});

/*
 * FINAL ASSERTIONS
 */

const tests = {
  contractReady: contractResult.status === "queue_ready",

  missingIdRejected:
    missingIdResult.status === "queue_send_failed" &&
    missingIdResult.reason === "investigation_id_required",

  validSendAccepted:
    validResult.status === "investigation_queued" &&
    validResult.investigationId === "inv_test_001",

  oneMessageSent: sentMessages.length === 1,

  messageVersioned: sentMessages[0]?.version === 1,

  messageTypeCorrect: sentMessages[0]?.type === "investigation_requested",

  messageUsesDurableIdOnly: sentMessages[0]?.investigationId === "inv_test_001",

  cloudflareFailureHandled:
    failureResult.status === "queue_send_failed" &&
    failureResult.reason === "cloudflare_queue_send_failed",
};

/*
 * Every assertion must pass.
 */

const allPassed = Object.values(tests).every(Boolean);

console.log("\n===== CLOUDFLARE QUEUE ADAPTER TEST =====");

console.dir(tests, {
  depth: null,
});

if (!allPassed) {
  throw new Error("Cloudflare Queue adapter test failed.");
}

console.log("\n===== CLOUDFLARE QUEUE ADAPTER TEST PASSED =====");
