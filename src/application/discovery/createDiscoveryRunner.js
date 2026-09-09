import { runDiscoveryPipeline } from "../../lib/scout/runDiscoveryPipeline.js";

import { discoverInput } from "../../lib/scout/discoverInput.js";
import { correlateDiscovery } from "../../lib/scout/correlateDiscovery.js";

import { correlateWebsiteToGitHub } from "../../lib/scout/correlateWebsiteToGitHub.js";
import { correlateTechnocoreDidToGitHub } from "../../lib/scout/correlateTechnocoreDidToGitHub.js";
import { correlateTechnocoreReferenceToGitHub } from "../../lib/scout/correlateTechnocoreReferenceToGitHub.js";
import { correlateEnsToGitHub } from "../../lib/scout/correlateEnsToGitHub.js";

import { establishDiscoveredSource } from "../../lib/scout/establishDiscoveredSource.js";
import { assessGitHubSource } from "../../lib/scout/assessGitHubSource.js";

/*
 * Kivanta Scout
 * Discovery Composition Boundary
 *
 * This binds Scout's existing discovery rules
 * to runtime-supplied outbound request boundaries.
 *
 * It does NOT:
 *
 * - change discovery rules
 * - change supported-source rules
 * - run Methodology 1.0
 * - know about Cloudflare env bindings
 *
 *
 * Runtime dependencies:
 *
 * githubRequest
 *   Hardened request for GitHub-controlled hosts.
 *
 * publicRequest
 *   Hardened request for public project /
 *   Technocore references.
 */

export function createDiscoveryRunner({ githubRequest, publicRequest } = {}) {
  if (typeof githubRequest !== "function") {
    throw new Error("github_request_boundary_required");
  }

  if (typeof publicRequest !== "function") {
    throw new Error("public_reference_request_boundary_required");
  }

  /*
   * ------------------------------------------------
   * Direct input discovery
   * ------------------------------------------------
   *
   * Direct GitHub input needs repository
   * verification through the hardened
   * GitHub boundary.
   */

  const inputDiscoverer = (value) =>
    discoverInput(value, {
      request: githubRequest,
    });

  /*
   * ------------------------------------------------
   * Public website correlation
   * ------------------------------------------------
   */

  const websiteCorrelator = (websiteUrl) =>
    correlateWebsiteToGitHub(websiteUrl, {
      fetcher: publicRequest,
    });

  /*
   * ------------------------------------------------
   * Technocore DID correlation
   * ------------------------------------------------
   */

  const didCorrelator = (did) =>
    correlateTechnocoreDidToGitHub(did, {
      fetcher: publicRequest,
    });

  /*
   * ------------------------------------------------
   * Technocore public-reference correlation
   * ------------------------------------------------
   *
   * If a Technocore page points to a DID,
   * that nested DID lookup must continue using
   * the same public-reference boundary.
   */

  const technocoreReferenceCorrelator = (referenceUrl) =>
    correlateTechnocoreReferenceToGitHub(referenceUrl, {
      fetcher: publicRequest,

      didCorrelator,
    });

  /*
   * ------------------------------------------------
   * ENS correlation
   * ------------------------------------------------
   *
   * ENS resolution itself remains owned by viem.
   *
   * If the resolved ENS URL points to a project
   * website, that website request is forced back
   * through Scout's hardened public boundary.
   */

  const ensCorrelator = (ensName) =>
    correlateEnsToGitHub(ensName, {
      websiteCorrelator,
    });

  /*
   * ------------------------------------------------
   * Correlation composition
   * ------------------------------------------------
   */

  const correlator = (value) =>
    correlateDiscovery(value, {
      inputDiscoverer,

      websiteCorrelator,

      didCorrelator,

      technocoreReferenceCorrelator,

      ensCorrelator,
    });

  /*
   * ------------------------------------------------
   * Supported-source assessment
   * ------------------------------------------------
   *
   * Once correlation identifies a candidate
   * GitHub repository, every GitHub read remains
   * inside the same hardened GitHub boundary.
   */

  const sourceAssessor = (owner, repo) =>
    assessGitHubSource(owner, repo, {
      request: githubRequest,
    });

  const sourceEstablisher = (correlation) =>
    establishDiscoveredSource(correlation, {
      sourceAssessor,
    });

  /*
   * ------------------------------------------------
   * Production-compatible discovery runner
   * ------------------------------------------------
   */

  return function discoveryRunner(value) {
    return runDiscoveryPipeline(value, {
      correlator,

      sourceEstablisher,
    });
  };
}
