/*
 * Test Evidence Collector Request Injection
 *
 * Confirms Checks 1–3 evidence collectors pass the
 * injected request boundary into getGitHubFile().
 *
 * No real network requests are made.
 */

import { collectCheck1Evidence } from "./collectCheck1Evidence.js";
import { collectCheck2Evidence } from "./collectCheck2Evidence.js";
import { collectCheck3Evidence } from "./collectCheck3Evidence.js";

function check(name, condition) {
  console.log(`${condition ? "PASS" : "FAIL"} — ${name}`);

  return Boolean(condition);
}

const results = [];

const injectedRequest = async () => {
  throw new Error(
    "injected request should only be observed by the fake file getter",
  );
};

const evidencePlan = {
  status: "evidence_plan_ready",

  paths: ["tool.py", "config.json"],
};

function createFakeFileGetter(observations) {
  return async (owner, repo, path, branch, request) => {
    observations.push({
      owner,
      repo,
      path,
      branch,
      request,
    });

    return {
      status: "file_found",

      path,

      content: `content:${path}`,
    };
  };
}

async function testCollector({ name, collector }) {
  const observations = [];

  const result = await collector({
    owner: "kivanta",

    repo: "example",

    branch: "abc123",

    evidencePlan,

    request: injectedRequest,

    fileGetter: createFakeFileGetter(observations),
  });

  results.push(
    check(
      `${name} passes request to every file read`,
      observations.length === 2 &&
        observations.every(
          (item) =>
            item.owner === "kivanta" &&
            item.repo === "example" &&
            item.branch === "abc123" &&
            item.request === injectedRequest,
        ),
    ),
  );

  results.push(
    check(
      `${name} preserves collected evidence result`,
      result.status === "evidence_collected" &&
        result.fileCount === 2 &&
        result.files.length === 2 &&
        result.files[0].content === "content:tool.py" &&
        result.files[1].content === "content:config.json",
    ),
  );
}

await testCollector({
  name: "Check 1 collector",

  collector: collectCheck1Evidence,
});

await testCollector({
  name: "Check 2 collector",

  collector: collectCheck2Evidence,
});

await testCollector({
  name: "Check 3 collector",

  collector: collectCheck3Evidence,
});

/*
 * Existing partial-evidence semantics must remain
 * unchanged as well.
 */

const partial = await collectCheck1Evidence({
  owner: "kivanta",

  repo: "example",

  branch: "abc123",

  evidencePlan,

  request: injectedRequest,

  fileGetter: async (_owner, _repo, path, _branch, request) => {
    if (request !== injectedRequest) {
      throw new Error("request injection was not preserved");
    }

    if (path === "tool.py") {
      return {
        status: "file_found",

        path,

        content: "hello",
      };
    }

    return {
      status: "file_not_found",

      path,
    };
  },
});

results.push(
  check(
    "partial evidence semantics preserved",
    partial.status === "evidence_partial" &&
      partial.fileCount === 2 &&
      partial.files[0].status === "file_found" &&
      partial.files[1].status === "file_not_found",
  ),
);

const passed = results.filter(Boolean).length;

console.log("");
console.log(`Passed ${passed}/${results.length} checks.`);

if (passed !== results.length) {
  process.exitCode = 1;
}
