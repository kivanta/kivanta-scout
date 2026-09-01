import { discoverInput } from "./discoverInput.js";
import { correlateWebsiteToGitHub } from "./correlateWebsiteToGitHub.js";
import { correlateTechnocoreDidToGitHub } from "./correlateTechnocoreDidToGitHub.js";
import { correlateTechnocoreReferenceToGitHub } from "./correlateTechnocoreReferenceToGitHub.js";
import { correlateEnsToGitHub } from "./correlateEnsToGitHub.js";

export async function correlateDiscovery(
  value,
  {
    inputDiscoverer = discoverInput,

    websiteCorrelator = correlateWebsiteToGitHub,

    didCorrelator = correlateTechnocoreDidToGitHub,

    technocoreReferenceCorrelator = correlateTechnocoreReferenceToGitHub,

    ensCorrelator = correlateEnsToGitHub,
  } = {},
) {
  const discovery = await inputDiscoverer(value);

  /*
   * Direct GitHub input.
   */
  if (
    discovery.inputType === "github_repo" &&
    discovery.status === "repo_found"
  ) {
    const candidate = {
      owner: discovery.owner,

      repo: discovery.repo,

      canonicalUrl: discovery.canonicalUrl,

      discoveryBasis: "direct_github_input",
    };

    return {
      status: "candidate_source",

      candidate: candidate,

      candidates: [candidate],

      evidence: [
        {
          type: "user_supplied_github_repository",

          url: discovery.canonicalUrl,
        },
      ],

      discovery: discovery,
    };
  }

  /*
   * Project website.
   */
  if (discovery.inputType === "website_url") {
    const result = await websiteCorrelator(value);

    return {
      ...result,

      discovery: discovery,
    };
  }

  /*
   * Raw Technocore DID.
   */
  if (discovery.inputType === "technocore_did") {
    const result = await didCorrelator(value);

    return {
      ...result,

      discovery: discovery,
    };
  }

  /*
   * Technocore public reference.
   */
  if (discovery.inputType === "technocore_reference") {
    const result = await technocoreReferenceCorrelator(value);

    return {
      ...result,

      discovery: discovery,
    };
  }

  /*
   * ENS name.
   */
  if (discovery.inputType === "ens_name") {
    const result = await ensCorrelator(value);

    return {
      ...result,

      discovery: discovery,
    };
  }

  return {
    status: "source_not_established",

    reason:
      discovery.reason ||
      discovery.status ||
      "input_not_supported_for_correlation",

    candidates: [],

    evidence: [],

    discovery: discovery,
  };
}
