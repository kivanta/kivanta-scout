/*
 * Test Create GitHub Methodology Runner
 *
 * Confirms one hardened request boundary reaches:
 *
 * - frozen source assessment
 * - Check 1 evidence
 * - Check 2 evidence
 * - Check 3 evidence
 *
 * No real network calls.
 */

import { createGitHubMethodologyRunner } from "./createGitHubMethodologyRunner.js";

function check(name, condition) {
  console.log(`${condition ? "PASS" : "FAIL"} — ${name}`);

  return Boolean(condition);
}

const results = [];

const injectedRequest = async () => {
  throw new Error("test request should only be observed");
};

let frozenSourceReceivedRequest = false;

let check1ReceivedRequest = false;

let check2ReceivedRequest = false;

let check3ReceivedRequest = false;

let frozenSourceAssessorPreserved = false;

let returnedRunnerExecuted = false;

/*
 * ------------------------------------------------
 * Fake dependencies
 * ------------------------------------------------
 */

const fakeFrozenSourceAssessor = async (
  _target,

  { request },
) => {
  frozenSourceReceivedRequest = request === injectedRequest;

  return {
    status: "supported_source",
  };
};

function createFakeEvidenceCollector(setObserved) {
  return async ({ request }) => {
    setObserved(request === injectedRequest);

    return {
      status: "evidence_collected",

      fileCount: 0,

      files: [],
    };
  };
}

function createFakeCheckRunner() {
  return async ({ evidenceCollector }) => {
    await evidenceCollector({
      owner: "kivanta",

      repo: "example",

      branch: "abc123",

      evidencePlan: {
        status: "evidence_plan_ready",

        paths: [],
      },
    });

    return {
      status: "PASS",
    };
  };
}

const fakeMethodologyRunner = async (
  owner,
  repo,

  {
    sourceAssessor,

    check1Runner,

    check2Runner,

    check3Runner,
  },
) => {
  frozenSourceAssessorPreserved = typeof sourceAssessor === "function";

  await check1Runner({
    owner,

    repo,
  });

  await check2Runner({
    owner,

    repo,
  });

  await check3Runner({
    owner,

    repo,
  });

  return {
    status: "methodology_run",

    executionStatus: "complete",
  };
};

const fakeFrozenMethodologyRunner = async (
  input,

  {
    frozenSourceAssessor,

    methodologyRunner,
  },
) => {
  returnedRunnerExecuted = true;

  await frozenSourceAssessor(input.target);

  const frozenMethodologySourceAssessor = async () => {
    return {
      status: "supported_source",
    };
  };

  return methodologyRunner(
    "kivanta",

    "example",

    {
      sourceAssessor: frozenMethodologySourceAssessor,
    },
  );
};

/*
 * ------------------------------------------------
 * Build bound runner
 * ------------------------------------------------
 */

const runner = createGitHubMethodologyRunner(
  {
    request: injectedRequest,
  },

  {
    frozenMethodologyRunner: fakeFrozenMethodologyRunner,

    frozenSourceAssessor: fakeFrozenSourceAssessor,

    methodologyRunner: fakeMethodologyRunner,

    check1Runner: createFakeCheckRunner(),

    check2Runner: createFakeCheckRunner(),

    check3Runner: createFakeCheckRunner(),

    check1EvidenceCollector: createFakeEvidenceCollector((value) => {
      check1ReceivedRequest = value;
    }),

    check2EvidenceCollector: createFakeEvidenceCollector((value) => {
      check2ReceivedRequest = value;
    }),

    check3EvidenceCollector: createFakeEvidenceCollector((value) => {
      check3ReceivedRequest = value;
    }),
  },
);

const result = await runner({
  target: {
    source: {
      repositoryId: "123",

      owner: "kivanta",

      repo: "example",

      commitSha: "abc123",

      treeSha: "tree123",
    },
  },
});

/*
 * ------------------------------------------------
 * Assertions
 * ------------------------------------------------
 */

results.push(
  check("bound Methodology runner executes", returnedRunnerExecuted),
);

results.push(
  check("frozen source receives hardened request", frozenSourceReceivedRequest),
);

results.push(
  check("Check 1 evidence receives hardened request", check1ReceivedRequest),
);

results.push(
  check("Check 2 evidence receives hardened request", check2ReceivedRequest),
);

results.push(
  check("Check 3 evidence receives hardened request", check3ReceivedRequest),
);

results.push(
  check(
    "frozen Methodology source assessor preserved",
    frozenSourceAssessorPreserved,
  ),
);

results.push(
  check(
    "Methodology result preserved",
    result.status === "methodology_run" &&
      result.executionStatus === "complete",
  ),
);

/*
 * ------------------------------------------------
 * Invalid request must fail composition
 * ------------------------------------------------
 */

let missingRequestRejected = false;

try {
  createGitHubMethodologyRunner();
} catch (error) {
  missingRequestRejected = error?.code === "github_request_boundary_required";
}

results.push(
  check("missing request boundary rejected", missingRequestRejected),
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
