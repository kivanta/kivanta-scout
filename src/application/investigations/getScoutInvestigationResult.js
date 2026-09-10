import { validateInvestigationRepository } from "../ports/investigationRepository.js";

import { validateInvestigationExecutionRepository } from "../ports/investigationExecutionRepository.js";

/*
 * Kivanta Scout
 * Get Scout Investigation Result
 *
 * Public-safe application boundary between:
 *
 *   durable Methodology execution
 *
 * and:
 *
 *   a future public HTTP result endpoint
 *
 *
 * IMPORTANT:
 *
 * The durable execution repository contains
 * internal operational fields that must NEVER be
 * returned directly to a visitor.
 *
 * Examples:
 *
 * - executionId
 * - leaseToken
 * - attempt
 * - internal failureReason
 * - raw malformed JSON fallback
 *
 *
 * This service therefore creates a second,
 * explicit public projection.
 *
 *
 * It does NOT:
 *
 * - know about Astro
 * - know about Cloudflare bindings
 * - expose source code
 * - expose lease information
 * - expose execution IDs
 * - expose raw D1 errors
 * - turn operational failure into UNKNOWN
 * - change Methodology findings
 * - manufacture missing conclusions
 */

/*
 * ------------------------------------------------
 * Constants
 * ------------------------------------------------
 */

const PERSISTED_OUTCOME_SCHEMA = "scout-methodology-outcome-v1";

const PUBLIC_RESULT_SCHEMA = "scout-public-investigation-result-v1";

const TERMINAL_SUCCESS_STATES = new Set(["COMPLETE", "PARTIAL"]);

const TERMINAL_EXECUTION_STATES = new Set(["COMPLETE", "PARTIAL", "FAILED"]);

const ALLOWED_RESULT_STATUSES = new Set(["PASS", "CAUTION", "UNKNOWN", "N/A"]);

const ALLOWED_CHECK_STATUSES = new Set([
  "PASS",
  "CAUTION",
  "UNKNOWN",
  "N/A",
  "NOT_RUN",
  "PARTIAL",
  "FAILED",
]);

const EXPECTED_CHECK_TITLES = [
  "What does this tool actually do?",
  "Your Key, Password & Sensitive Information",
  "Where Does It Connect?",
  "Does It Match the Official Technocore Reference?",
  "What Should I Know Before I Use It?",
];

/*
 * ------------------------------------------------
 * Basic helpers
 * ------------------------------------------------
 */

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function cleanString(value) {
  return isNonEmptyString(value) ? value.trim() : null;
}

function stringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isNonEmptyString).map((item) => item.trim());
}

function normalizeRepositoryId(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).trim();

  return normalized.length > 0 ? normalized : null;
}

function normalizeGitObjectId(value) {
  const normalized = cleanString(value);

  return normalized ? normalized.toLowerCase() : null;
}

/*
 * ------------------------------------------------
 * Evidence reference projection
 * ------------------------------------------------
 *
 * Persisted Methodology outcomes have already
 * removed source excerpts.
 *
 * We still project references explicitly rather
 * than returning persisted objects wholesale.
 */

function projectEvidenceReference(value, { includeSensitive = false } = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const projected = {
    sourceExcerptPersisted: false,
  };

  const path = cleanString(value.path);

  if (path) {
    projected.path = path;
  }

  if (Number.isInteger(value.line) && value.line > 0) {
    projected.line = value.line;
  }

  const label = cleanString(value.label);

  if (label) {
    projected.label = label;
  }

  if (includeSensitive && typeof value.sensitive === "boolean") {
    projected.sensitive = value.sensitive;
  }

  return projected;
}

/*
 * ------------------------------------------------
 * Check 1
 * ------------------------------------------------
 */

function projectCheck1Evidence(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((category) => {
      if (
        !category ||
        typeof category !== "object" ||
        Array.isArray(category)
      ) {
        return null;
      }

      return {
        category: cleanString(category.category),

        labels: stringArray(category.labels),

        observationCount:
          Number.isInteger(category.observationCount) &&
          category.observationCount >= 0
            ? category.observationCount
            : 0,

        examples: Array.isArray(category.examples)
          ? category.examples
              .map((item) => projectEvidenceReference(item))
              .filter(Boolean)
          : [],
      };
    })
    .filter(Boolean);
}

