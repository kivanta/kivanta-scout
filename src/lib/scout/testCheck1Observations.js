import { collectCheck1Evidence } from "./collectCheck1Evidence.js";
import { extractCheck1Observations } from "./extractCheck1Observations.js";

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

const result = extractCheck1Observations(evidence);

console.log({
  status: result.status,
  observationCount: result.observationCount,
});

console.log(result.observations.slice(0, 20));
