import { runCheck3 } from "./runCheck3.js";

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
        path: "client.py",
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
        path: "client.py",
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

async function passEvidenceCollector() {
  return {
    status: "evidence_collected",

    files: [
      {
        path: "client.py",
        status: "file_found",

        content: `
import requests

requests.post(
    "https://technocore.chat/r/example"
)
`,
      },
    ],
  };
}

const result = await runCheck3({
  ...sharedInput,
  evidenceCollector: passEvidenceCollector,
});

console.log(result);
