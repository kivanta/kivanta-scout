import { buildCheck5MaterialFacts } from "./buildCheck5MaterialFacts.js";

const priorChecks = [
  {
    status: "PASS",
    title: "What does this tool actually do?",
    conclusion:
      "The tool performs Technocore protocol behavior using DID identity and cryptographic signing.",
    evidence: [],
  },

  {
    status: "PASS",
    title: "Your Key, Password & Sensitive Information",
    conclusion:
      "Sensitive information is read for signing behavior within the inspected source.",
    limitation:
      "PASS is limited to the inspected source evidence and does not mean sensitive information is universally safe.",
  },

  {
    status: "CAUTION",
    title: "Where Does It Connect?",
    conclusion:
      "Source evidence shows communication with external destinations beyond the established Technocore destination.",

    destinations: [
      {
        host: "technocore.chat",
        technocore: true,
      },
      {
        host: "api.example.com",
        technocore: false,
      },
    ],
  },

  {
    status: "PASS",
    title: "Does It Match the Official Technocore Reference?",
    conclusion:
      "Within the inspected scope, the established material behaviors are consistent with the authoritative Technocore reference.",

    limitation:
      "Matching the reference does not imply official status, endorsement, or identical implementation.",
  },
];

const result = buildCheck5MaterialFacts(priorChecks);

console.dir(result, {
  depth: null,
});
