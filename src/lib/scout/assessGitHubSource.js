import { getGitHubRepo } from "./getGitHubRepo.js";
import { getGitHubCommit } from "./getGitHubCommit.js";
import { getGitHubTree } from "./getGitHubTree.js";

import { detectPythonSurfaces } from "./detectPythonSurfaces.js";
import { detectTechnocoreEvidence } from "./detectTechnocoreEvidence.js";
import { identifySingleTool } from "./identifySingleTool.js";
import { evaluateSourceSupport } from "./evaluateSourceSupport.js";

export async function assessGitHubSource(owner, repo) {
  /*
   * Step 1
   * Get the repository identity.
   */
  const repository = await getGitHubRepo(owner, repo);

  if (repository.status !== "repo_found") {
    return {
      status: "unsupported_source",
      reason: "repository_not_available",
    };
  }

  /*
   * Step 2
   * Resolve the moving default branch
   * to one exact immutable commit.
   */
  const commit = await getGitHubCommit(owner, repo, repository.defaultBranch);

  if (commit.status !== "commit_found") {
    return {
      status: "source_not_established",
      reason: "repository_commit_not_available",
    };
  }

  /*
   * Step 3
   * Read the repository tree at the
   * exact frozen commit — not "main".
   */
  const tree = await getGitHubTree(owner, repo, commit.commitSha);

  if (tree.status !== "tree_found") {
    return {
      status: "source_not_established",
      reason: "repository_tree_not_available",
    };
  }

  /*
   * Step 4
   * Inspect that same frozen snapshot.
   */
  const python = detectPythonSurfaces(tree.items);

  const technocoreEvidence = await detectTechnocoreEvidence({
    owner: owner,
    repo: repo,

    // Existing functions accept a Git ref here.
    // We use the immutable commit SHA.
    branch: commit.commitSha,

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
      // Stable GitHub repository identity.
      repositoryId: repository.repositoryId,

      fullName: repository.fullName,

      // Human-readable branch from which
      // this snapshot was resolved.
      defaultBranch: repository.defaultBranch,

      archived: repository.archived,

      // Immutable investigation snapshot.
      commitSha: commit.commitSha,

      treeSha: commit.treeSha,
    },

    tree: tree,

    python: python,

    technocoreEvidence: technocoreEvidence,

    toolIdentity: toolIdentity,
  };
}
