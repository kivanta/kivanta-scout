import { runCheck4 } from "./runCheck4.js";

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
        path: "main.py",
        type: "blob",
      },
      {
        path: "client.py",
        type: "blob",
      },
      {
        path: "pyproject.toml",
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

async function targetEvidenceCollector() {
  return {
    status: "evidence_collected",

    files: [
      {
        path: "main.py",
        status: "file_found",

        content: `
if __name__ == "__main__":
    pass
`,
      },

      {
        path: "client.py",
        status: "file_found",

        content: `
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

DID_PREFIX = "did:key:"
ROOM_URL = "https://technocore.chat/r/example"
`,
      },
    ],
  };
}

async function referenceProfileBuilder() {
  return {
    status: "reference_profile_ready",

    authority: {
      registryVersion: "1.0",
      owner: "flop-labs",
      repo: "technocore-chat",
    },

    profile: {
      status: "behavior_profile_ready",

      behaviors: {
        technocore: {
          observed: true,
          labels: ["technocore_host", "room_endpoint", "kv_endpoint"],
        },

        identity: {
          observed: true,
          labels: ["did_key"],
        },

        signing: {
          observed: true,
          labels: ["ed25519"],
        },

        configuration: {
          observed: true,
          labels: ["environment_variable"],
        },

        network: {
          observed: false,
          labels: [],
        },

        filesystem: {
          observed: false,
          labels: [],
        },

        process: {
          observed: false,
          labels: [],
        },
      },
    },
  };
}

const result = await runCheck4({
  ...sharedInput,

  targetEvidenceCollector: targetEvidenceCollector,

  referenceProfileBuilder: referenceProfileBuilder,
});

console.dir(result, {
  depth: null,
});
