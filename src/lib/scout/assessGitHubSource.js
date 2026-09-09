import { getGitHubRepo } from "./getGitHubRepo.js";
import { getGitHubCommit } from "./getGitHubCommit.js";
import { getGitHubTree } from "./getGitHubTree.js";

import { detectPythonSurfaces } from "./detectPythonSurfaces.js";
import { detectTechnocoreEvidence } from "./detectTechnocoreEvidence.js";
import { identifySingleTool } from "./identifySingleTool.js";
import { evaluateSourceSupport } from "./evaluateSourceSupport.js";

export async function assessGitHubSource(
  owner,
  repo,
  { request = globalThis.fetch } = {},
) {
  /*
   * Step 1
   * Get the repository identity.
   *
   * Production discovery injects Scout's
   * hardened GitHub request boundary.
   */
  const repository = await getGitHubRepo(owner, repo, request);

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
  const commit = await getGitHubCommit(
    owner,
    repo,
    repository.defaultBranch,
    request,
  );

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
  const tree = await getGitHubTree(owner, repo, commit.commitSha, request);

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
    owner,
    repo,

    /*
     * Existing functions accept a Git ref.
     * Use the immutable commit SHA.
     */
    branch: commit.commitSha,

    items: tree.items,

    /*
     * Technocore evidence file reads must
     * use the same hardened GitHub boundary.
     */
    request,
  });

  const toolIdentity = identifySingleTool(tree.items, technocoreEvidence);

  const support = evaluateSourceSupport({
    repo: repository,
    tree,
    python,
    technocoreEvidence,
    toolIdentity,
  });

  return {
    ...support,

    repository: {
      repositoryId: repository.repositoryId,

      fullName: repository.fullName,

      defaultBranch: repository.defaultBranch,

      archived: repository.archived,

      commitSha: commit.commitSha,

      treeSha: commit.treeSha,
    },

    tree,

    python,

    technocoreEvidence,

    toolIdentity,
  };
}
