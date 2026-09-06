import { createInvestigationRecord } from "./createInvestigationRecord.js";

/*
 * Controlled frozen target fixture.
 */
const frozenResult = {
  status: "target_frozen",

  reason: null,

  target: {
    frozenAt: "2026-09-06T12:00:00.000Z",

    source: {
      repositoryId: 123456789,

      owner: "example",

      repo: "scout-tool",

      canonicalUrl: "https://github.com/example/scout-tool",

      defaultBranch: "main",

      commitSha: "1111111111111111111111111111111111111111",

      treeSha: "2222222222222222222222222222222222222222",
    },

    methodology: {
      id: "kivanta-scout-methodology",

      version: "1.0",
    },

    technocoreReference: {
      registryVersion: "1.0",

      repositoryId: 1332656411,

      owner: "flop-labs",

      repo: "technocore-chat",

      canonicalUrl: "https://github.com/flop-labs/technocore-chat",

      commitSha: "9861d01cb42e10a5ffdffe3880338feaa4f56b3f",

      treeSha: "89db587b5c598697451e77f387ef5b9d1d9f9ef7",
    },

    referenceRegistryDigest: {
      algorithm: "SHA-256",

      canonicalization: "scout-stable-json-v1",

      value: "b0837449b53f4d31bce1a8b8491f16fcd294dfc127382d136241b95bb0793960",
    },
  },
};

/*
 * Fixed ID and timestamp make the
 * test output reproducible.
 */
const result = createInvestigationRecord(frozenResult, {
  idFactory: () => "inv_test_001",

  now: () => "2026-09-06T15:00:00.000Z",
});

console.dir(result, {
  depth: null,
});
