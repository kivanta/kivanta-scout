import { referenceRegistry } from "./referenceRegistry.js";
import { getGitHubRepo } from "./getGitHubRepo.js";
import { getGitHubTree } from "./getGitHubTree.js";
import { checkReferenceSurfaces } from "./checkReferenceSurfaces.js";

const reference = referenceRegistry.technocore;

const repo = await getGitHubRepo(reference.owner, reference.repo);

console.log("REPOSITORY:");
console.log(repo);

if (repo.status === "repo_found") {
  const tree = await getGitHubTree(
    reference.owner,
    reference.repo,
    repo.defaultBranch,
  );

  console.log("TREE:");
  console.log({
    status: tree.status,
    truncated: tree.truncated,
    itemCount: tree.items?.length,
  });

  if (tree.status === "tree_found") {
    const surfaces = checkReferenceSurfaces(
      tree.items,
      reference.referenceSurfaces,
    );

    console.log("REFERENCE SURFACES:");
    console.log(surfaces);
  }
}
