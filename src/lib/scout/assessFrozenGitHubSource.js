import { getGitHubRepo } from "./getGitHubRepo.js";

import { getGitHubCommit } from "./getGitHubCommit.js";

import { getGitHubTree } from "./getGitHubTree.js";

import { detectPythonSurfaces } from "./detectPythonSurfaces.js";

import { detectTechnocoreEvidence } from "./detectTechnocoreEvidence.js";

import { identifySingleTool } from "./identifySingleTool.js";

import { evaluateSourceSupport } from "./evaluateSourceSupport.js";

/*
 * Assess one already-frozen GitHub source.
 *
 * This differs deliberately from:
 *
 *   assessGitHubSource()
 *
 * Normal discovery/source assessment resolves the
 * repository's moving default branch to a commit.
 *
 * This function MUST NOT do that.
 *
 * Instead it receives the immutable source snapshot
 * already stored in the investigation target:
 *
 *   repositoryId
 *   owner
 *   repo
 *   commitSha
 *   treeSha
 *
 *
 * Production invariant:
 *
 * frozen target
 *      ↓
 * verify stable repository identity
 *      ↓
 * verify exact frozen commit still resolves
 *      ↓
 * verify that commit belongs to frozen tree SHA
 *      ↓
 * inspect repository at frozen commit only
 *      ↓
 * rebuild derived Scout source assessment
 *
 *
 * Runtime hardening:
 *
 * Production callers may inject a hardened GitHub
 * request function.
 *
 * This keeps:
 *
 * - Cloudflare env
 * - GitHub credentials
 * - timeout policy
 * - response-size policy
 *
 * outside Methodology/domain logic.
 */

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

/*
 * GitHub repository IDs can arrive as numbers
 * from the API while durable storage may contain
 * their text representation.
 */
function normalizeRepositoryId(value) {
  if (value === null || value === undefined) {
    return null;
  }

  return String(value).trim();
}

/*
 * Git object IDs are hexadecimal hashes.
 *
 * Normalize case and surrounding whitespace only.
 */
function normalizeGitObjectId(value) {
  if (!isNonEmptyString(value)) {
    return null;
  }

  return value.trim().toLowerCase();
}

