import { getGitHubRepo } from "./getGitHubRepo.js";
import { getGitHubCommit } from "./getGitHubCommit.js";

/*
 * Resolve the official Technocore
 * reference repository identity.
 */
const repository = await getGitHubRepo("flop-labs", "technocore-chat");

/*
 * Resolve its current main branch
 * to one exact immutable commit.
 */
const commit = await getGitHubCommit("flop-labs", "technocore-chat", "main");

console.log("\n===== TECHNOCORE REFERENCE SNAPSHOT =====");

console.log({
  repositoryId: repository.repositoryId,
  fullName: repository.fullName,
  defaultBranch: repository.defaultBranch,
  commitSha: commit.commitSha,
  treeSha: commit.treeSha,
});
