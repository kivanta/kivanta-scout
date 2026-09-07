/*
 * Test GitHub Request Injection
 *
 * Confirms Scout's existing GitHub readers can use
 * an injected request boundary without real network
 * access.
 */

import { getGitHubRepo } from "./getGitHubRepo.js";
import { getGitHubCommit } from "./getGitHubCommit.js";
import { getGitHubRoot } from "./getGitHubRoot.js";
import { getGitHubTree } from "./getGitHubTree.js";
import { getGitHubFile } from "./getGitHubFile.js";
import { detectTechnocoreEvidence } from "./detectTechnocoreEvidence.js";

function check(name, condition) {
  console.log(`${condition ? "PASS" : "FAIL"} — ${name}`);

  return Boolean(condition);
}

const results = [];

/*
 * ------------------------------------------------
 * Repository
 * ------------------------------------------------
 */

let repoRequestSeen = false;

const repo = await getGitHubRepo("kivanta", "example", async (url) => {
  repoRequestSeen = url === "https://api.github.com/repos/kivanta/example";

  return new Response(
    JSON.stringify({
      id: 123,

      full_name: "kivanta/example",

      default_branch: "main",

      archived: false,
    }),
    {
      status: 200,
    },
  );
});

results.push(
  check(
    "repository reader uses injected request",
    repoRequestSeen &&
      repo.status === "repo_found" &&
      repo.repositoryId === 123,
  ),
);

/*
 * ------------------------------------------------
 * Commit
 * ------------------------------------------------
 */

let commitRequestSeen = false;

const commit = await getGitHubCommit(
  "kivanta",
  "example",
  "abc123",
  async (url) => {
    commitRequestSeen = url.endsWith("/commits/abc123");

    return new Response(
      JSON.stringify({
        sha: "abc123",

        commit: {
          tree: {
            sha: "tree123",
          },
        },
      }),
      {
        status: 200,
      },
    );
  },
);

results.push(
  check(
    "commit reader uses injected request",
    commitRequestSeen &&
      commit.status === "commit_found" &&
      commit.treeSha === "tree123",
  ),
);

/*
 * ------------------------------------------------
 * Root
 * ------------------------------------------------
 */

const root = await getGitHubRoot(
  "kivanta",
  "example",
  "abc123",
  async () =>
    new Response(
      JSON.stringify([
        {
          name: "tool.py",

          path: "tool.py",

          type: "file",
        },
      ]),
      {
        status: 200,
      },
    ),
);

results.push(
  check(
    "root reader uses injected request",
    root.status === "root_found" &&
      root.items.length === 1 &&
      root.items[0].path === "tool.py",
  ),
);

/*
 * ------------------------------------------------
 * Tree
 * ------------------------------------------------
 */

const tree = await getGitHubTree(
  "kivanta",
  "example",
  "abc123",
  async () =>
    new Response(
      JSON.stringify({
        truncated: false,

        tree: [
          {
            path: "tool.py",

            type: "blob",
          },
        ],
      }),
      {
        status: 200,
      },
    ),
);

results.push(
  check(
    "tree reader uses injected request",
    tree.status === "tree_found" &&
      tree.truncated === false &&
      tree.items[0].path === "tool.py",
  ),
);

/*
 * ------------------------------------------------
 * File
 * ------------------------------------------------
 */

const file = await getGitHubFile(
  "kivanta",
  "example",
  "tool.py",
  "abc123",
  async () =>
    new Response(
      JSON.stringify({
        type: "file",

        path: "tool.py",

        content: "cHJpbnQoJ2hlbGxvJyk=",
      }),
      {
        status: 200,
      },
    ),
);

results.push(
  check(
    "file reader uses injected request",
    file.status === "file_found" &&
      file.path === "tool.py" &&
      file.content === "print('hello')",
  ),
);

/*
 * ------------------------------------------------
 * Technocore raw evidence
 * ------------------------------------------------
 */

let rawRequestSeen = false;

const technocore = await detectTechnocoreEvidence({
  owner: "kivanta",

  repo: "example",

  branch: "abc123",

  items: [
    {
      path: "tool.py",

      type: "blob",
    },
  ],

  request: async (url) => {
    rawRequestSeen = url.startsWith("https://raw.githubusercontent.com/");

    return new Response(
      `
      API = "https://technocore.chat"
      ROOM = "/r/{room}"
      `,
      {
        status: 200,
      },
    );
  },
});

results.push(
  check(
    "Technocore detector uses injected request",
    rawRequestSeen &&
      technocore.established === true &&
      technocore.signals.includes("technocore_host") &&
      technocore.signals.includes("room_api"),
  ),
);

/*
 * ------------------------------------------------
 * Error semantics remain unchanged
 * ------------------------------------------------
 */

const missingRepo = await getGitHubRepo(
  "kivanta",
  "missing",
  async () =>
    new Response("{}", {
      status: 404,
    }),
);

results.push(
  check(
    "existing 404 semantics preserved",
    missingRepo.status === "repo_not_found",
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
