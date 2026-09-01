import { correlateDiscovery } from "./correlateDiscovery.js";
import { establishDiscoveredSource } from "./establishDiscoveredSource.js";

export async function runDiscoveryPipeline(
  value,
  {
    correlator = correlateDiscovery,
    sourceEstablisher = establishDiscoveredSource,
  } = {},
) {
  const correlation = await correlator(value);

  /*
   * Discovery could not establish one
   * unambiguous GitHub candidate.
   *
   * Stop here. No methodology findings.
   */
  if (correlation.status !== "candidate_source") {
    return {
      status: "discovery_only",

      reason: correlation.reason || correlation.status,

      inputType:
        correlation.inputType || correlation.discovery?.inputType || null,

      correlation: correlation,

      source: null,

      methodologyEligible: false,
    };
  }

  const source = await sourceEstablisher(correlation);

  /*
   * A candidate existed, but the existing
   * supported-source gate rejected it.
   */
  if (source.status !== "supported_source") {
    return {
      status: "discovery_only",

      reason: source.reason || "supported_source_not_established",

      inputType: correlation.discovery?.inputType || null,

      correlation: correlation,

      source: source,

      methodologyEligible: false,
    };
  }

  return {
    status: "supported_source",

    inputType: correlation.discovery?.inputType || null,

    canonicalSource: source.canonicalSource,

    evidence: source.evidence || [],

    correlation: correlation,

    source: source,

    methodologyEligible: true,
  };
}
