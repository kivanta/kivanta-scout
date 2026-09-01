import { extractGitHubRepoCandidates } from "./extractGitHubRepoCandidates.js";

export async function correlateWebsiteToGitHub(
  websiteUrl,
  { fetcher = fetch } = {},
) {
  let response;

  try {
    response = await fetcher(websiteUrl, {
      headers: {
        Accept: "text/html",
      },
    });
  } catch {
    return {
      status: "source_not_established",
      reason: "website_fetch_failed",
      candidates: [],
      evidence: [],
    };
  }

  if (!response.ok) {
    return {
      status: "source_not_established",
      reason: "website_not_available",
      httpStatus: response.status,
      candidates: [],
      evidence: [],
    };
  }

  const contentType = response.headers?.get?.("content-type") || "";

  if (contentType && !contentType.includes("text/html")) {
    return {
      status: "source_not_established",
      reason: "website_not_html",
      candidates: [],
      evidence: [],
    };
  }

  const html = await response.text();

  const extracted = extractGitHubRepoCandidates(html);

  if (extracted.status !== "candidates_found") {
    return {
      status: "source_not_established",
      reason: "github_source_not_found_on_website",
      candidates: [],
      evidence: [],
    };
  }

  const candidates = extracted.candidates.map((candidate) => ({
    ...candidate,

    discoveryBasis: "first_party_website_link",
  }));

  if (candidates.length > 1) {
    return {
      status: "candidate_source_ambiguous",

      reason: "multiple_github_repositories_found",

      candidates: candidates,

      evidence: [
        {
          type: "first_party_website",
          url: websiteUrl,
        },
      ],
    };
  }

  return {
    status: "candidate_source",

    candidate: candidates[0],

    candidates: candidates,

    evidence: [
      {
        type: "first_party_website",
        url: websiteUrl,
      },

      {
        type: "github_repository_link",
        url: candidates[0].canonicalUrl,
      },
    ],
  };
}
