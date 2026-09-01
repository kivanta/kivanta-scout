import { buildTechnocoreDidNotePaths } from "./buildTechnocoreDidNotePaths.js";
import { extractGitHubRepoCandidates } from "./extractGitHubRepoCandidates.js";

export async function correlateTechnocoreDidToGitHub(
  did,
  { fetcher = fetch, origin = "https://technocore.chat" } = {},
) {
  const pathResult = await buildTechnocoreDidNotePaths(did);

  if (pathResult.status !== "did_paths_ready") {
    return {
      status: "source_not_established",
      reason: pathResult.reason,
      candidates: [],
      evidence: [],
    };
  }

  const evidence = [];

  for (const path of pathResult.paths) {
    const url = `${origin}${path}`;

    let response;

    try {
      response = await fetcher(url);
    } catch {
      continue;
    }

    if (!response.ok) {
      continue;
    }

    const text = await response.text();

    evidence.push({
      type: "technocore_did_note",
      url: url,
      fingerprint: pathResult.fingerprint,
    });

    const extracted = extractGitHubRepoCandidates(text);

    if (extracted.status !== "candidates_found") {
      continue;
    }

    const candidates = extracted.candidates.map((candidate) => ({
      ...candidate,

      discoveryBasis: "technocore_did_note",
    }));

    if (candidates.length > 1) {
      return {
        status: "candidate_source_ambiguous",

        reason: "multiple_github_repositories_found",

        did: did,

        candidates: candidates,

        evidence: evidence,
      };
    }

    return {
      status: "candidate_source",

      did: did,

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

  return {
    status: "source_not_established",

    reason: "github_source_not_found_in_did_note",

    did: did,

    candidates: [],

    evidence: evidence,
  };
}
