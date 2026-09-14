/*
 * =========================================================
 * KIVANTA SCOUT
 * CHECK 2 — READ-ONLY / NO-SENSITIVE FIXTURE TEST
 * =========================================================
 *
 * PURPOSE
 *
 * Prove the complete Check 2 runner correctly distinguishes:
 *
 * 1. Complete inspected evidence with no materially important
 *    sensitive-information handling -> PASS
 *
 * 2. Partial inspected evidence with no observed concern
 *    -> UNKNOWN
 *
 *
 * The fixture intentionally:
 *
 * - reads a public Technocore room
 * - performs an ordinary HTTP request
 * - uses no private key
 * - uses no password
 * - uses no token
 * - uses no credential
 * - uses no API key
 * - uses no secret
 * - uses no signing seed
 */

import assert from "node:assert/strict";

import { runCheck2 } from "./runCheck2.js";

/*
 * ---------------------------------------------------------
 * SHARED SUPPORTED SOURCE INPUT
 * ---------------------------------------------------------
 */

const sharedInput = {
  owner: "fixture-owner",

  repo: "fixture-read-only-tool",

  branch: "main",

  sourceAssessment: {
    status: "supported_source",
  },

  tree: {
    status: "tree_found",

    truncated: false,

    items: [
      {
        path: "pyproject.toml",

        type: "blob",
      },

      {
        path: "main.py",

        type: "blob",
      },
    ],
  },

  python: {
    hasPython: true,

    pythonFileCount: 1,

    dependencyFiles: ["pyproject.toml"],
  },

  technocoreEvidence: {
    established: true,

    matches: [
      {
        path: "main.py",

        signals: ["technocore_host", "room_api"],
      },
    ],
  },

  toolIdentity: {
    singleTool: true,

    projectRoot: ".",

    projectMarkers: ["pyproject.toml"],

    entryPointCandidates: ["main.py"],
  },
};

/*
 * ---------------------------------------------------------
 * COMPLETE READ-ONLY EVIDENCE
 * ---------------------------------------------------------
 */

async function completeEvidenceCollector() {
  return {
    status: "evidence_collected",

    fileCount: 2,

    files: [
      {
        path: "main.py",

        status: "file_found",

        content: `
import requests

TECHNOCORE_URL = "https://technocore.chat"
ROOM_PATH = "/r/scout-v1-fixture"

def read_room():
    response = requests.get(
        f"{TECHNOCORE_URL}{ROOM_PATH}",
        timeout=10,
    )

    response.raise_for_status()

    return response.json()

if __name__ == "__main__":
    read_room()
`,
      },

      {
        path: "pyproject.toml",

        status: "file_found",

        content: `
[project]
name = "fixture-read-only-technocore-tool"
version = "1.0.0"
dependencies = ["requests"]
`,
      },
    ],
  };
}

/*
 * ---------------------------------------------------------
 * PARTIAL READ-ONLY EVIDENCE
 * ---------------------------------------------------------
 */

async function partialEvidenceCollector() {
  return {
    status: "evidence_partial",

    fileCount: 2,

    files: [
      {
        path: "main.py",

        status: "file_found",

        content: `
import requests

TECHNOCORE_URL = "https://technocore.chat"
ROOM_PATH = "/r/scout-v1-fixture"

def read_room():
    return requests.get(
        f"{TECHNOCORE_URL}{ROOM_PATH}",
        timeout=10,
    )
`,
      },

      {
        path: "pyproject.toml",

        status: "file_not_found",
      },
    ],
  };
}

/*
 * =========================================================
 * TEST 1
 * COMPLETE EVIDENCE -> PASS
 * =========================================================
 */

const completeResult = await runCheck2({
  ...sharedInput,

  evidenceCollector: completeEvidenceCollector,
});

assert.equal(
  completeResult.status,
  "PASS",
  "complete read-only evidence should PASS Check 2",
);

assert.equal(
  completeResult.conclusion,
  "Within the inspected source scope, Scout did not observe materially important sensitive-information handling.",
);

assert.equal(completeResult.lifecycle.sensitiveInput, false);

assert.equal(completeResult.lifecycle.sensitiveStorage, false);

assert.equal(completeResult.lifecycle.sensitiveTransmission, false);

assert.equal(completeResult.lifecycle.sensitiveExposure, false);

assert.equal(completeResult.lifecycle.sensitiveProcessUse, false);

console.log("PASS — complete read-only fixture reaches Check 2 PASS");

/*
 * =========================================================
 * TEST 2
 * GENERIC NETWORK ACTIVITY IS NOT SENSITIVE TRANSMISSION
 * =========================================================
 */

const transmissionCategory = completeResult.evidence.find(
  (category) => category.category === "transmission",
);

assert.ok(
  transmissionCategory,
  "ordinary HTTP activity should still be represented as transmission evidence",
);

assert.equal(
  transmissionCategory.sensitiveCount,
  0,
  "ordinary HTTP activity must not be classified as sensitive transmission",
);

console.log(
  "PASS — ordinary network activity is not treated as sensitive transmission",
);

/*
 * =========================================================
 * TEST 3
 * PARTIAL EVIDENCE -> UNKNOWN
 * =========================================================
 */

const partialResult = await runCheck2({
  ...sharedInput,

  evidenceCollector: partialEvidenceCollector,
});

assert.equal(
  partialResult.status,
  "UNKNOWN",
  "partial evidence without an established concern must remain UNKNOWN",
);

assert.equal(
  partialResult.conclusion,
  "Scout did not establish a material sensitive-information concern, but some planned evidence could not be collected.",
);

assert.ok(
  partialResult.limitation,
  "partial evidence UNKNOWN should explain the limitation",
);

console.log("PASS — partial read-only fixture remains UNKNOWN");

/*
 * =========================================================
 * RESULT
 * =========================================================
 */

console.log("\nPassed 3/3 checks.");
