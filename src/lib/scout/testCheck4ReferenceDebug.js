import { referenceRegistry } from "./referenceRegistry.js";
import { collectCheck1Evidence } from "./collectCheck1Evidence.js";
import { extractCheck1Observations } from "./extractCheck1Observations.js";
import { summarizeCheck1Observations } from "./summarizeCheck1Observations.js";

const registry = referenceRegistry.technocore;

const evidencePlan = {
  status: "evidence_plan_ready",
  paths: registry.repoSurfaces,
};

const evidence = await collectCheck1Evidence({
  owner: registry.sourceRepo.owner,
  repo: registry.sourceRepo.repo,
  branch: "main",
  evidencePlan,
});

const observations = extractCheck1Observations(evidence);

const summary = summarizeCheck1Observations(observations);

console.log("EVIDENCE:");
console.log({
  status: evidence.status,
  fileCount: evidence.files?.length,
});

console.log("\nOBSERVATIONS:");
console.log({
  status: observations.status,
  observationCount: observations.observationCount,
});

console.log("\nSUMMARY:");
console.dir(summary, {
  depth: null,
});
