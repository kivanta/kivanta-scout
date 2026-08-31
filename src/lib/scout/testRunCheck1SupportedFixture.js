import { runCheck1 } from "./runCheck1.js";

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
    {
      path: "technocore_client.py",
      type: "blob",
    },
  ],
};

const python = {
  hasPython: true,
  pythonFileCount: 2,

  dependencyFiles: ["pyproject.toml"],
};

const technocoreEvidence = {
  established: true,

  matches: [
    {
      path: "technocore_client.py",
      signals: ["technocore_host", "room_api", "did_key", "signed_message_api"],
    },
  ],
};

const toolIdentity = {
  singleTool: true,
  projectRoot: ".",

  projectMarkers: ["pyproject.toml"],

  entryPointCandidates: ["main.py"],
};

async function fixtureEvidenceCollector() {
  return {
    status: "evidence_collected",
    fileCount: 3,

    files: [
      {
        path: "main.py",
        status: "file_found",

        content: `
from technocore_client import send_message

if __name__ == "__main__":
    send_message()
`,
      },

      {
        path: "pyproject.toml",
        status: "file_found",

        content: `
[project]
name = "fixture-technocore-tool"
version = "1.0.0"
`,
      },

      {
        path: "technocore_client.py",
        status: "file_found",

        content: `
TECHNOCORE_URL = "https://technocore.chat"
ROOM_PATH = "/r/example"
DID = "did:key:z6MkExample"
SIGNING_ALGORITHM = "ed25519"
`,
      },
    ],
  };
}

const result = await runCheck1({
  owner: "fixture-owner",
  repo: "fixture-tool",
  branch: "main",

  sourceAssessment: {
    status: "supported_source",
  },

  tree: tree,
  python: python,
  technocoreEvidence: technocoreEvidence,
  toolIdentity: toolIdentity,

  evidenceCollector: fixtureEvidenceCollector,
});

console.log(result);
