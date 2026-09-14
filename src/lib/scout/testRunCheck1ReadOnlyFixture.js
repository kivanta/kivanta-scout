/*
 * =========================================================
 * KIVANTA SCOUT
 * CHECK 1 — READ-ONLY SUPPORTED FIXTURE TEST
 * =========================================================
 *
 * PURPOSE
 *
 * Prove that the complete Check 1 runner can establish the
 * behavior of a legitimate read-only Technocore tool that:
 *
 * - uses a public Technocore room endpoint
 * - performs network reads
 * - does NOT use a DID
 * - does NOT sign messages
 * - does NOT require a private key
 *
 *
 * This protects the Methodology from incorrectly requiring
 * identity/signing behavior from tools that do not claim to
 * provide those capabilities.
 */

import assert from "node:assert/strict";

import { runCheck1 } from "./runCheck1.js";

/*
 * ---------------------------------------------------------
 * FROZEN SOURCE SHAPE
 * ---------------------------------------------------------
 */

const tree = {
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
};

/*
 * ---------------------------------------------------------
 * PYTHON PROJECT
 * ---------------------------------------------------------
 */

const python = {
  hasPython: true,

  pythonFileCount: 1,

  dependencyFiles: ["pyproject.toml"],
};

/*
 * ---------------------------------------------------------
 * ESTABLISHED TECHNOCORE DISCOVERY EVIDENCE
 * ---------------------------------------------------------
 *
 * Discovery has already established that this source
 * contains a public Technocore room reference.
 */

const technocoreEvidence = {
  established: true,

  matches: [
    {
      path: "main.py",

      signals: ["technocore_host", "room_api"],
    },
  ],
};

/*
 * ---------------------------------------------------------
 * SINGLE TOOL IDENTITY
 * ---------------------------------------------------------
 */

const toolIdentity = {
  singleTool: true,

  projectRoot: ".",

  projectMarkers: ["pyproject.toml"],

  entryPointCandidates: ["main.py"],
};

/*
 * ---------------------------------------------------------
 * CONTROLLED SOURCE EVIDENCE
 * ---------------------------------------------------------
 *
 * This intentionally contains:
 *
 * - Technocore host
 * - public /r/ room endpoint
 * - HTTP GET behavior
 *
 * It intentionally contains NO:
 *
 * - did:key
 * - Ed25519
 * - signing
 * - secret/key handling
 */

async function fixtureEvidenceCollector() {
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
 * RUN COMPLETE CHECK 1 PIPELINE
 * ---------------------------------------------------------
 */

const result = await runCheck1({
  owner: "fixture-owner",

  repo: "fixture-read-only-tool",

  branch: "main",

  sourceAssessment: {
    status: "supported_source",
  },

  tree,

  python,

  technocoreEvidence,

  toolIdentity,

  evidenceCollector: fixtureEvidenceCollector,
});

/*
 * ---------------------------------------------------------
 * ASSERT RESULT
 * ---------------------------------------------------------
 */

assert.equal(
  result.status,
  "PASS",
  "read-only Technocore tool should PASS Check 1",
);

assert.equal(result.title, "What does this tool actually do?");

assert.equal(
  result.conclusion,
  "Source evidence establishes Technocore network behavior for the inspected tool.",
);

/*
 * ---------------------------------------------------------
 * ASSERT EVIDENCE SHAPE
 * ---------------------------------------------------------
 */

const evidenceCategories = new Set(
  result.evidence.map((entry) => entry.category),
);

assert.equal(
  evidenceCategories.has("technocore"),
  true,
  "Technocore evidence should be present",
);

assert.equal(
  evidenceCategories.has("network"),
  true,
  "Network evidence should be present",
);

assert.equal(
  evidenceCategories.has("identity"),
  false,
  "Read-only fixture must not require identity evidence",
);

assert.equal(
  evidenceCategories.has("signing"),
  false,
  "Read-only fixture must not require signing evidence",
);

/*
 * ---------------------------------------------------------
 * PASS
 * ---------------------------------------------------------
 */

console.log(
  "PASS — read-only Technocore fixture reaches Check 1 PASS through runCheck1()",
);

console.log(
  `PASS — evidence categories: ${[...evidenceCategories].join(", ")}`,
);

console.log("\nPassed 2/2 checks.");
