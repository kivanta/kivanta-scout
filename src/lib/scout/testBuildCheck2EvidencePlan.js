import { buildCheck2EvidencePlan } from "./buildCheck2EvidencePlan.js";

const result = buildCheck2EvidencePlan({
  tree: {
    items: [
      { path: "pyproject.toml", type: "blob" },
      { path: "main.py", type: "blob" },
      { path: "technocore_client.py", type: "blob" },
      { path: "identity.py", type: "blob" },
      { path: "config.py", type: "blob" },
      { path: ".env.example", type: "blob" },
      { path: "README.md", type: "blob" },
    ],
  },

  python: {
    dependencyFiles: ["pyproject.toml"],
  },

  technocoreEvidence: {
    matches: [
      {
        path: "technocore_client.py",
        signals: ["technocore_host", "did_key"],
      },
    ],
  },

  toolIdentity: {
    singleTool: true,
    projectRoot: ".",
    projectMarkers: ["pyproject.toml"],
    entryPointCandidates: ["main.py"],
  },
});

console.log(result);
