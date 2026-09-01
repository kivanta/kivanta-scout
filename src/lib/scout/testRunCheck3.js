import { runCheck3 } from "./runCheck3.js";

const result = await runCheck3({
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
