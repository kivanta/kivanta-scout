export function extractDidKeyCandidates(text) {
  if (typeof text !== "string" || text.trim() === "") {
    return {
      status: "no_did_candidates_found",
      candidates: [],
    };
  }

  const matches = text.match(/\bdid:key:[A-Za-z0-9._%-]+/g) || [];

  const candidates = [...new Set(matches)];

  return {
    status:
      candidates.length > 0
        ? "did_candidates_found"
        : "no_did_candidates_found",

    candidateCount: candidates.length,

    candidates: candidates,
  };
}
