import { buildCheck4Result } from "./buildCheck4Result.js";

const authority = {
  registryVersion: "1.0",
  owner: "flop-labs",
  repo: "technocore-chat",
};

const passComparison = {
  status: "comparison_ready",

  dimensions: [
    {
      category: "technocore",
      status: "PASS",
    },
    {
      category: "identity",
      status: "PASS",
    },
    {
      category: "signing",
      status: "PASS",
    },
  ],
};

const cautionComparison = {
  status: "comparison_ready",

  dimensions: [
    {
      category: "technocore",
      status: "PASS",
    },
    {
      category: "signing",
      status: "CAUTION",
      reason: "material_behavior_difference",
    },
  ],
};

const unknownComparison = {
  status: "comparison_ready",

  dimensions: [
    {
      category: "technocore",
      status: "PASS",
    },
    {
      category: "signing",
      status: "UNKNOWN",
      reason: "behavior_correspondence_not_established",
    },
  ],
};

console.log("PASS:");
console.dir(buildCheck4Result(passComparison, authority), {
  depth: null,
});

console.log("\nCAUTION:");
console.dir(buildCheck4Result(cautionComparison, authority), {
  depth: null,
});

console.log("\nUNKNOWN:");
console.dir(buildCheck4Result(unknownComparison, authority), {
  depth: null,
});