function projectCheck1(check) {
  return {
    title: EXPECTED_CHECK_TITLES[0],

    status: check.status,

    conclusion: cleanString(check.conclusion),

    reason: cleanString(check.reason),

    evidence: projectCheck1Evidence(check.evidence),
  };
}

/*
 * ------------------------------------------------
 * Check 2
 * ------------------------------------------------
 */

function projectSensitiveLifecycle(value) {
  const lifecycle =
    value && typeof value === "object" && !Array.isArray(value) ? value : {};

  return {
    sensitiveInput: Boolean(lifecycle.sensitiveInput),

    sensitiveStorage: Boolean(lifecycle.sensitiveStorage),

    sensitiveTransmission: Boolean(lifecycle.sensitiveTransmission),

    sensitiveExposure: Boolean(lifecycle.sensitiveExposure),

    sensitiveProcessUse: Boolean(lifecycle.sensitiveProcessUse),
  };
}

function projectCheck2Evidence(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((category) => {
      if (
        !category ||
        typeof category !== "object" ||
        Array.isArray(category)
      ) {
        return null;
      }

      return {
        category: cleanString(category.category),

        count:
          Number.isInteger(category.count) && category.count >= 0
            ? category.count
            : 0,

        sensitiveCount:
          Number.isInteger(category.sensitiveCount) &&
          category.sensitiveCount >= 0
            ? category.sensitiveCount
            : 0,

        labels: stringArray(category.labels),

        evidence: Array.isArray(category.evidence)
          ? category.evidence
              .map((item) =>
                projectEvidenceReference(item, {
                  includeSensitive: true,
                }),
              )
              .filter(Boolean)
          : [],
      };
    })
    .filter(Boolean);
}

function projectCheck2(check) {
  return {
    title: EXPECTED_CHECK_TITLES[1],

    status: check.status,

    conclusion: cleanString(check.conclusion),

    reason: cleanString(check.reason),

    limitation: cleanString(check.limitation),

    lifecycle: projectSensitiveLifecycle(check.lifecycle),

    evidence: projectCheck2Evidence(check.evidence),
  };
}

/*
 * ------------------------------------------------
 * Check 3
 * ------------------------------------------------
 */

function projectDestination(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const host = cleanString(value.host);

  if (!host) {
    return null;
  }

  const url = cleanString(value.url);

  return {
    url,

    host: host.toLowerCase(),

    technocore: Boolean(value.technocore),

    evidence: Array.isArray(value.evidence)
      ? value.evidence
          .map((item) => projectEvidenceReference(item))
          .filter(Boolean)
      : [],
  };
}

function projectDestinationArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(projectDestination).filter(Boolean);
}

function projectCheck3(check) {
  return {
    title: EXPECTED_CHECK_TITLES[2],

    status: check.status,

    conclusion: cleanString(check.conclusion),

    reason: cleanString(check.reason),

    limitation: cleanString(check.limitation),

    mechanisms: stringArray(check.mechanisms),

    destinations: projectDestinationArray(check.destinations),

    externalDestinations: projectDestinationArray(check.externalDestinations),
  };
}

/*
 * ------------------------------------------------
 * Check 4
 * ------------------------------------------------
 */

function projectReferenceAuthority(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return {
    registryVersion: cleanString(value.registryVersion),

    repositoryId: normalizeRepositoryId(value.repositoryId),

    owner: cleanString(value.owner),

    repo: cleanString(value.repo),

    canonicalUrl: cleanString(value.canonicalUrl),

    commitSha: normalizeGitObjectId(value.commitSha),

    treeSha: normalizeGitObjectId(value.treeSha),

    surfaces: stringArray(value.surfaces),
  };
}

