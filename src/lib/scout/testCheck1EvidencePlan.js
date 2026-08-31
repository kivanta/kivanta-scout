import { buildCheck1EvidencePlan } from "./buildCheck1EvidencePlan.js";

const result = buildCheck1EvidencePlan({
  tree: {
    items: [
      { path: "pyproject.toml", type: "blob" },
      { path: "main.py", type: "blob" },
      { path: "technocore_client.py", type: "blob" },
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
        signals: ["technocore_host", "room_api"],
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
