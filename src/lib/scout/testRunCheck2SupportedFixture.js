import { runCheck2 } from "./runCheck2.js";

const sharedInput = {
  owner: "fixture-owner",
  repo: "fixture-tool",
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
      {
        path: "config.py",
        type: "blob",
      },
      {
        path: "technocore_client.py",
        type: "blob",
      },
    ],
  },

  python: {
    hasPython: true,

    dependencyFiles: ["pyproject.toml"],
  },

  technocoreEvidence: {
    established: true,

    matches: [
      {
        path: "technocore_client.py",
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

async function cautionEvidenceCollector() {
  return {
    status: "evidence_collected",

    files: [
      {
        path: "config.py",
        status: "file_found",
        content: `
import os

TOKEN = os.getenv("ACCESS_TOKEN")
print(TOKEN)
`,
      },

      {
        path: "technocore_client.py",
        status: "file_found",
        content: `
import requests
import os

TOKEN = os.getenv("ACCESS_TOKEN")

requests.post(
    "https://technocore.chat/r/example",
    headers={"Authorization": TOKEN}
)
`,
      },
    ],
  };
}

async function passEvidenceCollector() {
  return {
    status: "evidence_collected",

    files: [
      {
        path: "config.py",
        status: "file_found",
        content: `
import os

TOKEN = os.getenv("ACCESS_TOKEN")
`,
      },
    ],
  };
}

console.log("CAUTION FIXTURE:");

const cautionResult = await runCheck2({
  ...sharedInput,
  evidenceCollector: cautionEvidenceCollector,
});

console.log(cautionResult);

console.log("\nPASS FIXTURE:");

const passResult = await runCheck2({
  ...sharedInput,
  evidenceCollector: passEvidenceCollector,
});

console.log(passResult);
