import { runCheck2 } from "./runCheck2.js";

const result = await runCheck2({
  owner: "psf",
  repo: "requests",
  branch: "main",

  sourceAssessment: {
    status: "source_not_established",
  },

  tree: {},
  python: {},
  technocoreEvidence: {},
  toolIdentity: {},
});

console.log(result);
