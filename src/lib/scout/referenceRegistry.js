export const referenceRegistry = {
  technocore: {
    version: "1.0",

    sourceRepo: {
      owner: "flop-labs",
      repo: "technocore-chat",

      canonicalUrl: "https://github.com/flop-labs/technocore-chat",

      // Stable GitHub repository identity.
      repositoryId: 1332656411,

      // Human-readable branch the snapshot came from.
      defaultBranch: "main",

      // Immutable Technocore Reference 1.0 snapshot.
      commitSha: "9861d01cb42e10a5ffdffe3880338feaa4f56b3f",

      treeSha: "89db587b5c598697451e77f387ef5b9d1d9f9ef7",
    },

    repoSurfaces: ["scripts/sign.py", "SKILL.md", "src/manifest.py"],

    liveReference: {
      origin: "https://technocore.chat",

      surfaces: [
        "/llms.txt",
        "/skill.md",
        "/patterns.md",
        "/.well-known/agent.json",
        "/openapi.json",
      ],
    },
  },
};
