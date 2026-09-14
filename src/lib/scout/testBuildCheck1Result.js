/*
 * =========================================================
 * KIVANTA SCOUT
 * CHECK 1 RESULT BUILDER TEST
 * =========================================================
 *
 * Tests the locked Check 1 semantics:
 *
 * 1. read-only Technocore network tool can PASS
 * 2. identity + signing Technocore tool can PASS
 * 3. Technocore mention alone remains UNKNOWN
 * 4. generic network activity alone remains UNKNOWN
 * 5. unavailable summary remains UNKNOWN
 */

import assert from "node:assert/strict";

import { buildCheck1Result } from "./buildCheck1Result.js";

/*
 * ---------------------------------------------------------
 * TEST HARNESS
 * ---------------------------------------------------------
 */

let passed = 0;

let failed = 0;

function test(name, callback) {
  try {
    callback();

    passed += 1;

    console.log(`PASS — ${name}`);
  } catch (error) {
    failed += 1;

    console.error(`FAIL — ${name}`);

    console.error(error);
  }
}

/*
 * ---------------------------------------------------------
 * 1. READ-ONLY TECHNOCORE NETWORK TOOL
 * ---------------------------------------------------------
 */

test("read-only Technocore network behavior can PASS", () => {
  const summary = {
    status: "summary_ready",

    categories: [
      {
        category: "entry_point",

        count: 1,

        labels: ["python_main"],

        evidence: [],
      },

      {
        category: "technocore",

        count: 2,

        labels: ["technocore_host", "room_endpoint"],

        evidence: [],
      },

      {
        category: "network",

        count: 2,

        labels: ["http_request"],

        evidence: [],
      },
    ],
  };

  const result = buildCheck1Result(summary);

  assert.equal(result.status, "PASS");

  assert.equal(result.title, "What does this tool actually do?");

  assert.equal(
    result.conclusion,
    "Source evidence establishes Technocore network behavior for the inspected tool.",
  );
});

/*
 * ---------------------------------------------------------
 * 2. TECHNOCORE IDENTITY + SIGNING TOOL
 * ---------------------------------------------------------
 */

test("Technocore identity and signing behavior can PASS", () => {
  const summary = {
    status: "summary_ready",

    categories: [
      {
        category: "technocore",

        count: 1,

        labels: ["technocore_host"],

        evidence: [],
      },

      {
        category: "identity",

        count: 2,

        labels: ["did_key"],

        evidence: [],
      },

      {
        category: "signing",

        count: 4,

        labels: ["ed25519"],

        evidence: [],
      },
    ],
  };

  const result = buildCheck1Result(summary);

  assert.equal(result.status, "PASS");

  assert.equal(
    result.conclusion,
    "Source evidence establishes Technocore behavior through DID-based identity and cryptographic signing.",
  );
});

/*
 * ---------------------------------------------------------
 * 3. TECHNOCORE MENTION WITHOUT ESTABLISHED BEHAVIOR
 * ---------------------------------------------------------
 */

test("Technocore evidence alone remains UNKNOWN", () => {
  const summary = {
    status: "summary_ready",

    categories: [
      {
        category: "technocore",

        count: 1,

        labels: ["technocore_host"],

        evidence: [],
      },
    ],
  };

  const result = buildCheck1Result(summary);

  assert.equal(result.status, "UNKNOWN");
});

/*
 * ---------------------------------------------------------
 * 4. GENERIC NETWORK BEHAVIOR WITHOUT TECHNOCORE
 * ---------------------------------------------------------
 */

test("generic network behavior without Technocore remains UNKNOWN", () => {
  const summary = {
    status: "summary_ready",

    categories: [
      {
        category: "network",

        count: 2,

        labels: ["http_request"],

        evidence: [],
      },
    ],
  };

  const result = buildCheck1Result(summary);

  assert.equal(result.status, "UNKNOWN");
});

/*
 * ---------------------------------------------------------
 * 5. SUMMARY NOT READY
 * ---------------------------------------------------------
 */

test("unavailable summary remains UNKNOWN", () => {
  const result = buildCheck1Result({
    status: "summary_unavailable",

    categories: [],
  });

  assert.equal(result.status, "UNKNOWN");

  assert.deepEqual(result.evidence, []);
});

/*
 * ---------------------------------------------------------
 * RESULT
 * ---------------------------------------------------------
 */

console.log(`\nPassed ${passed}/${passed + failed} checks.`);

if (failed > 0) {
  process.exitCode = 1;
}
