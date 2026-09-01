import { resolveEnsDiscoveryRecords } from "./resolveEnsDiscoveryRecords.js";
import { extractGitHubRepoCandidates } from "./extractGitHubRepoCandidates.js";
import { correlateWebsiteToGitHub } from "./correlateWebsiteToGitHub.js";

function isHttpUrl(value) {
  try {
    const url = new URL(value);

    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isGitHubHost(value) {
  try {
    const url = new URL(value);

    return url.hostname.toLowerCase() === "github.com";
  } catch {
    return false;
  }
}

export async function correlateEnsToGitHub(
  ensName,
  {
    ensResolver = resolveEnsDiscoveryRecords,

    websiteCorrelator = correlateWebsiteToGitHub,
  } = {},
) {
  const resolved = await ensResolver(ensName);

  if (resolved.status !== "ens_records_found") {
    return {
      status: "source_not_established",

      reason: resolved.reason || "ens_source_clue_not_found",

      ensName: ensName,

      candidates: [],

      evidence: resolved.evidence || [],
    };
  }

  const evidence = [...(resolved.evidence || [])];

  const url = resolved.records?.url;

  const githubHandle = resolved.records?.githubHandle;

  /*
   * Strongest ENS evidence:
   * exact GitHub repository in URL record.
   */
  if (url) {
    const extracted = extractGitHubRepoCandidates(url);

    if (extracted.status === "candidates_found") {
      const candidates = extracted.candidates.map((candidate) => ({
        ...candidate,

        discoveryBasis: "ens_url_github_repository",
      }));

      if (candidates.length > 1) {
        return {
          status: "candidate_source_ambiguous",

          reason: "multiple_github_repositories_found",

          ensName: ensName,

          candidates: candidates,

          evidence: evidence,
        };
      }

      return {
        status: "candidate_source",

        ensName: ensName,

        candidate: candidates[0],

        candidates: candidates,

        evidence: [
          ...evidence,

          {
            type: "github_repository_link",

            url: candidates[0].canonicalUrl,
          },
        ],
      };
    }

    /*
     * GitHub account/profile ≠ repository.
     * Scout must not guess.
     */
    if (isGitHubHost(url)) {
      return {
        status: "source_not_established",

        reason: "ens_github_url_not_repository",

        ensName: ensName,

        githubHandle: githubHandle,

        candidates: [],

        evidence: evidence,
      };
    }

    /*
     * ENS points to project website.
     * Reuse website correlation.
     */
    if (isHttpUrl(url)) {
      const websiteResult = await websiteCorrelator(url);

      if (websiteResult.status === "candidate_source") {
        const candidate = {
          ...websiteResult.candidate,

          discoveryBasis: "ens_url_via_website",
        };

        return {
          status: "candidate_source",

          ensName: ensName,

          candidate: candidate,

          candidates: [candidate],

          evidence: [
            ...evidence,

            {
              type: "ens_project_url",

              url: url,
            },

            ...(websiteResult.evidence || []),
          ],
        };
      }

      return {
        ...websiteResult,

        ensName: ensName,

        evidence: [
          ...evidence,

          {
            type: "ens_project_url",

            url: url,
          },

          ...(websiteResult.evidence || []),
        ],
      };
    }
  }

  /*
   * GitHub ENS record identifies an
   * account, not a specific repository.
   */
  if (githubHandle) {
    return {
      status: "source_not_established",

      reason: "ens_github_handle_not_repository",

      ensName: ensName,

      githubHandle: githubHandle,

      candidates: [],

      evidence: evidence,
    };
  }

  return {
    status: "source_not_established",

    reason: "ens_source_clue_not_found",

    ensName: ensName,

    candidates: [],

    evidence: evidence,
  };
}
