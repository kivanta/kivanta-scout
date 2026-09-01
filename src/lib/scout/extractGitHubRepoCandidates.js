import { normalizeGitHubRepo } from "./normalizeGitHubRepo.js";

export function extractGitHubRepoCandidates(text) {
  if (typeof text !== "string" || text.trim() === "") {
    return {
      status: "no_candidates_found",
      candidates: [],
    };
  }

  const matches =
    text.match(
      /https?:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?(?:[/?#][^\s"'<>]*)?/gi,
    ) || [];

  const candidateMap = new Map();

  for (const match of matches) {
    const normalized = normalizeGitHubRepo(match);

    if (!normalized) {
      continue;
    }

    const key = `${normalized.owner}/${normalized.repo}`.toLowerCase();

    if (!candidateMap.has(key)) {
      candidateMap.set(key, {
        owner: normalized.owner,
        repo: normalized.repo,
        canonicalUrl: normalized.canonicalUrl,
      });
    }
  }

  const candidates = [...candidateMap.values()];

  return {
    status: candidates.length > 0 ? "candidates_found" : "no_candidates_found",

    candidateCount: candidates.length,

    candidates: candidates,
  };
}
