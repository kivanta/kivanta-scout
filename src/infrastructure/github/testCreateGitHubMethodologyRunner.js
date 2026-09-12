/*
 * Test Create GitHub Methodology Runner
 *
 * Confirms one hardened request boundary reaches:
 *
 * - frozen source assessment
 * - Check 1 evidence
 * - Check 2 evidence
 * - Check 3 evidence
 * - Check 4 target evidence
 * - Check 4 official-reference evidence
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

let check4TargetReceivedRequest = false;

let check4ReferenceReceivedRequest = false;

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

/*
 * Generic evidence collector used by
 * Checks 1–3.
 */

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

/*
 * Generic fake Check runner used by
 * Checks 1–3.
 */

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

/*
 * ------------------------------------------------
 * Check 4 fake evidence collector
 * ------------------------------------------------
 *
 * Check 4 must prove the request boundary reaches:
 *
 * - target repository evidence
 * - official Technocore reference evidence
 */

const fakeCheck4EvidenceCollector = async ({ owner, repo, request }) => {
  if (owner === "kivanta" && repo === "example") {
    check4TargetReceivedRequest = request === injectedRequest;
  }

  if (owner === "flop-labs" && repo === "technocore-chat") {
    check4ReferenceReceivedRequest = request === injectedRequest;
  }

  return {
    status: "evidence_collected",

    fileCount: 0,

    files: [],
  };
};

/*
 * ------------------------------------------------
 * Check 4 fake reference-profile builder
 * ------------------------------------------------
 *
 * The production builder receives an evidence
 * collector.
 *
 * We invoke that collector against a fake version
 * of the official reference repository to confirm
 * the hardened request remains attached.
 */

const fakeCheck4ReferenceProfileBuilder = async ({ evidenceCollector }) => {
  await evidenceCollector({
    owner: "flop-labs",

    repo: "technocore-chat",

    branch: "reference-commit",

    evidencePlan: {
      status: "evidence_plan_ready",

      paths: ["SKILL.md"],
    },
  });

  return {
    status: "reference_profile_ready",

    authority: {
      repositoryId: 1332656411,
    },

    profile: {
      status: "behavior_profile_ready",

      behaviors: {},
    },
  };
};

/*
 * ------------------------------------------------
 * Check 4 fake runner
 * ------------------------------------------------
 *
 * The real runCheck4() receives:
 *
 * targetEvidenceCollector
 * referenceProfileBuilder
 *
 * Exercise both seams.
 */

const fakeCheck4Runner = async ({
  targetEvidenceCollector,
  referenceProfileBuilder,
}) => {
  await targetEvidenceCollector({
    owner: "kivanta",

    repo: "example",

    branch: "abc123",

    evidencePlan: {
      status: "evidence_plan_ready",

      paths: ["main.py"],
    },
  });

  await referenceProfileBuilder();

  return {
    status: "PASS",
  };
};

/*
 * ------------------------------------------------
 * Fake Methodology runner
 * ------------------------------------------------
 */

const fakeMethodologyRunner = async (
  owner,
  repo,

  {
    sourceAssessor,

    check1Runner,

    check2Runner,

    check3Runner,

    check4Runner,
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

  await check4Runner({
    owner,

    repo,
  });

  return {
    status: "methodology_run",

    executionStatus: "complete",
  };
};

/*
 * ------------------------------------------------
 * Fake frozen Methodology runner
 * ------------------------------------------------
 */

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

    check4Runner: fakeCheck4Runner,

    check1EvidenceCollector: createFakeEvidenceCollector((value) => {
      check1ReceivedRequest = value;
    }),

    check2EvidenceCollector: createFakeEvidenceCollector((value) => {
      check2ReceivedRequest = value;
    }),

    check3EvidenceCollector: createFakeEvidenceCollector((value) => {
      check3ReceivedRequest = value;
    }),

    check4EvidenceCollector: fakeCheck4EvidenceCollector,

    check4ReferenceProfileBuilder: fakeCheck4ReferenceProfileBuilder,
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
    "Check 4 target evidence receives hardened request",
    check4TargetReceivedRequest,
  ),
);

results.push(
  check(
    "Check 4 reference evidence receives hardened request",
    check4ReferenceReceivedRequest,
  ),
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
