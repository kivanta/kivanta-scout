import { runCheck5 } from "./runCheck5.js";

const result = await runCheck5({
  sourceAssessment: {
    status: "source_not_established",
  },

  priorChecks: [],
});

console.log(result);
