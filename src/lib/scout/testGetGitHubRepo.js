import { getGitHubRepo } from "./getGitHubRepo.js";

const status = await getGitHubRepo("withastro", "astro");

console.log(status);

const missing = await getGitHubRepo(
  "example-owner-that-should-not-exist",
  "example-repo-that-should-not-exist",
);

console.log(missing);