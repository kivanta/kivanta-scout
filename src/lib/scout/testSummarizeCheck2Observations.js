import assert from "node:assert/strict";

import { extractCheck2Observations } from "./extractCheck2Observations.js";
import { summarizeCheck2Observations } from "./summarizeCheck2Observations.js";

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
 * 1. COMPLETE EVIDENCE WITH SENSITIVE LIFECYCLE
 * =========================================================
 */

test("complete evidence preserves sensitive lifecycle and completeness", () => {
  const evidence = {
    status: "evidence_collected",

    files: [
      {
        path: "config.py",

        status: "file_found",

        content: `
import os

PASSWORD = os.getenv("TOOL_PASSWORD")
API_KEY = "fake-test-secret-123"
print(API_KEY)
`,
      },

      {
        path: "client.py",

        status: "file_found",

        content: `
import os
import requests

TOKEN = os.getenv("ACCESS_TOKEN")

requests.post(
    "https://example.com",
    headers={"Authorization": TOKEN}
)
`,
      },
    ],
  };

  const observations = extractCheck2Observations(evidence);

  const summary = summarizeCheck2Observations(observations);

  assert.equal(summary.status, "summary_ready");

  assert.equal(summary.evidenceComplete, true);

  assert.equal(summary.lifecycle.sensitiveInput, true);

  assert.equal(summary.lifecycle.sensitiveTransmission, true);

  assert.equal(summary.lifecycle.sensitiveExposure, true);
});

/*
 * =========================================================
 * 2. COMPLETE EVIDENCE WITH ZERO OBSERVATIONS
 * =========================================================
 */

test("complete evidence with no observations still produces a ready summary", () => {
  const evidence = {
    status: "evidence_collected",

    files: [
      {
        path: "main.py",

        status: "file_found",

        content: `
def main():
    return "hello"

if __name__ == "__main__":
    main()
`,
      },
    ],
  };

  const observations = extractCheck2Observations(evidence);

  assert.equal(observations.status, "no_observations_found");

  const summary = summarizeCheck2Observations(observations);

  assert.equal(summary.status, "summary_ready");

  assert.equal(summary.evidenceComplete, true);

  assert.equal(summary.categoryCount, 0);

  assert.deepEqual(summary.categories, []);

  assert.equal(summary.lifecycle.sensitiveInput, false);

  assert.equal(summary.lifecycle.sensitiveStorage, false);

  assert.equal(summary.lifecycle.sensitiveTransmission, false);

  assert.equal(summary.lifecycle.sensitiveExposure, false);

  assert.equal(summary.lifecycle.sensitiveProcessUse, false);
});

/*
 * =========================================================
 * 3. PARTIAL EVIDENCE PRESERVES INCOMPLETENESS
 * =========================================================
 */

test("partial evidence remains explicitly incomplete", () => {
  const evidence = {
    status: "evidence_partial",

    files: [
      {
        path: "main.py",

        status: "file_found",

        content: `
def main():
    return "hello"
`,
      },

      {
        path: "config.py",

        status: "file_not_found",
      },
    ],
  };

  const observations = extractCheck2Observations(evidence);

  const summary = summarizeCheck2Observations(observations);

  assert.equal(summary.status, "summary_ready");

  assert.equal(summary.evidenceComplete, false);

  assert.equal(summary.evidenceStatus, "evidence_partial");
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
