import { runCheck4 } from "./runCheck4.js";

const result = await runCheck4({
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
