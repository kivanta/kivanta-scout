import { getGitHubRepo } from "./getGitHubRepo.js";
import { getGitHubTree } from "./getGitHubTree.js";
import { detectTechnocoreEvidence } from "./detectTechnocoreEvidence.js";

async function testRepository(owner, repo) {
  const metadata = await getGitHubRepo(owner, repo);

  if (metadata.status !== "repo_found") {
    console.log(owner, repo, metadata);
    return;
  }

  const tree = await getGitHubTree(owner, repo, metadata.defaultBranch);

  if (tree.status !== "tree_found") {
    console.log(owner, repo, tree);
    return;
  }

  const evidence = await detectTechnocoreEvidence({
    owner: owner,
    repo: repo,
    branch: metadata.defaultBranch,
    items: tree.items,
  });

  console.log(`\n${owner}/${repo}`);
  console.log(evidence);
}

await testRepository("flop-labs", "technocore-chat");

await testRepository("psf", "requests");
