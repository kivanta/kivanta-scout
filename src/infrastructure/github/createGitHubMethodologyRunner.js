/*
 * Create GitHub Methodology Runner
 *
 * Production composition boundary for Scout's
 * hardened GitHub reads.
 *
 * One injected request function is propagated to:
 *
 * frozen source assessment
 *      ├─ repository metadata
 *      ├─ commit
 *      ├─ tree
 *      └─ Technocore raw evidence
 *
 * Methodology checks
 *      ├─ Check 1 file evidence
 *      ├─ Check 2 file evidence
 *      ├─ Check 3 file evidence
 *      └─ Check 4 file evidence
 *           ├─ target repository
 *           └─ official Technocore reference
 *
 * IMPORTANT:
 *
 * This file contains no Methodology rules.
 *
 * It only binds existing dependency seams.
 *
 *
 * V1 runtime optimization:
 *
 * One Methodology execution may ask for the same
 * immutable repository file through multiple checks.
 *
 * The frozen source scan may first read that file from:
 *
 *   raw.githubusercontent.com
 *
 * while later checks may ask for the same file through:
 *
 *   api.github.com/repos/.../contents/...
 *
 * We therefore maintain one investigation-scoped
 * semantic file cache keyed by:
 *
 *   owner + repo + ref + path
 *
 * This reduces duplicate Cloudflare subrequests
 * without changing Methodology evidence selection.
 */

import { runFrozenMethodology } from "../../application/investigations/runFrozenMethodology.js";

import { assessFrozenGitHubSource } from "../../lib/scout/assessFrozenGitHubSource.js";

import { runMethodology } from "../../lib/scout/runMethodology.js";

import { runCheck1 } from "../../lib/scout/runCheck1.js";
import { runCheck2 } from "../../lib/scout/runCheck2.js";
import { runCheck3 } from "../../lib/scout/runCheck3.js";
import { runCheck4 } from "../../lib/scout/runCheck4.js";

import { collectCheck1Evidence } from "../../lib/scout/collectCheck1Evidence.js";
import { collectCheck2Evidence } from "../../lib/scout/collectCheck2Evidence.js";
import { collectCheck3Evidence } from "../../lib/scout/collectCheck3Evidence.js";

import { buildCheck4ReferenceProfile } from "../../lib/scout/buildCheck4ReferenceProfile.js";

import { getGitHubFile } from "../../lib/scout/getGitHubFile.js";

/*
 * ------------------------------------------------
 * Composition error
 * ------------------------------------------------
 */

function createCompositionError(code) {
  const error = new Error(code);

  error.code = code;

  return error;
}

/*
 * ------------------------------------------------
 * Cache helpers
 * ------------------------------------------------
 */

