import { buildCheck5Result } from "./buildCheck5Result.js";

const passFacts = {
  status: "material_facts_ready",

  facts: [
    {
      type: "tool_behavior",
      sourceCheck: "What does this tool actually do?",
      sourceStatus: "PASS",
      kind: "finding",
      text: "Observed Technocore behavior was established.",
    },

    {
      type: "reference_compatibility",
      sourceCheck: "Does It Match the Official Technocore Reference?",
      sourceStatus: "PASS",
      kind: "finding",
      text: "Observed material behavior was consistent with the reference.",
    },
  ],
};

const cautionFacts = {
  status: "material_facts_ready",

  facts: [
    {
      type: "external_connections",
      sourceCheck: "Where Does It Connect?",
      sourceStatus: "CAUTION",
      kind: "destination",
      host: "api.example.com",
      technocore: false,
    },
  ],
};

const unknownFacts = {
  status: "material_facts_ready",

  facts: [
    {
      type: "sensitive_information",
      sourceCheck: "Your Key, Password & Sensitive Information",
      sourceStatus: "UNKNOWN",
      kind: "finding",
      text: "A materially important sensitive-data path remains unresolved.",
    },
  ],
};

console.log("PASS:");
console.dir(buildCheck5Result(passFacts), {
  depth: null,
});

console.log("\nCAUTION:");
console.dir(buildCheck5Result(cautionFacts), {
  depth: null,
});

console.log("\nUNKNOWN:");
console.dir(buildCheck5Result(unknownFacts), {
  depth: null,
});
