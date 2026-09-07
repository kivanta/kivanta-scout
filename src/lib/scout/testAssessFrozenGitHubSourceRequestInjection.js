/*
 * Test Assess Frozen GitHub Source Request Injection
 *
 * Confirms one injected request boundary is passed
 * through every network-reading dependency used by
 * frozen source verification.
 *
 * No real network requests are made.
 */

import { assessFrozenGitHubSource } from "./assessFrozenGitHubSource.js";

function check(name, condition) {
  console.log(`${condition ? "PASS" : "FAIL"} — ${name}`);

  return Boolean(condition);
}

const results = [];

const injectedRequest = async () => {
  throw new Error("test request should be observed, not executed directly");
};

const target = {
  source: {
    repositoryId: "123",

    owner: "kivanta",

    repo: "example",

    commitSha: "abc123",

    treeSha: "tree123",
  },
};

let repoRequestReceived = false;

let commitRequestReceived = false;

let treeRequestReceived = false;

let technocoreRequestReceived = false;

/*
 * ------------------------------------------------
 * Inject fake source dependencies
 * ------------------------------------------------
 */

const result = await assessFrozenGitHubSource(
  target,

  {
    request: injectedRequest,

    repoGetter: async (owner, repo, request) => {
      repoRequestReceived =
        owner === "kivanta" &&
        repo === "example" &&
        request === injectedRequest;

      return {
        status: "repo_found",

        repositoryId: 123,

        fullName: "kivanta/example",

        defaultBranch: "main",

        archived: false,
      };
    },

    commitGetter: async (owner, repo, ref, request) => {
      commitRequestReceived =
        owner === "kivanta" &&
        repo === "example" &&
        ref === "abc123" &&
        request === injectedRequest;

      return {
        status: "commit_found",

        commitSha: "abc123",

        treeSha: "tree123",
      };
    },

    treeGetter: async (owner, repo, ref, request) => {
      treeRequestReceived =
        owner === "kivanta" &&
        repo === "example" &&
        ref === "abc123" &&
        request === injectedRequest;

      return {
        status: "tree_found",

        truncated: false,

        items: [
          {
            path: "tool.py",

            type: "blob",
          },
        ],
      };
    },

    pythonDetector: () => {
      return {
        established: true,

        files: ["tool.py"],
      };
    },

    technocoreDetector: async ({ owner, repo, branch, items, request }) => {
      technocoreRequestReceived =
        owner === "kivanta" &&
        repo === "example" &&
        branch === "abc123" &&
        Array.isArray(items) &&
        request === injectedRequest;

      return {
        established: true,

        sourceFileCountChecked: 1,

        signals: ["technocore_host", "room_api"],

        matches: [
          {
            path: "tool.py",

            signals: ["technocore_host", "room_api"],
          },
        ],
      };
    },

    toolIdentifier: () => {
      return {
        status: "single_tool_identified",

        path: "tool.py",
      };
    },

    supportEvaluator: () => {
      return {
        status: "supported_source",

        reason: null,
      };
    },
  },
);

/*
 * ------------------------------------------------
 * Verify request propagation
 * ------------------------------------------------
 */

results.push(
  check("repository getter receives injected request", repoRequestReceived),
);

results.push(
  check("commit getter receives injected request", commitRequestReceived),
);

results.push(
  check("tree getter receives injected request", treeRequestReceived),
);

results.push(
  check(
    "Technocore detector receives injected request",
    technocoreRequestReceived,
  ),
);

/*
 * ------------------------------------------------
 * Verify frozen-source semantics remain intact
 * ------------------------------------------------
 */

results.push(
  check(
    "supported source result preserved",
    result.status === "supported_source",
  ),
);

results.push(
  check(
    "frozen repository identity preserved",
    String(result.repository?.repositoryId) === "123",
  ),
);

results.push(
  check(
    "frozen commit preserved",
    result.repository?.commitSha === "abc123" &&
      result.frozenSnapshot?.commitSha === "abc123",
  ),
);

results.push(
  check(
    "frozen tree preserved",
    result.repository?.treeSha === "tree123" &&
      result.frozenSnapshot?.treeSha === "tree123",
  ),
);

/*
 * ------------------------------------------------
 * Final
 * ------------------------------------------------
 */

const passed = results.filter(Boolean).length;

console.log("");
console.log(`Passed ${passed}/${results.length} checks.`);

if (passed !== results.length) {
  process.exitCode = 1;
}