function cleanCachePart(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function createFileCacheKey(owner, repo, ref, path) {
  return [
    cleanCachePart(owner).toLowerCase(),
    cleanCachePart(repo).toLowerCase(),
    cleanCachePart(ref),
    cleanCachePart(path),
  ].join("\n");
}

function safelyDecodePathPart(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/*
 * ------------------------------------------------
 * createGitHubMethodologyRunner
 * ------------------------------------------------
 *
 * request
 *
 *   Scout's hardened GitHub request function.
 *
 * The second argument contains dependency seams
 * used by tests.
 */

export function createGitHubMethodologyRunner(
  { request } = {},

  {
    frozenMethodologyRunner = runFrozenMethodology,

    frozenSourceAssessor = assessFrozenGitHubSource,

    methodologyRunner = runMethodology,

    check1Runner = runCheck1,

    check2Runner = runCheck2,

    check3Runner = runCheck3,

    check4Runner = runCheck4,

    check1EvidenceCollector = collectCheck1Evidence,

    check2EvidenceCollector = collectCheck2Evidence,

    check3EvidenceCollector = collectCheck3Evidence,

    /*
     * Check 4 uses the same Check 1-style
     * behavior evidence for:
     *
     * - the candidate repository
     * - the official Technocore reference
     */
    check4EvidenceCollector = collectCheck1Evidence,

    check4ReferenceProfileBuilder = buildCheck4ReferenceProfile,

    githubFileGetter = getGitHubFile,
  } = {},
) {
  /*
   * =================================================
   * Validate runtime request boundary
   * =================================================
   */

  if (typeof request !== "function") {
    throw createCompositionError("github_request_boundary_required");
  }

  if (typeof githubFileGetter !== "function") {
    throw createCompositionError("github_file_getter_required");
  }

  /*
   * =================================================
   * Investigation-scoped immutable file cache
   * =================================================
   *
   * createGitHubMethodologyRunner() is composed for
   * one Worker runtime dependency graph.
   *
   * The cache itself is deliberately scoped inside
   * this runner and is keyed by immutable Git ref.
   *
   * Only successful file reads are cached.
   *
   * We never cache:
   *
   * - GitHub tokens
   * - request headers
   * - arbitrary failures
   * - mutable branch assumptions
   */

  const fileCache = new Map();

  /*
   * =================================================
   * Hardened request + raw-file cache bridge
   * =================================================
   *
   * detectTechnocoreEvidence() currently reads from:
   *
   *   raw.githubusercontent.com/{owner}/{repo}/{ref}/{path}
   *
   * When that succeeds, copy the immutable text into
   * the semantic cache.
   *
   * The original Response is returned untouched.
   */

  const requestWithFileCache = async (input, options) => {
    const response = await request(input, options);

    /*
     * Cache population must never alter the normal
     * GitHub request result.
     *
     * If parsing/cloning fails, simply continue with
     * the original Response.
     */

    try {
      const url = new URL(
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : String(input),
      );

      if (response?.ok && url.hostname === "raw.githubusercontent.com") {
        const encodedParts = url.pathname.split("/").filter(Boolean);

        /*
         * Expected shape:
         *
         * /owner/repo/ref/path/to/file.py
         */

        if (encodedParts.length >= 4) {
          const owner = safelyDecodePathPart(encodedParts[0]);

          const repo = safelyDecodePathPart(encodedParts[1]);

          const ref = safelyDecodePathPart(encodedParts[2]);

          const path = encodedParts
            .slice(3)
            .map(safelyDecodePathPart)
            .join("/");

          if (owner && repo && ref && path) {
            const cacheKey = createFileCacheKey(owner, repo, ref, path);

            if (!fileCache.has(cacheKey)) {
              const clone = response.clone();

              const content = await clone.text();

              fileCache.set(cacheKey, {
                status: "file_found",

                path,

                content,
              });
            }
          }
        }
      }
    } catch {
      /*
       * Cache population is an optimization only.
       *
       * Never convert a valid GitHub response into
       * an operational failure because caching failed.
       */
    }

    return response;
  };

  /*
   * =================================================
   * Cached Contents-API file getter
   * =================================================
   *
   * Checks 1–4 call getGitHubFile().
   *
   * Before performing another GitHub subrequest,
   * look for content already obtained by:
   *
   * - the Technocore raw scan
   * - an earlier Methodology check
   */

  const cachedGitHubFileGetter = async (owner, repo, path, branch) => {
    const cacheKey = createFileCacheKey(owner, repo, branch, path);

    const cached = fileCache.get(cacheKey);

    if (cached) {
      return {
        status: cached.status,

        path: cached.path,

        content: cached.content,
      };
    }

    const result = await githubFileGetter(
      owner,
      repo,
      path,
      branch,
      requestWithFileCache,
    );

    if (result?.status === "file_found") {
      fileCache.set(cacheKey, {
        status: "file_found",

        path: result.path,

        content: result.content,
      });
    }

    return result;
  };

  /*
   * =================================================
   * Bind frozen source assessment
   * =================================================
   *
   * Its Technocore raw reads populate the same
   * semantic file cache consumed by later checks.
   */

  const frozenSourceAssessorWithRequest = async (target) => {
    return frozenSourceAssessor(
      target,

      {
        request: requestWithFileCache,
      },
    );
  };

  /*
   * =================================================
   * Bind Check 1 evidence
   * =================================================
   */

  const check1EvidenceCollectorWithRequest = async (input) => {
    return check1EvidenceCollector({
      ...input,

      request: requestWithFileCache,

      fileGetter: cachedGitHubFileGetter,
    });
  };

  const check1RunnerWithRequest = async (input) => {
    return check1Runner({
      ...input,

      evidenceCollector: check1EvidenceCollectorWithRequest,
    });
  };

  /*
   * =================================================
   * Bind Check 2 evidence
   * =================================================
   */

  const check2EvidenceCollectorWithRequest = async (input) => {
    return check2EvidenceCollector({
      ...input,

      request: requestWithFileCache,

      fileGetter: cachedGitHubFileGetter,
    });
  };

  const check2RunnerWithRequest = async (input) => {
    return check2Runner({
      ...input,

      evidenceCollector: check2EvidenceCollectorWithRequest,
    });
  };

  /*
   * =================================================
   * Bind Check 3 evidence
   * =================================================
   */

  const check3EvidenceCollectorWithRequest = async (input) => {
    return check3EvidenceCollector({
      ...input,

      request: requestWithFileCache,

      fileGetter: cachedGitHubFileGetter,
    });
  };

  const check3RunnerWithRequest = async (input) => {
    return check3Runner({
      ...input,

      evidenceCollector: check3EvidenceCollectorWithRequest,
    });
  };

  /*
   * =================================================
   * Bind Check 4 evidence
   * =================================================
   *
   * Check 4 has two GitHub evidence paths:
   *
   * 1. Candidate repository behavior
   * 2. Official Technocore reference behavior
   *
   * Both use the same cache.
   *
   * Cache keys include repository identity and ref,
   * so candidate evidence can never collide with
   * the pinned Technocore reference repository.
   */

  const check4EvidenceCollectorWithRequest = async (input) => {
    return check4EvidenceCollector({
      ...input,

      request: requestWithFileCache,

      fileGetter: cachedGitHubFileGetter,
    });
  };

  /*
   * The normal Check 4 reference-profile builder
   * accepts an evidenceCollector dependency.
   *
   * We inject our request-bound + cache-bound
   * collector so the pinned official Technocore
   * reference does not fall back to global fetch.
   */

  const check4ReferenceProfileBuilderWithRequest = async () => {
    return check4ReferenceProfileBuilder({
      evidenceCollector: check4EvidenceCollectorWithRequest,
    });
  };

  const check4RunnerWithRequest = async (input) => {
    return check4Runner({
      ...input,

      targetEvidenceCollector: check4EvidenceCollectorWithRequest,

      referenceProfileBuilder: check4ReferenceProfileBuilderWithRequest,
    });
  };

  /*
   * =================================================
   * Bind existing Methodology 1.0 engine
   * =================================================
   *
   * runFrozenMethodology() supplies its frozen
   * sourceAssessor closure here.
   *
   * We preserve that closure exactly and only add
   * hardened Check 1–4 runners.
   */

  const methodologyRunnerWithRequest = async (
    owner,
    repo,
    { sourceAssessor } = {},
  ) => {
    return methodologyRunner(
      owner,
      repo,

      {
        sourceAssessor,

        check1Runner: check1RunnerWithRequest,

        check2Runner: check2RunnerWithRequest,

        check3Runner: check3RunnerWithRequest,

        check4Runner: check4RunnerWithRequest,
      },
    );
  };

  /*
   * =================================================
   * Return production-compatible frozen runner
   * =================================================
   *
   * The returned function has the exact runner shape
   * expected by:
   *
   * executePreparedScoutInvestigation()
   */

  return async function githubMethodologyRunner(input) {
    return frozenMethodologyRunner(
      input,

      {
        frozenSourceAssessor: frozenSourceAssessorWithRequest,

        methodologyRunner: methodologyRunnerWithRequest,
      },
    );
  };
}
