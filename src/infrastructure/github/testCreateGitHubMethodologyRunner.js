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
 * The production runner may wrap the hardened
 * request with investigation-scoped caching.
 *
 * Therefore this test verifies delegation to the
 * injected hardened request rather than requiring
 * exact function identity.
 *
 * No real network calls.
 */

import { createGitHubMethodologyRunner } from "./createGitHubMethodologyRunner.js";

function check(name, condition) {
  console.log(`${condition ? "PASS" : "FAIL"} — ${name}`);

  return Boolean(condition);
}

const results = [];

/*
 * ------------------------------------------------
 * Fake hardened request boundary
 * ------------------------------------------------
 *
 * Every composed request wrapper must eventually
 * delegate here.
 */

const observedRequests = [];

const injectedRequest = async (input) => {
  observedRequests.push(String(input));

  return new Response("{}", {
    status: 200,

    headers: {
      "content-type": "application/json",
    },
  });
};

let frozenSourceDelegatedRequest = false;

let check1DelegatedRequest = false;

let check2DelegatedRequest = false;

let check3DelegatedRequest = false;

let check4TargetDelegatedRequest = false;

let check4ReferenceDelegatedRequest = false;

let frozenSourceAssessorPreserved = false;

let returnedRunnerExecuted = false;

/*
 * ------------------------------------------------
 * Delegation helper
 * ------------------------------------------------
 */

async function requestDelegated(request, url) {
  if (typeof request !== "function") {
    return false;
  }

  const before = observedRequests.length;

  await request(url);

  const after = observedRequests.length;

  return after === before + 1 && observedRequests[after - 1] === url;
}

/*
 * ------------------------------------------------
 * Fake frozen source assessor
 * ------------------------------------------------
 */

const fakeFrozenSourceAssessor = async (
  _target,

  { request },
) => {
  frozenSourceDelegatedRequest = await requestDelegated(
    request,
    "https://api.github.com/repos/kivanta/example",
  );

  return {
    status: "supported_source",
  };
};

/*
 * ------------------------------------------------
 * Generic evidence collector
 * ------------------------------------------------
 *
 * Checks 1–3 receive a request dependency.
 *
 * We prove that dependency delegates to the original
 * injected hardened request boundary.
 */

function createFakeEvidenceCollector(setObserved, label) {
  return async ({ request }) => {
    const delegated = await requestDelegated(
      request,
      `https://api.github.com/repos/kivanta/example/contents/${label}.py?ref=abc123`,
    );

    setObserved(delegated);

    return {
      status: "evidence_collected",

      fileCount: 0,

      files: [],
    };
  };
}

/*
 * ------------------------------------------------
 * Generic fake Check runner
 * ------------------------------------------------
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
    check4TargetDelegatedRequest = await requestDelegated(
      request,
      "https://api.github.com/repos/kivanta/example/contents/main.py?ref=abc123",
    );
  }

  if (owner === "flop-labs" && repo === "technocore-chat") {
    check4ReferenceDelegatedRequest = await requestDelegated(
      request,
      "https://api.github.com/repos/flop-labs/technocore-chat/contents/SKILL.md?ref=reference-commit",
    );
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
      check1DelegatedRequest = value;
    }, "check1"),

    check2EvidenceCollector: createFakeEvidenceCollector((value) => {
      check2DelegatedRequest = value;
    }, "check2"),

    check3EvidenceCollector: createFakeEvidenceCollector((value) => {
      check3DelegatedRequest = value;
    }, "check3"),

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
  check(
    "frozen source delegates to hardened request",
    frozenSourceDelegatedRequest,
  ),
);

results.push(
  check(
    "Check 1 evidence delegates to hardened request",
    check1DelegatedRequest,
  ),
);

results.push(
  check(
    "Check 2 evidence delegates to hardened request",
    check2DelegatedRequest,
  ),
);

results.push(
  check(
    "Check 3 evidence delegates to hardened request",
    check3DelegatedRequest,
  ),
);

results.push(
  check(
    "Check 4 target evidence delegates to hardened request",
    check4TargetDelegatedRequest,
  ),
);

results.push(
  check(
    "Check 4 reference evidence delegates to hardened request",
    check4ReferenceDelegatedRequest,
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
 * Hardened request was actually exercised
 * ------------------------------------------------
 */

results.push(
  check("hardened request boundary exercised", observedRequests.length === 6),
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
