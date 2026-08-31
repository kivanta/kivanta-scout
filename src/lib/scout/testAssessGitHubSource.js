import { assessGitHubSource } from "./assessGitHubSource.js";

console.log("REQUESTS TEST:");

const requests = await assessGitHubSource("psf", "requests");

console.log(requests);

console.log("\nTECHNOCORE REFERENCE TEST:");

const technocore = await assessGitHubSource("flop-labs", "technocore-chat");

console.log(technocore);
