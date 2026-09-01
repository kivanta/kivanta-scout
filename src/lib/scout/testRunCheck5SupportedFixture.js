import { runCheck5 } from "./runCheck5.js";

const priorChecks = [
  {
    status: "PASS",
    title: "What does this tool actually do?",
    conclusion: "Observed Technocore behavior was established.",
    evidence: [],
  },

  {
    status: "PASS",
    title: "Your Key, Password & Sensitive Information",
    conclusion:
      "Sensitive-data handling was established within the inspected source.",
    limitation:
      "PASS is limited to the inspected source evidence and does not mean sensitive information is universally safe.",
  },

  {
    status: "PASS",
    title: "Where Does It Connect?",
    conclusion: "Material observed network destinations were established.",

    destinations: [
      {
        host: "technocore.chat",
        technocore: true,
      },
    ],

    limitation: "This result is limited to the inspected source snapshot.",
  },

  {
    status: "PASS",
    title: "Does It Match the Official Technocore Reference?",
    conclusion:
      "Established material behaviors were consistent with the authoritative Technocore reference.",

    limitation:
      "Matching the reference does not imply official status, endorsement, or identical implementation.",
  },
];

const result = await runCheck5({
  sourceAssessment: {
    status: "supported_source",
  },

  priorChecks: priorChecks,
});

console.dir(result, {
  depth: null,
});
