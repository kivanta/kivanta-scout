import { deriveCheck4BehaviorProfile } from "./deriveCheck4BehaviorProfile.js";

const summary = {
  status: "summary_ready",

  categories: [
    {
      category: "technocore",
      count: 4,
      labels: ["technocore_host", "room_endpoint"],
      evidence: [],
    },

    {
      category: "identity",
      count: 2,
      labels: ["did_key"],
      evidence: [],
    },

    {
      category: "signing",
      count: 3,
      labels: ["ed25519"],
      evidence: [],
    },

    {
      category: "configuration",
      count: 1,
      labels: ["environment_variable"],
      evidence: [],
    },
  ],
};

console.log(deriveCheck4BehaviorProfile(summary));
