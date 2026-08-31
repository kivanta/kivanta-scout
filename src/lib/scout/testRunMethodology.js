import { runMethodology } from "./runMethodology.js";

console.log("REQUESTS:");

const requests = await runMethodology("psf", "requests");

console.log({
  status: requests.status,
  reason: requests.reason,
  checks: requests.checks,
});

console.log("\nTECHNOCORE REFERENCE:");

const technocore = await runMethodology("flop-labs", "technocore-chat");

console.log({
  status: technocore.status,
  reason: technocore.reason,
  checks: technocore.checks,
});
