/*
 * Frozen GitHub Source Assessment Test
 *
 * Tests:
 *
 *   assessFrozenGitHubSource()
 *
 * without contacting GitHub or any real upstream
 * service.
 *
 *
 * We verify:
 *
 * 1. missing frozen target is rejected
 * 2. incomplete frozen snapshot is rejected
 * 3. unavailable repository is rejected
 * 4. repository identity mismatch is rejected
 * 5. unavailable frozen commit is rejected
 * 6. commit identity mismatch is rejected
 * 7. tree identity mismatch is rejected
 * 8. unavailable repository tree is rejected
 *
 * Happy path:
 *
 * 9. stable repository ID is verified
 * 10. exact frozen commit SHA is used
 * 11. default branch is NOT used for execution
 * 12. exact frozen tree SHA is verified
 * 13. tree is read at frozen commit
 * 14. Python observations are rebuilt
 * 15. Technocore evidence is rebuilt at frozen commit
 * 16. tool identity is rebuilt
 * 17. existing source-support evaluator is reused
 * 18. existing source-assessment shape is preserved
 * 19. explicit frozen provenance is returned
 */

import { assessFrozenGitHubSource } from "./assessFrozenGitHubSource.js";

/*
 * ------------------------------------------------
 * Frozen target fixture
 * ------------------------------------------------
 */

const FROZEN_REPOSITORY_ID = "13371337";

const FROZEN_COMMIT_SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

const FROZEN_TREE_SHA = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function createFrozenTarget() {
  return {
    frozenAt: "2026-09-07T12:00:00.000Z",

    source: {
      /*
       * String on purpose.
       *
       * GitHub normally returns repository IDs as
       * numbers. The assessor must normalize both.
       */
      repositoryId: FROZEN_REPOSITORY_ID,

      owner: "kivanta",

      repo: "fixture-agent",

      canonicalUrl: "https://github.com/kivanta/fixture-agent",

      /*
       * This is intentionally present to prove that
       * execution does NOT resolve this moving branch.
       */
      defaultBranch: "main",

      commitSha: FROZEN_COMMIT_SHA,

      treeSha: FROZEN_TREE_SHA,
    },

    methodology: {
      id: "kivanta-scout-methodology",

      version: "1.0",
    },
  };
}

/*
 * ------------------------------------------------
 * Dependency fixture factory
 * ------------------------------------------------
 */

function createDependencies({
  repoGetterImpl,

  commitGetterImpl,

  treeGetterImpl,

  pythonDetectorImpl,

  technocoreDetectorImpl,

  toolIdentifierImpl,

  supportEvaluatorImpl,
} = {}) {
  return {
    repoGetter:
      repoGetterImpl ||
      (async () => ({
        status: "repo_found",

        /*
         * Number on purpose.
         *
         * Frozen target stores the same identity
         * as text.
         */
        repositoryId: Number(FROZEN_REPOSITORY_ID),

        fullName: "kivanta/fixture-agent",

        defaultBranch: "main",

        archived: false,
      })),

    commitGetter:
      commitGetterImpl ||
      (async () => ({
        status: "commit_found",

        commitSha: FROZEN_COMMIT_SHA,

        treeSha: FROZEN_TREE_SHA,
      })),

    treeGetter:
      treeGetterImpl ||
      (async () => ({
        status: "tree_found",

        truncated: false,

        items: [
          {
            path: "agent.py",

            type: "blob",
          },

          {
            path: "README.md",

            type: "blob",
          },
        ],
      })),

    pythonDetector:
      pythonDetectorImpl ||
      (() => ({
        status: "python_surfaces_found",

        files: ["agent.py"],
      })),

    technocoreDetector:
      technocoreDetectorImpl ||
      (async () => ({
        status: "technocore_evidence_found",

        evidence: [
          {
            path: "agent.py",
          },
        ],
      })),

    toolIdentifier:
      toolIdentifierImpl ||
      (() => ({
        status: "single_tool_identified",

        candidate: {
          path: "agent.py",
        },
      })),

    supportEvaluator:
      supportEvaluatorImpl ||
      (() => ({
        status: "supported_source",

        reason: null,

        methodologyEligible: true,
      })),
  };
}

/*
 * =================================================
 * TEST 1
 * Missing target
 * =================================================
 */

