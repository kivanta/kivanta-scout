import { runDiscoveryPipeline } from "../../lib/scout/runDiscoveryPipeline.js";

/**
 * Prepare a Scout investigation.
 *
 * This is the first application-layer boundary.
 *
 * It:
 * - accepts the visitor's public reference
 * - runs Scout discovery
 * - decides whether a supported source was established
 *
 * It does NOT:
 * - run Methodology 1.0 yet
 * - write to D1
 * - use a Queue
 * - publish a review
 */
export async function prepareInvestigation(
  value,
  { discoveryRunner = runDiscoveryPipeline } = {},
) {
  // Stop empty input before it reaches discovery.
  if (typeof value !== "string" || value.trim() === "") {
    return {
      status: "invalid_request",
      reason: "input_required",

      input: null,
      inputType: null,

      methodologyEligible: false,

      canonicalSource: null,
      discovery: null,
    };
  }

  const input = value.trim();

  // Discovery is always the first Scout stage.
  const discovery = await discoveryRunner(input);

  // Methodology is allowed only after a supported
  // canonical source has been established.
  const sourceIsReady =
    discovery?.status === "supported_source" &&
    discovery?.methodologyEligible === true &&
    Boolean(discovery?.canonicalSource?.owner) &&
    Boolean(discovery?.canonicalSource?.repo) &&
    discovery?.source?.sourceAssessment?.status === "supported_source";

  // Discovery finished, but Scout still does not
  // have a supported source.
  if (!sourceIsReady) {
    return {
      status: "discovery_only",

      reason: discovery?.reason || "supported_source_not_established",

      input: input,

      inputType: discovery?.inputType || null,

      methodologyEligible: false,

      canonicalSource: discovery?.canonicalSource || null,

      discovery: discovery || null,
    };
  }

  // Scout has established a supported source.
  // We stop here for now.
  return {
    status: "source_ready",

    reason: null,

    input: input,

    inputType: discovery.inputType || null,

    methodologyEligible: true,

    canonicalSource: discovery.canonicalSource,

    sourceAssessment: discovery.source.sourceAssessment,

    discovery: discovery,
  };
}
