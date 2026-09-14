/*
 * =========================================================
 * KIVANTA SCOUT
 * CHECK 1 RESULT BUILDER
 * =========================================================
 *
 * Check 1:
 *
 * "What does this tool actually do?"
 *
 *
 * PURPOSE
 *
 * Convert the summarized source observations into the
 * visitor-facing Check 1 Methodology result.
 *
 *
 * IMPORTANT SEMANTIC RULE
 *
 * DID identity and cryptographic signing are NOT mandatory
 * for every legitimate Technocore tool.
 *
 * A read-only Technocore tool can establish its behavior
 * through:
 *
 * - a material Technocore endpoint/reference
 * - observed network behavior
 *
 * A signing-oriented Technocore tool can establish its
 * behavior through:
 *
 * - Technocore evidence
 * - DID identity
 * - cryptographic signing
 *
 * Scout must not require capabilities that the inspected
 * tool does not claim to provide.
 *
 * PASS means the inspected source evidence is sufficient to
 * establish the tool's Technocore behavior.
 *
 * PASS is NOT:
 *
 * - a safety verdict
 * - a certification
 * - proof that every runtime behavior has been observed
 */

export function buildCheck1Result(summary) {
  const title = "What does this tool actually do?";

  /*
   * -------------------------------------------------------
   * SUMMARY NOT READY
   * -------------------------------------------------------
   */

  if (summary?.status !== "summary_ready") {
    return {
      status: "UNKNOWN",

      title,

      conclusion:
        "Scout could not establish the tool's primary behavior from the available source evidence.",

      evidence: [],
    };
  }

  /*
   * -------------------------------------------------------
   * CATEGORY INDEX
   * -------------------------------------------------------
   */

  const categories = Array.isArray(summary.categories)
    ? summary.categories
    : [];

  const byCategory = new Map(
    categories.map((category) => [category.category, category]),
  );

  /*
   * -------------------------------------------------------
   * PUBLIC EVIDENCE PROJECTION
   * -------------------------------------------------------
   */

  const evidence = [];

  function addCategory(categoryName) {
    const category = byCategory.get(categoryName);

    if (!category) {
      return;
    }

    evidence.push({
      category: category.category,

      labels: Array.isArray(category.labels) ? category.labels : [],

      observationCount: typeof category.count === "number" ? category.count : 0,

      examples: Array.isArray(category.evidence) ? category.evidence : [],
    });
  }

  addCategory("entry_point");
  addCategory("technocore");
  addCategory("identity");
  addCategory("signing");
  addCategory("configuration");
  addCategory("network");
  addCategory("filesystem");
  addCategory("process");

  /*
   * -------------------------------------------------------
   * MATERIAL BEHAVIOR SIGNALS
   * -------------------------------------------------------
   */

  const technocoreCategory = byCategory.get("technocore");

  const technocoreLabels = new Set(
    Array.isArray(technocoreCategory?.labels) ? technocoreCategory.labels : [],
  );

  const hasTechnocore = Boolean(technocoreCategory);

  const hasTechnocoreEndpoint =
    technocoreLabels.has("technocore_host") ||
    technocoreLabels.has("room_endpoint");

  const hasNetwork = byCategory.has("network");

  const hasIdentity = byCategory.has("identity");

  const hasSigning = byCategory.has("signing");

  /*
   * -------------------------------------------------------
   * PASS PATH 1
   * READ-ONLY / NETWORK-ORIENTED TECHNOCORE TOOL
   * -------------------------------------------------------
   *
   * Example:
   *
   * A tool reads from a public Technocore room endpoint
   * without requiring a wallet, DID, key, or signature.
   *
   * The tool's behavior can still be established from:
   *
   * - Technocore endpoint evidence
   * - network behavior
   */

  const hasEstablishedTechnocoreNetworkBehavior =
    hasTechnocoreEndpoint && hasNetwork;

  /*
   * -------------------------------------------------------
   * PASS PATH 2
   * IDENTITY / SIGNING-ORIENTED TECHNOCORE TOOL
   * -------------------------------------------------------
   */

  const hasEstablishedTechnocoreSigningBehavior =
    hasTechnocore && hasIdentity && hasSigning;

  /*
   * -------------------------------------------------------
   * PASS
   * -------------------------------------------------------
   */

  if (
    hasEstablishedTechnocoreNetworkBehavior ||
    hasEstablishedTechnocoreSigningBehavior
  ) {
    let conclusion;

    if (hasEstablishedTechnocoreNetworkBehavior && hasIdentity && hasSigning) {
      conclusion =
        "Source evidence establishes Technocore network behavior together with DID-based identity and cryptographic signing behavior.";
    } else if (hasEstablishedTechnocoreNetworkBehavior) {
      conclusion =
        "Source evidence establishes Technocore network behavior for the inspected tool.";
    } else {
      conclusion =
        "Source evidence establishes Technocore behavior through DID-based identity and cryptographic signing.";
    }

    return {
      status: "PASS",

      title,

      conclusion,

      evidence,
    };
  }

  /*
   * -------------------------------------------------------
   * UNKNOWN
   * -------------------------------------------------------
   *
   * Technocore may have been mentioned or partially
   * observed, but Scout did not establish enough material
   * behavior to say what the tool actually does.
   */

  return {
    status: "UNKNOWN",

    title,

    conclusion:
      "Scout found source-level behavior, but the available evidence is not sufficient to establish the tool's primary Technocore behavior.",

    evidence,
  };
}