console.log("\n===== MISSING FROZEN TARGET =====");

const missingTargetResult = await assessFrozenGitHubSource(
  null,
  createDependencies(),
);

console.dir(missingTargetResult, {
  depth: null,
});

/*
 * =================================================
 * TEST 2
 * Incomplete frozen snapshot
 * =================================================
 */

console.log("\n===== INCOMPLETE FROZEN SNAPSHOT =====");

const incompleteTarget = createFrozenTarget();

delete incompleteTarget.source.commitSha;

const incompleteSnapshotResult = await assessFrozenGitHubSource(
  incompleteTarget,
  createDependencies(),
);

console.dir(incompleteSnapshotResult, {
  depth: null,
});

/*
 * =================================================
 * TEST 3
 * Repository unavailable
 * =================================================
 */

console.log("\n===== REPOSITORY UNAVAILABLE =====");

const unavailableRepositoryResult = await assessFrozenGitHubSource(
  createFrozenTarget(),
  createDependencies({
    repoGetterImpl: async () => ({
      status: "repo_not_found",
    }),
  }),
);

console.dir(unavailableRepositoryResult, {
  depth: null,
});

/*
 * =================================================
 * TEST 4
 * Repository identity mismatch
 * =================================================
 */

console.log("\n===== REPOSITORY IDENTITY MISMATCH =====");

const repositoryMismatchResult = await assessFrozenGitHubSource(
  createFrozenTarget(),
  createDependencies({
    repoGetterImpl: async () => ({
      status: "repo_found",

      repositoryId: 99999999,

      fullName: "kivanta/fixture-agent",

      defaultBranch: "main",

      archived: false,
    }),
  }),
);

console.dir(repositoryMismatchResult, {
  depth: null,
});

/*
 * =================================================
 * TEST 5
 * Frozen commit unavailable
 * =================================================
 */

console.log("\n===== FROZEN COMMIT UNAVAILABLE =====");

const unavailableCommitResult = await assessFrozenGitHubSource(
  createFrozenTarget(),
  createDependencies({
    commitGetterImpl: async () => ({
      status: "commit_not_found",
    }),
  }),
);

console.dir(unavailableCommitResult, {
  depth: null,
});

/*
 * =================================================
 * TEST 6
 * Frozen commit identity mismatch
 * =================================================
 */

console.log("\n===== FROZEN COMMIT IDENTITY MISMATCH =====");

const commitMismatchResult = await assessFrozenGitHubSource(
  createFrozenTarget(),
  createDependencies({
    commitGetterImpl: async () => ({
      status: "commit_found",

      commitSha: "cccccccccccccccccccccccccccccccccccccccc",

      treeSha: FROZEN_TREE_SHA,
    }),
  }),
);

console.dir(commitMismatchResult, {
  depth: null,
});

/*
 * =================================================
 * TEST 7
 * Frozen tree identity mismatch
 * =================================================
 */

console.log("\n===== FROZEN TREE IDENTITY MISMATCH =====");

const treeMismatchResult = await assessFrozenGitHubSource(
  createFrozenTarget(),
  createDependencies({
    commitGetterImpl: async () => ({
      status: "commit_found",

      commitSha: FROZEN_COMMIT_SHA,

      treeSha: "dddddddddddddddddddddddddddddddddddddddd",
    }),
  }),
);

console.dir(treeMismatchResult, {
  depth: null,
});

/*
 * =================================================
 * TEST 8
 * Repository tree unavailable
 * =================================================
 */

console.log("\n===== FROZEN TREE UNAVAILABLE =====");

const unavailableTreeResult = await assessFrozenGitHubSource(
  createFrozenTarget(),
  createDependencies({
    treeGetterImpl: async () => ({
      status: "tree_not_found",
    }),
  }),
);

console.dir(unavailableTreeResult, {
  depth: null,
});

/*
 * =================================================
 * HAPPY PATH
 * =================================================
 */

const repoCalls = [];

const commitCalls = [];

const treeCalls = [];

const pythonCalls = [];

const technocoreCalls = [];

const toolIdentityCalls = [];

const supportCalls = [];

const expectedTree = {
  status: "tree_found",

  truncated: false,

  items: [
    {
      path: "src/agent.py",

      type: "blob",
    },

    {
      path: "README.md",

      type: "blob",
    },
  ],
};

