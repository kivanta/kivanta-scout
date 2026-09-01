import { extractGitHubRepoCandidates } from "./extractGitHubRepoCandidates.js";
import { extractDidKeyCandidates } from "./extractDidKeyCandidates.js";
import { correlateTechnocoreDidToGitHub } from "./correlateTechnocoreDidToGitHub.js";

export async function correlateTechnocoreReferenceToGitHub(
  referenceUrl,
  { fetcher = fetch, didCorrelator = correlateTechnocoreDidToGitHub } = {},
) {
  let response;

  try {
    response = await fetcher(referenceUrl);
  } catch {
    return {
      status: "source_not_established",
      reason: "technocore_reference_fetch_failed",
      candidates: [],
      evidence: [],
    };
  }

  if (!response.ok) {
    return {
      status: "source_not_established",
      reason: "technocore_reference_not_available",
      httpStatus: response.status,
      candidates: [],
      evidence: [],
    };
  }

  const text = await response.text();

  const referenceEvidence = {
    type: "technocore_public_reference",
    url: referenceUrl,
  };

  /*
   * Strongest evidence first:
   * an explicit repository link in
   * the public Technocore reference.
   */
  const github = extractGitHubRepoCandidates(text);

  if (github.status === "candidates_found") {
    const candidates = github.candidates.map((candidate) => ({
      ...candidate,

      discoveryBasis: "technocore_reference_link",
    }));

    if (candidates.length > 1) {
      return {
        status: "candidate_source_ambiguous",

        reason: "multiple_github_repositories_found",

        candidates: candidates,

        evidence: [referenceEvidence],
      };
    }

    return {
      status: "candidate_source",

      candidate: candidates[0],

      candidates: candidates,

      evidence: [
        referenceEvidence,

        {
          type: "github_repository_link",
          url: candidates[0].canonicalUrl,
        },
      ],
    };
  }

  /*
   * No direct repository link.
   * Try an explicitly referenced DID.
   */
  const dids = extractDidKeyCandidates(text);

  if (dids.candidates.length > 1) {
    return {
      status: "candidate_source_ambiguous",

      reason: "multiple_did_identities_found",

      didCandidates: dids.candidates,

      candidates: [],

      evidence: [referenceEvidence],
    };
  }

  if (dids.candidates.length === 1) {
    const did = dids.candidates[0];

    const didResult = await didCorrelator(did);

    if (didResult.status === "candidate_source") {
      const candidate = {
        ...didResult.candidate,

        discoveryBasis: "technocore_reference_via_did",
      };

      return {
        status: "candidate_source",

        candidate: candidate,

        candidates: [candidate],

        evidence: [
          referenceEvidence,

          {
            type: "technocore_reference_did",
            did: did,
          },

          ...(didResult.evidence || []),
        ],
      };
    }

    return {
      ...didResult,

      evidence: [
        referenceEvidence,

        {
          type: "technocore_reference_did",
          did: did,
        },

        ...(didResult.evidence || []),
      ],
    };
  }

  return {
    status: "source_not_established",

    reason: "github_or_did_source_clue_not_found",

    candidates: [],

    evidence: [referenceEvidence],
  };
}
