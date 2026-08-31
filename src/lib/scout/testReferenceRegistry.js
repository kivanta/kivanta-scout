import { referenceRegistry } from "./referenceRegistry.js";
import { getGitHubRepo } from "./getGitHubRepo.js";
import { getGitHubTree } from "./getGitHubTree.js";
import { checkReferenceSurfaces } from "./checkReferenceSurfaces.js";

const reference = referenceRegistry.technocore;
const sourceRepo = reference.sourceRepo;

const repo = await getGitHubRepo(sourceRepo.owner, sourceRepo.repo);

console.log("REPOSITORY:");
console.log(repo);

if (repo.status === "repo_found") {
  const tree = await getGitHubTree(
    sourceRepo.owner,
    sourceRepo.repo,
    repo.defaultBranch,
  );

  console.log("TREE:");
  console.log({
    status: tree.status,
    truncated: tree.truncated,
    itemCount: tree.items?.length,
  });

  if (tree.status === "tree_found") {
    const surfaces = checkReferenceSurfaces(tree.items, reference.repoSurfaces);

    console.log("REPOSITORY REFERENCE SURFACES:");
    console.log(surfaces);
  }
}