export async function assessFrozenGitHubSource(
  target,
  {
    /*
     * Request boundary.
     *
     * Existing callers remain compatible because
     * global fetch remains the default.
     *
     * Production Queue execution can inject Scout's
     * hardened GitHub request function here.
     */
    request = globalThis.fetch,

    repoGetter = getGitHubRepo,

    commitGetter = getGitHubCommit,

    treeGetter = getGitHubTree,

    pythonDetector = detectPythonSurfaces,

    technocoreDetector = detectTechnocoreEvidence,

    toolIdentifier = identifySingleTool,

    supportEvaluator = evaluateSourceSupport,
  } = {},
) {
  /*
   * =================================================
   * Validate frozen target
   * =================================================
   */

  const source = target?.source;

  if (!source || typeof source !== "object") {
    return {
      status: "source_not_established",

      reason: "frozen_source_target_required",
    };
  }

  const owner = isNonEmptyString(source.owner) ? source.owner.trim() : null;

  const repo = isNonEmptyString(source.repo) ? source.repo.trim() : null;

  const frozenRepositoryId = normalizeRepositoryId(source.repositoryId);

  const frozenCommitSha = normalizeGitObjectId(source.commitSha);

  const frozenTreeSha = normalizeGitObjectId(source.treeSha);

  if (
    !owner ||
    !repo ||
    !frozenRepositoryId ||
    !frozenCommitSha ||
    !frozenTreeSha
  ) {
    return {
      status: "source_not_established",

      reason: "frozen_source_snapshot_not_available",
    };
  }

  /*
   * =================================================
   * Step 1
   * Verify stable GitHub repository identity
   * =================================================
   *
   * We still read repository metadata because the
   * human-readable owner/repo coordinates may have
   * changed or could now point at a different repo.
   *
   * The stable GitHub repository ID is authoritative.
   */

  const repository = await repoGetter(owner, repo, request);

  if (repository?.status !== "repo_found") {
    return {
      status: "source_not_established",

      reason: "repository_not_available",
    };
  }

  const liveRepositoryId = normalizeRepositoryId(repository.repositoryId);

  if (!liveRepositoryId || liveRepositoryId !== frozenRepositoryId) {
    return {
      status: "source_not_established",

      reason: "frozen_repository_identity_mismatch",

      expectedRepositoryId: frozenRepositoryId,

      observedRepositoryId: liveRepositoryId,
    };
  }

  /*
   * =================================================
   * Step 2
   * Verify the exact frozen commit
   * =================================================
   *
   * IMPORTANT:
   *
   * We pass the frozen commit SHA itself.
   *
   * We never resolve:
   *
   *   repository.defaultBranch
   *
   * during execution.
   */

  const commit = await commitGetter(owner, repo, frozenCommitSha, request);

  if (commit?.status !== "commit_found") {
    return {
      status: "source_not_established",

      reason: "frozen_commit_not_available",
    };
  }

  const observedCommitSha = normalizeGitObjectId(commit.commitSha);

  if (!observedCommitSha || observedCommitSha !== frozenCommitSha) {
    return {
      status: "source_not_established",

      reason: "frozen_commit_identity_mismatch",

      expectedCommitSha: frozenCommitSha,

      observedCommitSha,
    };
  }

  /*
   * =================================================
   * Step 3
   * Verify frozen tree identity
   * =================================================
   *
   * getGitHubCommit() gives us the Git tree SHA
   * belonging to the exact commit.
   *
   * That lets Scout independently verify the
   * commit → tree relationship stored at freeze time.
   */

  const observedTreeSha = normalizeGitObjectId(commit.treeSha);

  if (!observedTreeSha || observedTreeSha !== frozenTreeSha) {
    return {
      status: "source_not_established",

      reason: "frozen_tree_identity_mismatch",

      expectedTreeSha: frozenTreeSha,

      observedTreeSha,
    };
  }

  /*
   * =================================================
   * Step 4
   * Read the tree at the exact frozen commit
   * =================================================
   */

  const tree = await treeGetter(owner, repo, frozenCommitSha, request);

  if (tree?.status !== "tree_found") {
    return {
      status: "source_not_established",

      reason: "repository_tree_not_available",
    };
  }

  /*
   * =================================================
   * Step 5
   * Rebuild derived source observations
   * =================================================
   *
   * These observations are intentionally derived
   * again from the immutable source snapshot rather
   * than copied blindly from discovery-time state.
   */

  const python = pythonDetector(tree.items);

  const technocoreEvidence = await technocoreDetector({
    owner,

    repo,

    /*
     * Existing Scout evidence functions call this
     * parameter "branch", but it accepts any Git ref.
     *
     * Production execution always supplies the exact
     * immutable frozen commit.
     */
    branch: frozenCommitSha,

    items: tree.items,

    /*
     * Use the same injected GitHub request boundary
     * for raw.githubusercontent.com reads.
     */
    request,
  });

  const toolIdentity = toolIdentifier(tree.items, technocoreEvidence);

  /*
   * =================================================
   * Step 6
   * Re-evaluate supported-source gate
   * =================================================
   *
   * We deliberately use Scout's existing support
   * evaluator rather than inventing another source
   * eligibility rule here.
   */

  const support = supportEvaluator({
    repo: repository,

    tree,

    python,

    technocoreEvidence,

    toolIdentity,
  });

  /*
   * =================================================
   * Return existing source-assessment shape
   * =================================================
   *
   * runMethodology() can consume this object through
   * its injected sourceAssessor dependency exactly as
   * though assessGitHubSource() had returned it.
   */

  return {
    ...support,

    repository: {
      /*
       * Stable identity verified against the frozen
       * investigation target.
       */
      repositoryId: repository.repositoryId,

      fullName: repository.fullName,

      /*
       * Informational only.
       *
       * We do NOT use this branch to select the
       * execution snapshot.
       */
      defaultBranch: repository.defaultBranch,

      archived: repository.archived,

      /*
       * Immutable snapshot actually verified above.
       */
      commitSha: frozenCommitSha,

      treeSha: frozenTreeSha,
    },

    tree,

    python,

    technocoreEvidence,

    toolIdentity,

    /*
     * Explicit execution provenance.
     *
     * This does not alter the existing support status;
     * it simply makes the frozen nature of this
     * assessment visible to later application code.
     */
    frozenSnapshot: {
      repositoryId: frozenRepositoryId,

      commitSha: frozenCommitSha,

      treeSha: frozenTreeSha,
    },
  };
}