const expectedPython = {
  status: "python_surfaces_found",

  files: ["src/agent.py"],
};

const expectedTechnocoreEvidence = {
  status: "technocore_evidence_found",

  evidence: [
    {
      path: "src/agent.py",

      type: "fixture-technocore-evidence",
    },
  ],
};

const expectedToolIdentity = {
  status: "single_tool_identified",

  candidate: {
    path: "src/agent.py",

    name: "Fixture Agent",
  },
};

const expectedSupport = {
  status: "supported_source",

  reason: null,

  methodologyEligible: true,

  supportDetails: {
    fixture: true,
  },
};

const happyDependencies = createDependencies({
  repoGetterImpl: async (owner, repo) => {
    repoCalls.push({
      owner,
      repo,
    });

    return {
      status: "repo_found",

      /*
       * Number from simulated GitHub API.
       */
      repositoryId: Number(FROZEN_REPOSITORY_ID),

      fullName: "kivanta/fixture-agent",

      /*
       * Deliberately pretend the live default
       * branch is now different.
       *
       * If production execution is truly frozen,
       * this value must never control the commit
       * selection below.
       */
      defaultBranch: "future-moving-branch",

      archived: false,
    };
  },

  commitGetterImpl: async (owner, repo, ref) => {
    commitCalls.push({
      owner,
      repo,
      ref,
    });

    return {
      status: "commit_found",

      commitSha: FROZEN_COMMIT_SHA,

      treeSha: FROZEN_TREE_SHA,
    };
  },

  treeGetterImpl: async (owner, repo, ref) => {
    treeCalls.push({
      owner,
      repo,
      ref,
    });

    return expectedTree;
  },

  pythonDetectorImpl: (items) => {
    pythonCalls.push(items);

    return expectedPython;
  },

  technocoreDetectorImpl: async (input) => {
    technocoreCalls.push(input);

    return expectedTechnocoreEvidence;
  },

  toolIdentifierImpl: (items, technocoreEvidence) => {
    toolIdentityCalls.push({
      items,
      technocoreEvidence,
    });

    return expectedToolIdentity;
  },

  supportEvaluatorImpl: (input) => {
    supportCalls.push(input);

    return expectedSupport;
  },
});

console.log("\n===== HAPPY FROZEN SOURCE ASSESSMENT =====");

const happyResult = await assessFrozenGitHubSource(
  createFrozenTarget(),
  happyDependencies,
);

console.dir(happyResult, {
  depth: null,
});

/*
 * ------------------------------------------------
 * FINAL ASSERTIONS
 * ------------------------------------------------
 */