function projectComparisonDimension(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return {
    category: cleanString(value.category),

    status: cleanString(value.status),

    reason: cleanString(value.reason),

    targetLabels: stringArray(value.targetLabels),

    referenceLabels: stringArray(value.referenceLabels),

    unmatchedTargetLabels: stringArray(value.unmatchedTargetLabels),
  };
}

function projectComparisonDimensions(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(projectComparisonDimension).filter(Boolean);
}

function projectCheck4(check) {
  return {
    title: EXPECTED_CHECK_TITLES[3],

    status: check.status,

    conclusion: cleanString(check.conclusion),

    reason: cleanString(check.reason),

    limitation: cleanString(check.limitation),

    authority: projectReferenceAuthority(check.authority),

    dimensions: projectComparisonDimensions(check.dimensions),

    differences: projectComparisonDimensions(check.differences),

    unresolved: projectComparisonDimensions(check.unresolved),
  };
}

/*
 * ------------------------------------------------
 * Check 5
 * ------------------------------------------------
 */

function projectMaterialFact(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const projected = {
    type: cleanString(value.type),

    sourceCheck: cleanString(value.sourceCheck),

    sourceStatus: cleanString(value.sourceStatus),

    kind: cleanString(value.kind),
  };

  const text = cleanString(value.text);

  if (text) {
    projected.text = text;
  }

  const host = cleanString(value.host);

  if (host) {
    projected.host = host.toLowerCase();
  }

  if (typeof value.technocore === "boolean") {
    projected.technocore = value.technocore;
  }

  const category = cleanString(value.category);

  if (category) {
    projected.category = category;
  }

  const reason = cleanString(value.reason);

  if (reason) {
    projected.reason = reason;
  }

  return projected;
}

function projectMaterialFacts(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(projectMaterialFact).filter(Boolean);
}

function projectCheck5(check) {
  return {
    title: EXPECTED_CHECK_TITLES[4],

    status: check.status,

    conclusion: cleanString(check.conclusion),

    reason: cleanString(check.reason),

    limitation: cleanString(check.limitation),

    considerations: projectMaterialFacts(check.considerations),

    unresolved: projectMaterialFacts(check.unresolved),

    materialConcerns: projectMaterialFacts(check.materialConcerns),

    precautions: stringArray(check.precautions),
  };
}

/*
 * ------------------------------------------------
 * Check dispatcher
 * ------------------------------------------------
 */

function projectChecks(checks) {
  if (!Array.isArray(checks) || checks.length !== 5) {
    return {
      status: "public_projection_failed",

      reason: "methodology_1_0_checks_required",
    };
  }

  const checksByTitle = new Map();

  for (const check of checks) {
    if (
      !check ||
      typeof check !== "object" ||
      Array.isArray(check) ||
      !EXPECTED_CHECK_TITLES.includes(check.title) ||
      !ALLOWED_CHECK_STATUSES.has(check.status)
    ) {
      return {
        status: "public_projection_failed",

        reason: "invalid_methodology_check",
      };
    }

    if (checksByTitle.has(check.title)) {
      return {
        status: "public_projection_failed",

        reason: "duplicate_methodology_check",
      };
    }

    checksByTitle.set(check.title, check);
  }

  for (const title of EXPECTED_CHECK_TITLES) {
    if (!checksByTitle.has(title)) {
      return {
        status: "public_projection_failed",

        reason: "methodology_check_missing",
      };
    }
  }

  return {
    status: "public_projection_ready",

    checks: [
      projectCheck1(checksByTitle.get(EXPECTED_CHECK_TITLES[0])),

      projectCheck2(checksByTitle.get(EXPECTED_CHECK_TITLES[1])),

      projectCheck3(checksByTitle.get(EXPECTED_CHECK_TITLES[2])),

      projectCheck4(checksByTitle.get(EXPECTED_CHECK_TITLES[3])),

      projectCheck5(checksByTitle.get(EXPECTED_CHECK_TITLES[4])),
    ],
  };
}

/*
 * ------------------------------------------------
 * Aggregation
 * ------------------------------------------------
 */

