import { buildCheck1Result } from "./buildCheck1Result.js";

const summary = {
  status: "summary_ready",
  categories: [
    {
      category: "technocore",
      count: 10,
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
      count: 4,
      labels: ["ed25519"],
      evidence: [],
    },
  ],
};

console.log(buildCheck1Result(summary));
