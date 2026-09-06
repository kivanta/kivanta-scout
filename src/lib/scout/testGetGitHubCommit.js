import { getGitHubCommit } from "./getGitHubCommit.js";

const result = await getGitHubCommit("psf", "requests", "main");

console.log("COMMIT TEST:");
console.dir(result, {
  depth: null,
});
