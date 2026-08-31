export const referenceRegistry = {
  technocore: {
    version: "1.0",

    sourceRepo: {
      owner: "flop-labs",
      repo: "technocore-chat",
      canonicalUrl: "https://github.com/flop-labs/technocore-chat",
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
