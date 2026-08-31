import { collectCheck1Evidence } from "./collectCheck1Evidence.js";
import { extractCheck1Observations } from "./extractCheck1Observations.js";
import { summarizeCheck1Observations } from "./summarizeCheck1Observations.js";

const evidencePlan = {
  status: "evidence_plan_ready",
  paths: ["scripts/sign.py", "src/manifest.py"],
};

const evidence = await collectCheck1Evidence({
  owner: "flop-labs",
  repo: "technocore-chat",
  branch: "main",
  evidencePlan: evidencePlan,
});

const observations = extractCheck1Observations(evidence);

const summary = summarizeCheck1Observations(observations);

console.log(summary);