function projectAggregationReference(value) {
  if (isNonEmptyString(value)) {
    return value.trim();
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const projected = {};

  const checkId = cleanString(value.checkId);

  if (checkId) {
    projected.checkId = checkId;
  }

  const title = cleanString(value.title);

  if (title) {
    projected.title = title;
  }

  const status = cleanString(value.status);

  if (status) {
    projected.status = status;
  }

  const reason = cleanString(value.reason);

  if (reason) {
    projected.reason = reason;
  }

  return Object.keys(projected).length > 0 ? projected : null;
}

function projectAggregationReferenceArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(projectAggregationReference).filter(Boolean);
}

function projectAggregationCounts(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const projected = {};

  for (const [key, count] of Object.entries(value)) {
    if (Number.isInteger(count) && count >= 0) {
      projected[key] = count;
    }
  }

  return projected;
}

function projectAggregation(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return {
    status: cleanString(value.status),

    counts: projectAggregationCounts(value.counts),

    unknownChecks: projectAggregationReferenceArray(value.unknownChecks),

    cautionChecks: projectAggregationReferenceArray(value.cautionChecks),

    notApplicableChecks: projectAggregationReferenceArray(
      value.notApplicableChecks,
    ),

    partialChecks: projectAggregationReferenceArray(value.partialChecks),

    failedChecks: projectAggregationReferenceArray(value.failedChecks),

    notRunChecks: projectAggregationReferenceArray(value.notRunChecks),
  };
}

/*
 * ------------------------------------------------
 * Frozen public provenance
 * ------------------------------------------------
 */

function projectPublicProvenance(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const methodology =
    value.methodology &&
    typeof value.methodology === "object" &&
    !Array.isArray(value.methodology)
      ? {
          id: cleanString(value.methodology.id),

          version: cleanString(value.methodology.version),
        }
      : null;

  const source =
    value.source &&
    typeof value.source === "object" &&
    !Array.isArray(value.source)
      ? {
          repositoryId: normalizeRepositoryId(value.source.repositoryId),

          owner: cleanString(value.source.owner),

          repo: cleanString(value.source.repo),

          commitSha: normalizeGitObjectId(value.source.commitSha),

          treeSha: normalizeGitObjectId(value.source.treeSha),
        }
      : null;

  const technocoreReference =
    value.technocoreReference &&
    typeof value.technocoreReference === "object" &&
    !Array.isArray(value.technocoreReference)
      ? {
          registryVersion: cleanString(
            value.technocoreReference.registryVersion,
          ),

          repositoryId: normalizeRepositoryId(
            value.technocoreReference.repositoryId,
          ),

          commitSha: normalizeGitObjectId(value.technocoreReference.commitSha),

          treeSha: normalizeGitObjectId(value.technocoreReference.treeSha),
        }
      : null;

  const digest =
    value.referenceRegistryDigest &&
    typeof value.referenceRegistryDigest === "object" &&
    !Array.isArray(value.referenceRegistryDigest)
      ? {
          algorithm: cleanString(value.referenceRegistryDigest.algorithm),

          canonicalization: cleanString(
            value.referenceRegistryDigest.canonicalization,
          ),

          value: cleanString(value.referenceRegistryDigest.value),
        }
      : null;

  if (!methodology || !source || !technocoreReference || !digest) {
    return null;
  }

  return {
    methodology,

    source,

    technocoreReference,

    referenceRegistryDigest: digest,
  };
}

/*
 * ------------------------------------------------
 * Persisted outcome validation + projection
 * ------------------------------------------------
 */