const tests = {
  /*
   * Validation
   */
  missingTargetRejected:
    missingTargetResult.status === "source_not_established" &&
    missingTargetResult.reason === "frozen_source_target_required",

  incompleteSnapshotRejected:
    incompleteSnapshotResult.status === "source_not_established" &&
    incompleteSnapshotResult.reason === "frozen_source_snapshot_not_available",

  /*
   * Repository identity
   */
  unavailableRepositoryRejected:
    unavailableRepositoryResult.status === "source_not_established" &&
    unavailableRepositoryResult.reason === "repository_not_available",

  repositoryMismatchRejected:
    repositoryMismatchResult.status === "source_not_established" &&
    repositoryMismatchResult.reason === "frozen_repository_identity_mismatch",

  expectedRepositoryIdReturned:
    repositoryMismatchResult.expectedRepositoryId === FROZEN_REPOSITORY_ID,

  observedRepositoryIdReturned:
    repositoryMismatchResult.observedRepositoryId === "99999999",

  /*
   * Commit identity
   */
  unavailableCommitRejected:
    unavailableCommitResult.status === "source_not_established" &&
    unavailableCommitResult.reason === "frozen_commit_not_available",

  commitMismatchRejected:
    commitMismatchResult.status === "source_not_established" &&
    commitMismatchResult.reason === "frozen_commit_identity_mismatch",

  expectedCommitReturned:
    commitMismatchResult.expectedCommitSha === FROZEN_COMMIT_SHA,

  /*
   * Tree identity
   */
  treeMismatchRejected:
    treeMismatchResult.status === "source_not_established" &&
    treeMismatchResult.reason === "frozen_tree_identity_mismatch",

  expectedTreeReturned: treeMismatchResult.expectedTreeSha === FROZEN_TREE_SHA,

  unavailableTreeRejected:
    unavailableTreeResult.status === "source_not_established" &&
    unavailableTreeResult.reason === "repository_tree_not_available",

  /*
   * Happy path
   */
  happySourceSupported: happyResult.status === "supported_source",

  repositoryReadOnce: repoCalls.length === 1,

  repositoryCoordinatesCorrect:
    repoCalls[0]?.owner === "kivanta" && repoCalls[0]?.repo === "fixture-agent",

  /*
   * Critical frozen-commit assertion.
   *
   * The live default branch returned above is:
   *
   * future-moving-branch
   *
   * but the commit getter MUST receive:
   *
   * aaaaaaaaa...
   */
  commitReadOnce: commitCalls.length === 1,

  frozenCommitPassedToCommitGetter: commitCalls[0]?.ref === FROZEN_COMMIT_SHA,

  movingDefaultBranchIgnored:
    commitCalls[0]?.ref !== "future-moving-branch" &&
    commitCalls[0]?.ref !== "main",

  treeReadOnce: treeCalls.length === 1,

  frozenCommitPassedToTreeGetter: treeCalls[0]?.ref === FROZEN_COMMIT_SHA,

  pythonRebuiltFromFrozenTree:
    pythonCalls.length === 1 && pythonCalls[0] === expectedTree.items,

  technocoreEvidenceRebuilt: technocoreCalls.length === 1,

  technocoreUsesFrozenCommit: technocoreCalls[0]?.branch === FROZEN_COMMIT_SHA,

  technocoreUsesFrozenTreeItems:
    technocoreCalls[0]?.items === expectedTree.items,

  toolIdentityRebuilt: toolIdentityCalls.length === 1,

  toolIdentityUsesFrozenTree:
    toolIdentityCalls[0]?.items === expectedTree.items,

  toolIdentityUsesTechnocoreEvidence:
    toolIdentityCalls[0]?.technocoreEvidence === expectedTechnocoreEvidence,

  sourceSupportReevaluated: supportCalls.length === 1,

  supportUsesVerifiedRepository:
    String(supportCalls[0]?.repo?.repositoryId) === FROZEN_REPOSITORY_ID,

  supportUsesFrozenTree: supportCalls[0]?.tree === expectedTree,

  supportUsesDerivedPython: supportCalls[0]?.python === expectedPython,

  supportUsesDerivedTechnocoreEvidence:
    supportCalls[0]?.technocoreEvidence === expectedTechnocoreEvidence,

  supportUsesDerivedToolIdentity:
    supportCalls[0]?.toolIdentity === expectedToolIdentity,

  /*
   * Existing source-assessment shape
   */
  repositoryIdentityPreserved:
    String(happyResult.repository?.repositoryId) === FROZEN_REPOSITORY_ID,

  frozenCommitPreserved:
    happyResult.repository?.commitSha === FROZEN_COMMIT_SHA,

  frozenTreePreserved: happyResult.repository?.treeSha === FROZEN_TREE_SHA,

  treeIncluded: happyResult.tree === expectedTree,

  pythonIncluded: happyResult.python === expectedPython,

  technocoreEvidenceIncluded:
    happyResult.technocoreEvidence === expectedTechnocoreEvidence,

  toolIdentityIncluded: happyResult.toolIdentity === expectedToolIdentity,

  /*
   * Explicit frozen provenance
   */
  frozenSnapshotReturned:
    happyResult.frozenSnapshot?.repositoryId === FROZEN_REPOSITORY_ID &&
    happyResult.frozenSnapshot?.commitSha === FROZEN_COMMIT_SHA &&
    happyResult.frozenSnapshot?.treeSha === FROZEN_TREE_SHA,
};

const allPassed = Object.values(tests).every(Boolean);

console.log("\n===== ASSESS FROZEN GITHUB SOURCE TEST =====");

console.dir(tests, {
  depth: null,
});

if (!allPassed) {
  throw new Error("Assess frozen GitHub source test failed.");
}

console.log("\n===== ASSESS FROZEN GITHUB SOURCE TEST PASSED =====");
