import { freezeInvestigationTarget } from "./freezeInvestigationTarget.js";

/*
 * Controlled source-ready fixture.
 */
const prepared = {
  status: "source_ready",

  methodologyEligible: true,

  canonicalSource: {
    owner: "example",

    repo: "scout-tool",

    canonicalUrl: "https://github.com/example/scout-tool",
  },

  sourceAssessment: {
    status: "supported_source",

    repository: {
      repositoryId: 123456789,

      fullName: "example/scout-tool",

      defaultBranch: "main",

      archived: false,

      commitSha: "1111111111111111111111111111111111111111",

      treeSha: "2222222222222222222222222222222222222222",
    },
  },
};

/*
 * Use a fixed timestamp so this test
 * stays reproducible.
 */
const result = await freezeInvestigationTarget(prepared, {
  now: () => "2026-09-06T12:00:00.000Z",
});

console.dir(result, {
  depth: null,
});