function projectPersistedOutcome(outcome) {
  if (!outcome || typeof outcome !== "object" || Array.isArray(outcome)) {
    return {
      status: "public_projection_failed",

      reason: "analysis_outcome_required",
    };
  }

  /*
   * Explicitly reject the repository's malformed
   * JSON fallback.
   *
   * Its raw field is intentionally internal-only.
   */
  if (outcome.status === "analysis_outcome_parse_failed") {
    return {
      status: "public_projection_failed",

      reason: "analysis_outcome_not_readable",
    };
  }

  if (outcome.schema !== PERSISTED_OUTCOME_SCHEMA) {
    return {
      status: "public_projection_failed",

      reason: "unsupported_analysis_outcome_schema",
    };
  }

  if (outcome.status !== "methodology_run") {
    return {
      status: "public_projection_failed",

      reason: "completed_methodology_outcome_required",
    };
  }

  if (!["complete", "partial"].includes(outcome.executionStatus)) {
    return {
      status: "public_projection_failed",

      reason: "successful_methodology_execution_required",
    };
  }

  if (!ALLOWED_RESULT_STATUSES.has(outcome.resultStatus)) {
    return {
      status: "public_projection_failed",

      reason: "valid_result_status_required",
    };
  }

  const checkProjection = projectChecks(outcome.checks);

  if (checkProjection.status !== "public_projection_ready") {
    return checkProjection;
  }

  const provenance = projectPublicProvenance(outcome.frozenExecution);

  if (!provenance) {
    return {
      status: "public_projection_failed",

      reason: "public_provenance_required",
    };
  }

  return {
    status: "public_projection_ready",

    result: {
      schema: PUBLIC_RESULT_SCHEMA,

      resultStatus: outcome.resultStatus,

      methodology: provenance.methodology,

      source: provenance.source,

      technocoreReference: provenance.technocoreReference,

      referenceRegistryDigest: provenance.referenceRegistryDigest,

      checks: checkProjection.checks,

      aggregation: projectAggregation(outcome.aggregation),
    },
  };
}

/*
 * ------------------------------------------------
 * Main application service
 * ------------------------------------------------
 */

