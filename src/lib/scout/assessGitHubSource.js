import { getGitHubRepo } from "./getGitHubRepo.js";
import { getGitHubTree } from "./getGitHubTree.js";
import { detectPythonSurfaces } from "./detectPythonSurfaces.js";
import { detectTechnocoreEvidence } from "./detectTechnocoreEvidence.js";
import { identifySingleTool } from "./identifySingleTool.js";
import { evaluateSourceSupport } from "./evaluateSourceSupport.js";

export async function assessGitHubSource(owner, repo) {
  const repository = await getGitHubRepo(owner, repo);

  if (repository.status !== "repo_found") {
    return {
      status: "unsupported_source",
      reason: "repository_not_available",
    };
  }

  const tree = await getGitHubTree(owner, repo, repository.defaultBranch);

  if (tree.status !== "tree_found") {
    return {
      status: "source_not_established",
      reason: "repository_tree_not_available",
    };
  }

  const python = detectPythonSurfaces(tree.items);

  const technocoreEvidence = await detectTechnocoreEvidence({
    owner: owner,
    repo: repo,
    branch: repository.defaultBranch,
    items: tree.items,
  });

  const toolIdentity = identifySingleTool(tree.items, technocoreEvidence);

  const support = evaluateSourceSupport({
    repo: repository,
    tree: tree,
    python: python,
    technocoreEvidence: technocoreEvidence,
    toolIdentity: toolIdentity,
  });

  return {
    ...support,

    repository: {
      fullName: repository.fullName,
      defaultBranch: repository.defaultBranch,
      archived: repository.archived,
    },

    tree: tree,

    python: python,

    technocoreEvidence: technocoreEvidence,

    toolIdentity: toolIdentity,
  };
}
