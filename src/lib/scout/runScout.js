import { runDiscoveryPipeline } from "./runDiscoveryPipeline.js";
import { runMethodology } from "./runMethodology.js";

export async function runScout(
  value,
  {
    discoveryRunner = runDiscoveryPipeline,

    methodologyRunner = runMethodology,
  } = {},
) {
  const discovery = await discoveryRunner(value);

  /*
   * Discovery could not establish
   * a supported source.
   *
   * Stop here.
   * No methodology findings.
   */
  if (
    discovery.status !== "supported_source" ||
    discovery.methodologyEligible !== true
  ) {
    return {
      status: "discovery_only",

      reason: discovery.reason || "supported_source_not_established",

      inputType: discovery.inputType || null,

      canonicalSource: null,

      discovery: discovery,

      methodology: null,
    };
  }

  const canonicalSource = discovery.canonicalSource;

  const sourceAssessment = discovery.source?.sourceAssessment;

  /*
   * A supported discovery result must
   * contain the established canonical
   * source and its source assessment.
   */
  if (
    !canonicalSource?.owner ||
    !canonicalSource?.repo ||
    sourceAssessment?.status !== "supported_source"
  ) {
    return {
      status: "discovery_only",

      reason: "supported_source_details_not_available",

      inputType: discovery.inputType || null,

      canonicalSource: canonicalSource || null,

      discovery: discovery,

      methodology: null,
    };
  }

  /*
   * Reuse the source assessment already
   * established during discovery.
   *
   * This prevents Scout from needlessly
   * performing the source gate twice.
   */
  const methodology = await methodologyRunner(
    canonicalSource.owner,
    canonicalSource.repo,
    {
      sourceAssessor: async () => sourceAssessment,
    },
  );

  if (methodology.status !== "methodology_run") {
    return {
      status: "methodology_not_run",

      reason: methodology.reason || "methodology_execution_not_established",

      inputType: discovery.inputType || null,

      canonicalSource: canonicalSource,

      discovery: discovery,

      methodology: methodology,
    };
  }

  return {
    status: "scout_result",

    inputType: discovery.inputType || null,

    canonicalSource: canonicalSource,

    executionStatus: methodology.executionStatus,

    resultStatus: methodology.resultStatus,

    discovery: discovery,

    methodology: methodology,
  };
}
