import assert from "node:assert/strict";

import { buildCheck2Result } from "./buildCheck2Result.js";

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
 * =========================================================
 * 1. COMPLETE EVIDENCE + MATERIAL CONCERN
 * =========================================================
 */

test("complete evidence with material concern returns CAUTION", () => {
  const result = buildCheck2Result({
    status: "summary_ready",

    evidenceComplete: true,

    lifecycle: {
      sensitiveInput: true,
      sensitiveStorage: false,
      sensitiveTransmission: true,
      sensitiveExposure: true,
      sensitiveProcessUse: false,
    },

    categories: [],
  });

  assert.equal(result.status, "CAUTION");
});

/*
 * =========================================================
 * 2. COMPLETE EVIDENCE + SAFE SENSITIVE HANDLING
 * =========================================================
 */

test("complete evidence with scoped sensitive handling can PASS", () => {
  const result = buildCheck2Result({
    status: "summary_ready",

    evidenceComplete: true,

    lifecycle: {
      sensitiveInput: true,
      sensitiveStorage: false,
      sensitiveTransmission: false,
      sensitiveExposure: false,
      sensitiveProcessUse: false,
    },

    categories: [],
  });

  assert.equal(result.status, "PASS");

  assert.equal(
    result.conclusion,
    "Within the inspected source scope, Scout established sensitive-information handling without observing material storage, transmission, or exposure.",
  );
});

/*
 * =========================================================
 * 3. COMPLETE EVIDENCE + NO SENSITIVE HANDLING
 * =========================================================
 */

test("complete evidence with no sensitive handling observed can PASS", () => {
  const result = buildCheck2Result({
    status: "summary_ready",

    evidenceComplete: true,

    lifecycle: {
      sensitiveInput: false,
      sensitiveStorage: false,
      sensitiveTransmission: false,
      sensitiveExposure: false,
      sensitiveProcessUse: false,
    },

    categories: [],
  });

  assert.equal(result.status, "PASS");

  assert.equal(
    result.conclusion,
    "Within the inspected source scope, Scout did not observe materially important sensitive-information handling.",
  );
});

/*
 * =========================================================
 * 4. PARTIAL EVIDENCE + NO CONCERN
 * =========================================================
 */

test("partial evidence without established concern remains UNKNOWN", () => {
  const result = buildCheck2Result({
    status: "summary_ready",

    evidenceComplete: false,

    lifecycle: {
      sensitiveInput: false,
      sensitiveStorage: false,
      sensitiveTransmission: false,
      sensitiveExposure: false,
      sensitiveProcessUse: false,
    },

    categories: [],
  });

  assert.equal(result.status, "UNKNOWN");
});

/*
 * =========================================================
 * 5. PARTIAL EVIDENCE + SENSITIVE INPUT ONLY
 * =========================================================
 */

test("partial evidence with sensitive input but no material concern remains UNKNOWN", () => {
  const result = buildCheck2Result({
    status: "summary_ready",

    evidenceComplete: false,

    lifecycle: {
      sensitiveInput: true,
      sensitiveStorage: false,
      sensitiveTransmission: false,
      sensitiveExposure: false,
      sensitiveProcessUse: false,
    },

    categories: [],
  });

  assert.equal(result.status, "UNKNOWN");
});

/*
 * =========================================================
 * 6. PARTIAL EVIDENCE + POSITIVE MATERIAL CONCERN
 * =========================================================
 */

test("partial evidence with positively observed material concern returns CAUTION", () => {
  const result = buildCheck2Result({
    status: "summary_ready",

    evidenceComplete: false,

    lifecycle: {
      sensitiveInput: true,
      sensitiveStorage: false,
      sensitiveTransmission: true,
      sensitiveExposure: false,
      sensitiveProcessUse: false,
    },

    categories: [],
  });

  assert.equal(result.status, "CAUTION");

  assert.ok(result.limitation);
});

/*
 * =========================================================
 * 7. SUMMARY UNAVAILABLE
 * =========================================================
 */

test("unavailable summary remains UNKNOWN", () => {
  const result = buildCheck2Result({
    status: "summary_not_available",
  });

  assert.equal(result.status, "UNKNOWN");
});

/*
 * =========================================================
 * RESULT
 * =========================================================
 */

console.log(`\nPassed ${passed}/${passed + failed} checks.`);

if (failed > 0) {
  process.exitCode = 1;
}