export async function getScoutInvestigationResult(
  investigationId,
  {
    investigationRepository,

    investigationExecutionRepository,
  } = {},
) {
  /*
   * ------------------------------------------------
   * Validate public ID
   * ------------------------------------------------
   */

  if (typeof investigationId !== "string" || investigationId.trim() === "") {
    return {
      status: "invalid_request",

      reason: "investigation_id_required",

      investigation: null,

      result: null,
    };
  }

  const normalizedInvestigationId = investigationId.trim();

  if (normalizedInvestigationId.length > 128) {
    return {
      status: "invalid_request",

      reason: "investigation_id_too_long",

      investigation: null,

      result: null,
    };
  }

  /*
   * ------------------------------------------------
   * Validate repositories
   * ------------------------------------------------
   */

  const investigationRepositoryValidation = validateInvestigationRepository(
    investigationRepository,
  );

  if (investigationRepositoryValidation.status !== "repository_ready") {
    return {
      status: "investigation_result_failed",

      reason: "investigation_repository_not_ready",

      investigation: null,

      result: null,
    };
  }

  const executionRepositoryValidation =
    validateInvestigationExecutionRepository(investigationExecutionRepository);

  if (executionRepositoryValidation.status !== "execution_repository_ready") {
    return {
      status: "investigation_result_failed",

      reason: "execution_repository_not_ready",

      investigation: null,

      result: null,
    };
  }

  /*
   * getLatestExecutionForInvestigation() was added
   * later than the original repository port.
   *
   * Require the capability here without widening
   * older execution-port tests unnecessarily.
   */
  if (
    typeof investigationExecutionRepository.getLatestExecutionForInvestigation !==
    "function"
  ) {
    return {
      status: "investigation_result_failed",

      reason: "latest_execution_query_required",

      investigation: null,

      result: null,
    };
  }

  /*
   * ------------------------------------------------
   * Load authoritative investigation
   * ------------------------------------------------
   */

  const investigationResult = await investigationRepository.getInvestigation(
    normalizedInvestigationId,
  );

  if (investigationResult?.status === "investigation_not_found") {
    return {
      status: "investigation_not_found",

      reason: null,

      investigation: null,

      result: null,
    };
  }

  if (
    investigationResult?.status !== "investigation_found" ||
    !investigationResult?.investigation
  ) {
    return {
      status: "investigation_result_failed",

      reason: investigationResult?.reason || "investigation_query_failed",

      investigation: null,

      result: null,
    };
  }

  const investigation = investigationResult.investigation;

  const publicInvestigation = {
    investigationId: investigation.investigationId,

    lifecycleState: investigation.lifecycleState,

    createdAt: investigation.createdAt ?? null,

    updatedAt: investigation.updatedAt ?? null,
  };

  /*
   * ------------------------------------------------
   * Non-terminal work
   * ------------------------------------------------
   */

  if (!TERMINAL_EXECUTION_STATES.has(investigation.lifecycleState)) {
    return {
      status: "result_not_ready",

      reason: null,

      investigation: publicInvestigation,

      result: null,
    };
  }

  /*
   * ------------------------------------------------
   * Operationally failed investigation
   * ------------------------------------------------
   *
   * Do NOT turn failure into UNKNOWN.
   *
   * Do NOT expose the stored operational
   * failureReason.
   */

  if (investigation.lifecycleState === "FAILED") {
    return {
      status: "investigation_failed",

      reason: null,

      investigation: publicInvestigation,

      result: null,
    };
  }

  /*
   * ------------------------------------------------
   * COMPLETE / PARTIAL investigation
   * ------------------------------------------------
   */

  if (!TERMINAL_SUCCESS_STATES.has(investigation.lifecycleState)) {
    return {
      status: "investigation_result_failed",

      reason: "unexpected_terminal_investigation_state",

      investigation: publicInvestigation,

      result: null,
    };
  }

  /*
   * ------------------------------------------------
   * Load latest durable execution
   * ------------------------------------------------
   */

  const executionResult =
    await investigationExecutionRepository.getLatestExecutionForInvestigation(
      normalizedInvestigationId,
    );

  if (executionResult?.status === "execution_not_found") {
    return {
      status: "investigation_result_failed",

      reason: "terminal_execution_not_found",

      investigation: publicInvestigation,

      result: null,
    };
  }

  if (
    executionResult?.status !== "execution_found" ||
    !executionResult?.execution
  ) {
    return {
      status: "investigation_result_failed",

      reason: executionResult?.reason || "terminal_execution_query_failed",

      investigation: publicInvestigation,

      result: null,
    };
  }

  const execution = executionResult.execution;

  /*
   * The latest execution must belong to the
   * requested investigation.
   */

  if (execution.investigationId !== normalizedInvestigationId) {
    return {
      status: "investigation_result_failed",

      reason: "execution_investigation_mismatch",

      investigation: publicInvestigation,

      result: null,
    };
  }

  /*
   * Parent and execution terminal states must agree.
   *
   * A mismatch is an internal consistency problem,
   * not something to reinterpret publicly.
   */

  if (execution.executionStatus !== investigation.lifecycleState) {
    return {
      status: "investigation_result_failed",

      reason: "terminal_state_mismatch",

      investigation: publicInvestigation,

      result: null,
    };
  }

  /*
   * ------------------------------------------------
   * Public-safe Methodology projection
   * ------------------------------------------------
   */

  const projection = projectPersistedOutcome(execution.analysisOutcome);

  if (projection.status !== "public_projection_ready") {
    return {
      status: "investigation_result_failed",

      reason: projection.reason,

      investigation: publicInvestigation,

      result: null,
    };
  }

  /*
   * Make sure the Methodology envelope agrees with
   * the authoritative durable lifecycle.
   */

  if (
    projection.result &&
    execution.executionStatus.toLowerCase() !==
      execution.analysisOutcome.executionStatus
  ) {
    return {
      status: "investigation_result_failed",

      reason: "methodology_execution_state_mismatch",

      investigation: publicInvestigation,

      result: null,
    };
  }

  /*
   * ------------------------------------------------
   * Public result ready
   * ------------------------------------------------
   */

  return {
    status: "investigation_result_ready",

    reason: null,

    investigation: publicInvestigation,

    result: projection.result,
  };
}
