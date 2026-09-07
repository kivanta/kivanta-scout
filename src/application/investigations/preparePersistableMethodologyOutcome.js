/*
 * Prepare Persistable Methodology Outcome
 *
 * Trust boundary between:
 *
 *   Scout Methodology analysis
 *
 * and:
 *
 *   durable D1 persistence
 *
 *
 * RULE:
 *
 * Raw Methodology output must NEVER be written
 * directly to D1.
 *
 *
 * This module:
 *
 * 1. validates the Methodology result
 * 2. projects only explicitly allowlisted fields
 * 3. removes all source-code excerpts
 * 4. strips unsafe destination URL material
 * 5. omits the full sourceAssessment object
 * 6. verifies frozen execution provenance
 * 7. performs a second sensitive-data scan
 * 8. enforces a bounded serialized result size
 *
 *
 * It does NOT:
 *
 * - publish a public review
 * - canonicalize public review JSON
 * - create the final review fingerprint
 * - change Methodology findings
 * - manufacture UNKNOWN from operational failures
 */

/*
 * ------------------------------------------------
 * Constants
 * ------------------------------------------------
 */

const PERSISTABLE_SCHEMA = "scout-methodology-outcome-v1";

const MAX_PERSISTABLE_BYTES = 256 * 1024;

const ALLOWED_EXECUTION_STATUSES = new Set(["complete", "partial", "failed"]);

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

/*
 * Methodology 1.0 check identities.
 *
 * Because historical investigations are frozen to
 * Methodology 1.0, an unexpected check title should
 * fail closed instead of silently entering D1.
 */

const CHECK_1_TITLE = "What does this tool actually do?";

const CHECK_2_TITLE = "Your Key, Password & Sensitive Information";

const CHECK_3_TITLE = "Where Does It Connect?";

const CHECK_4_TITLE = "Does It Match the Official Technocore Reference?";

const CHECK_5_TITLE = "What Should I Know Before I Use It?";

/*
 * ------------------------------------------------
 * Basic helpers
 * ------------------------------------------------
 */

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function cleanString(value) {
  if (!isNonEmptyString(value)) {
    return null;
  }

  return value.trim();
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

function sameText(first, second) {
  return String(first ?? "").trim() === String(second ?? "").trim();
}

/*
 * ------------------------------------------------
 * Array helpers
 * ------------------------------------------------
 */

function stringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isNonEmptyString).map((item) => item.trim());
}

/*
 * ------------------------------------------------
 * URL sanitization
 * ------------------------------------------------
 */

/*
 * Arbitrary network destinations discovered inside
 * inspected source are reduced to their ORIGIN.
 *
 * Example:
 *
 * https://user:pass@example.com/api?token=123#x
 *
 * becomes:
 *
 * https://example.com
 *
 *
 * We intentionally do not persist:
 *
 * - username
 * - password
 * - path
 * - query parameters
 * - fragment
 *
 * Host/origin are sufficient for Check 3's purpose:
 *
 *   "Where does it connect?"
 */

function sanitizeObservedDestinationUrl(value) {
  if (!isNonEmptyString(value)) {
    return null;
  }

  try {
    const parsed = new URL(value);

    if (!["http:", "https:", "ws:", "wss:"].includes(parsed.protocol)) {
      return null;
    }

    return parsed.origin;
  } catch {
    return null;
  }
}

/*
 * Trusted canonical URLs are configuration values
 * from Scout's own frozen registry, not arbitrary
 * source-code values.
 *
 * We keep their path but still remove:
 *
 * - credentials
 * - query
 * - fragment
 */

function sanitizeTrustedUrl(value) {
  if (!isNonEmptyString(value)) {
    return null;
  }

  try {
    const parsed = new URL(value);

    if (!["http:", "https:"].includes(parsed.protocol)) {
      return null;
    }

    parsed.username = "";

    parsed.password = "";

    parsed.search = "";

    parsed.hash = "";

    return parsed.toString();
  } catch {
    return null;
  }
}

/*
 * ------------------------------------------------
 * Evidence references
 * ------------------------------------------------
 *
 * Source excerpts are intentionally NOT projected.
 *
 * We preserve only:
 *
 * - path
 * - line
 * - label
 * - sensitive boolean where applicable
 *
 * The frozen source can always be inspected again
 * using commit + path + line.
 */

function projectEvidenceReference(item, { includeSensitive = false } = {}) {
  if (!item || typeof item !== "object") {
    return null;
  }

  const projected = {};

  const path = cleanString(item.path);

  if (path) {
    projected.path = path;
  }

  if (Number.isInteger(item.line) && item.line > 0) {
    projected.line = item.line;
  }

  const label = cleanString(item.label);

  if (label) {
    projected.label = label;
  }

  if (includeSensitive && typeof item.sensitive === "boolean") {
    projected.sensitive = item.sensitive;
  }

  /*
   * We make the omission explicit.
   *
   * The original result may contain:
   *
   *   excerpt
   *
   * but it is NEVER copied.
   */
  projected.sourceExcerptPersisted = false;

  return projected;
}

/*
 * ------------------------------------------------
 * Check 1
 * ------------------------------------------------
 */

function projectCheck1Evidence(evidence) {
  if (!Array.isArray(evidence)) {
    return [];
  }

  return evidence
    .map((category) => {
      if (!category || typeof category !== "object") {
        return null;
      }

      const projected = {
        category: cleanString(category.category),

        labels: stringArray(category.labels),

        observationCount:
          Number.isInteger(category.observationCount) &&
          category.observationCount >= 0
            ? category.observationCount
            : 0,

        examples: [],
      };

      if (Array.isArray(category.examples)) {
        projected.examples = category.examples
          .map((example) => projectEvidenceReference(example))
          .filter(Boolean);
      }

      return projected;
    })
    .filter(Boolean);
}

function projectCheck1(check) {
  return {
    status: check.status,

    title: CHECK_1_TITLE,

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

function projectSensitiveLifecycle(lifecycle) {
  const source = lifecycle && typeof lifecycle === "object" ? lifecycle : {};

  return {
    sensitiveInput: Boolean(source.sensitiveInput),

    sensitiveStorage: Boolean(source.sensitiveStorage),

    sensitiveTransmission: Boolean(source.sensitiveTransmission),

    sensitiveExposure: Boolean(source.sensitiveExposure),

    sensitiveProcessUse: Boolean(source.sensitiveProcessUse),
  };
}

function projectCheck2Evidence(evidence) {
  if (!Array.isArray(evidence)) {
    return [];
  }

  return evidence
    .map((category) => {
      if (!category || typeof category !== "object") {
        return null;
      }

      const projected = {
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

        evidence: [],
      };

      if (Array.isArray(category.evidence)) {
        projected.evidence = category.evidence
          .map((item) =>
            projectEvidenceReference(item, {
              includeSensitive: true,
            }),
          )
          .filter(Boolean);
      }

      return projected;
    })
    .filter(Boolean);
}

function projectCheck2(check) {
  return {
    status: check.status,

    title: CHECK_2_TITLE,

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

function projectDestination(destination) {
  if (!destination || typeof destination !== "object") {
    return null;
  }

  const sanitizedUrl = sanitizeObservedDestinationUrl(destination.url);

  let host = null;

  if (sanitizedUrl) {
    try {
      host = new URL(sanitizedUrl).hostname;
    } catch {
      host = null;
    }
  }

  /*
   * Fallback for a future result shape containing
   * host but no URL.
   */
  if (!host && isNonEmptyString(destination.host)) {
    host = destination.host.trim().toLowerCase();
  }

  if (!host) {
    return null;
  }

  const evidence = Array.isArray(destination.evidence)
    ? destination.evidence
        .map((item) => projectEvidenceReference(item))
        .filter(Boolean)
    : [];

  return {
    /*
     * This is origin-only for arbitrary source
     * destinations.
     */
    url: sanitizedUrl,

    host,

    technocore: Boolean(destination.technocore),

    evidence,
  };
}

function projectDestinationArray(destinations) {
  if (!Array.isArray(destinations)) {
    return [];
  }

  return destinations.map(projectDestination).filter(Boolean);
}

function projectCheck3(check) {
  return {
    status: check.status,

    title: CHECK_3_TITLE,

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

function projectReferenceAuthority(authority) {
  if (!authority || typeof authority !== "object") {
    return null;
  }

  return {
    registryVersion: cleanString(authority.registryVersion),

    repositoryId: normalizeRepositoryId(authority.repositoryId),

    owner: cleanString(authority.owner),

    repo: cleanString(authority.repo),

    canonicalUrl: sanitizeTrustedUrl(authority.canonicalUrl),

    commitSha: normalizeGitObjectId(authority.commitSha),

    treeSha: normalizeGitObjectId(authority.treeSha),

    surfaces: stringArray(authority.surfaces),
  };
}

function projectComparisonDimension(dimension) {
  if (!dimension || typeof dimension !== "object") {
    return null;
  }

  return {
    category: cleanString(dimension.category),

    status: cleanString(dimension.status),

    reason: cleanString(dimension.reason),

    targetLabels: stringArray(dimension.targetLabels),

    referenceLabels: stringArray(dimension.referenceLabels),

    unmatchedTargetLabels: stringArray(dimension.unmatchedTargetLabels),
  };
}

function projectComparisonDimensions(dimensions) {
  if (!Array.isArray(dimensions)) {
    return [];
  }

  return dimensions.map(projectComparisonDimension).filter(Boolean);
}

function projectCheck4(check) {
  return {
    status: check.status,

    title: CHECK_4_TITLE,

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

function projectMaterialFact(fact) {
  if (!fact || typeof fact !== "object") {
    return null;
  }

  const projected = {
    type: cleanString(fact.type),

    sourceCheck: cleanString(fact.sourceCheck),

    sourceStatus: cleanString(fact.sourceStatus),

    kind: cleanString(fact.kind),
  };

  const text = cleanString(fact.text);

  if (text) {
    projected.text = text;
  }

  const host = cleanString(fact.host);

  if (host) {
    projected.host = host.toLowerCase();
  }

  if (typeof fact.technocore === "boolean") {
    projected.technocore = fact.technocore;
  }

  const category = cleanString(fact.category);

  if (category) {
    projected.category = category;
  }

  const reason = cleanString(fact.reason);

  if (reason) {
    projected.reason = reason;
  }

  return projected;
}

function projectMaterialFacts(facts) {
  if (!Array.isArray(facts)) {
    return [];
  }

  return facts.map(projectMaterialFact).filter(Boolean);
}

function projectCheck5(check) {
  return {
    status: check.status,

    title: CHECK_5_TITLE,

    conclusion: cleanString(check.conclusion),

    reason: cleanString(check.reason),

    limitation: cleanString(check.limitation),

    considerations: projectMaterialFacts(check.considerations),

    unresolved: projectMaterialFacts(check.unresolved),

    materialConcerns: projectMaterialFacts(check.materialConcerns),

    /*
     * Methodology 1.0 currently emits an empty
     * precautions array.
     *
     * Only strings are allowed through if this field
     * becomes populated later within the same shape.
     */
    precautions: stringArray(check.precautions),
  };
}

/*
 * ------------------------------------------------
 * Check projection dispatcher
 * ------------------------------------------------
 */

function projectCheck(check) {
  if (!check || typeof check !== "object") {
    return {
      status: "projection_failed",

      reason: "invalid_check_result",
    };
  }

  if (!ALLOWED_CHECK_STATUSES.has(check.status)) {
    return {
      status: "projection_failed",

      reason: "unrecognized_check_status",
    };
  }

  switch (check.title) {
    case CHECK_1_TITLE:
      return {
        status: "projection_ready",

        check: projectCheck1(check),
      };

    case CHECK_2_TITLE:
      return {
        status: "projection_ready",

        check: projectCheck2(check),
      };

    case CHECK_3_TITLE:
      return {
        status: "projection_ready",

        check: projectCheck3(check),
      };

    case CHECK_4_TITLE:
      return {
        status: "projection_ready",

        check: projectCheck4(check),
      };

    case CHECK_5_TITLE:
      return {
        status: "projection_ready",

        check: projectCheck5(check),
      };

    default:
      return {
        status: "projection_failed",

        reason: "unrecognized_methodology_check",
      };
  }
}

/*
 * ------------------------------------------------
 * Aggregation projection
 * ------------------------------------------------
 */

function projectAggregationReference(item) {
  if (isNonEmptyString(item)) {
    return item.trim();
  }

  if (!item || typeof item !== "object") {
    return null;
  }

  const projected = {};

  const checkId = cleanString(item.checkId);

  if (checkId) {
    projected.checkId = checkId;
  }

  const title = cleanString(item.title);

  if (title) {
    projected.title = title;
  }

  const status = cleanString(item.status);

  if (status) {
    projected.status = status;
  }

  const reason = cleanString(item.reason);

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

function projectAggregationCounts(counts) {
  if (!counts || typeof counts !== "object" || Array.isArray(counts)) {
    return null;
  }

  const projected = {};

  for (const [key, value] of Object.entries(counts)) {
    if (Number.isInteger(value) && value >= 0) {
      projected[key] = value;
    }
  }

  return projected;
}

function projectAggregation(aggregation) {
  if (!aggregation || typeof aggregation !== "object") {
    return null;
  }

  return {
    status: cleanString(aggregation.status),

    counts: projectAggregationCounts(aggregation.counts),

    unknownChecks: projectAggregationReferenceArray(aggregation.unknownChecks),

    cautionChecks: projectAggregationReferenceArray(aggregation.cautionChecks),

    notApplicableChecks: projectAggregationReferenceArray(
      aggregation.notApplicableChecks,
    ),

    partialChecks: projectAggregationReferenceArray(aggregation.partialChecks),

    failedChecks: projectAggregationReferenceArray(aggregation.failedChecks),

    notRunChecks: projectAggregationReferenceArray(aggregation.notRunChecks),
  };
}

/*
 * ------------------------------------------------
 * Frozen execution projection
 * ------------------------------------------------
 */

function projectFrozenExecution(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const methodology =
    value.methodology && typeof value.methodology === "object"
      ? {
          id: cleanString(value.methodology.id),

          version: cleanString(value.methodology.version),
        }
      : null;

  const source =
    value.source && typeof value.source === "object"
      ? {
          repositoryId: normalizeRepositoryId(value.source.repositoryId),

          owner: cleanString(value.source.owner),

          repo: cleanString(value.source.repo),

          commitSha: normalizeGitObjectId(value.source.commitSha),

          treeSha: normalizeGitObjectId(value.source.treeSha),
        }
      : null;

  const technocoreReference =
    value.technocoreReference && typeof value.technocoreReference === "object"
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
    typeof value.referenceRegistryDigest === "object"
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
 * Frozen provenance verification
 * ------------------------------------------------
 *
 * The Methodology outcome must describe the exact
 * same frozen target stored on the authoritative
 * investigation record.
 */

function verifyFrozenExecutionAgainstInvestigation(
  frozenExecution,
  investigation,
) {
  const target = investigation?.target;

  if (!target || typeof target !== "object") {
    return {
      status: "frozen_provenance_not_verified",

      reason: "investigation_frozen_target_required",
    };
  }

  if (!frozenExecution) {
    return {
      status: "frozen_provenance_not_verified",

      reason: "methodology_frozen_execution_required",
    };
  }

  /*
   * Methodology identity
   */

  if (
    !sameText(frozenExecution.methodology?.id, target.methodology?.id) ||
    !sameText(frozenExecution.methodology?.version, target.methodology?.version)
  ) {
    return {
      status: "frozen_provenance_not_verified",

      reason: "methodology_identity_mismatch",
    };
  }

  /*
   * Source identity
   */

  if (
    normalizeRepositoryId(frozenExecution.source?.repositoryId) !==
      normalizeRepositoryId(target.source?.repositoryId) ||
    !sameText(frozenExecution.source?.owner, target.source?.owner) ||
    !sameText(frozenExecution.source?.repo, target.source?.repo) ||
    normalizeGitObjectId(frozenExecution.source?.commitSha) !==
      normalizeGitObjectId(target.source?.commitSha) ||
    normalizeGitObjectId(frozenExecution.source?.treeSha) !==
      normalizeGitObjectId(target.source?.treeSha)
  ) {
    return {
      status: "frozen_provenance_not_verified",

      reason: "frozen_source_identity_mismatch",
    };
  }

  /*
   * Technocore reference identity
   */

  if (
    !sameText(
      frozenExecution.technocoreReference?.registryVersion,
      target.technocoreReference?.registryVersion,
    ) ||
    normalizeRepositoryId(frozenExecution.technocoreReference?.repositoryId) !==
      normalizeRepositoryId(target.technocoreReference?.repositoryId) ||
    normalizeGitObjectId(frozenExecution.technocoreReference?.commitSha) !==
      normalizeGitObjectId(target.technocoreReference?.commitSha) ||
    normalizeGitObjectId(frozenExecution.technocoreReference?.treeSha) !==
      normalizeGitObjectId(target.technocoreReference?.treeSha)
  ) {
    return {
      status: "frozen_provenance_not_verified",

      reason: "technocore_reference_identity_mismatch",
    };
  }

  /*
   * Complete registry digest
   */

  if (
    !sameText(
      frozenExecution.referenceRegistryDigest?.algorithm,
      target.referenceRegistryDigest?.algorithm,
    ) ||
    !sameText(
      frozenExecution.referenceRegistryDigest?.canonicalization,
      target.referenceRegistryDigest?.canonicalization,
    ) ||
    !sameText(
      frozenExecution.referenceRegistryDigest?.value,
      target.referenceRegistryDigest?.value,
    )
  ) {
    return {
      status: "frozen_provenance_not_verified",

      reason: "reference_registry_digest_mismatch",
    };
  }

  return {
    status: "frozen_provenance_verified",
  };
}

/*
 * ------------------------------------------------
 * Second sensitive-data scan
 * ------------------------------------------------
 *
 * This scan operates AFTER projection.
 *
 * It is defense-in-depth.
 *
 * Projection should already have removed all raw
 * source content and unsafe URL material.
 */

/*
 * Fields that must never exist in the persistable
 * structure.
 */

const FORBIDDEN_PERSISTED_KEYS = new Set([
  "excerpt",
  "content",
  "raw",
  "rawContent",
  "fileContent",
  "body",
]);

/*
 * High-confidence secret patterns.
 *
 * We deliberately avoid overly broad patterns that
 * would classify ordinary public Git hashes as
 * secrets.
 */

const HIGH_CONFIDENCE_SECRET_PATTERNS = [
  {
    reason: "private_key_material_detected",

    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/i,
  },

  {
    reason: "jwt_like_secret_detected",

    pattern:
      /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  },

  {
    reason: "aws_access_key_detected",

    pattern: /\bAKIA[0-9A-Z]{16}\b/,
  },

  {
    reason: "github_token_detected",

    pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
  },

  {
    reason: "github_pat_detected",

    pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  },

  {
    reason: "slack_token_detected",

    pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/,
  },

  {
    reason: "assigned_secret_value_detected",

    pattern:
      /\b(?:api[_-]?key|token|secret|password|passwd|private[_-]?key|credential)\b\s*[:=]\s*["']?[^\s"',;]{6,}/i,
  },
];

function inspectUrlForSensitiveParts(value) {
  if (!isNonEmptyString(value)) {
    return null;
  }

  if (!/^(?:https?|wss?):\/\//i.test(value.trim())) {
    return null;
  }

  try {
    const parsed = new URL(value.trim());

    if (parsed.username || parsed.password) {
      return {
        reason: "url_credentials_detected",
      };
    }

    if (parsed.search || parsed.hash) {
      return {
        reason: "unsafe_url_suffix_detected",
      };
    }

    return null;
  } catch {
    /*
     * Invalid text that merely resembles a URL is not
     * automatically treated as secret material.
     */
    return null;
  }
}

function findSensitivePersistedValue(value, path = "$") {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    for (const rule of HIGH_CONFIDENCE_SECRET_PATTERNS) {
      if (rule.pattern.test(value)) {
        return {
          reason: rule.reason,

          path,
        };
      }
    }

    const urlIssue = inspectUrlForSensitiveParts(value);

    if (urlIssue) {
      return {
        reason: urlIssue.reason,

        path,
      };
    }

    return null;
  }

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const issue = findSensitivePersistedValue(
        value[index],
        `${path}[${index}]`,
      );

      if (issue) {
        return issue;
      }
    }

    return null;
  }

  if (typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (FORBIDDEN_PERSISTED_KEYS.has(key)) {
        return {
          reason: "forbidden_persisted_field_detected",

          path: `${path}.${key}`,
        };
      }

      const issue = findSensitivePersistedValue(item, `${path}.${key}`);

      if (issue) {
        return issue;
      }
    }
  }

  return null;
}

/*
 * ------------------------------------------------
 * Serialized-size guard
 * ------------------------------------------------
 */

function measureJsonBytes(value) {
  const json = JSON.stringify(value);

  return new TextEncoder().encode(json).byteLength;
}

/*
 * ------------------------------------------------
 * Failed Methodology result
 * ------------------------------------------------
 *
 * runFrozenMethodology() deliberately returns a
 * structured operational failure rather than
 * throwing in many fail-closed cases.
 *
 * We persist only its safe high-level reason.
 *
 * We NEVER persist:
 *
 * - raw exception text
 * - sourceAssessment
 * - nested raw methodologyResult
 * - heartbeat internals
 */

function prepareFailedMethodologyOutcome(methodologyResult) {
  const reason =
    cleanString(methodologyResult.reason) || "methodology_execution_failed";

  const outcome = {
    schema: PERSISTABLE_SCHEMA,

    status: "frozen_methodology_not_run",

    executionStatus: "failed",

    resultStatus: null,

    reason,

    checks: [],
  };

  return {
    status: "persistable_outcome_ready",

    reason: null,

    outcome,

    failureReason: reason,
  };
}

/*
 * ------------------------------------------------
 * Main function
 * ------------------------------------------------
 */

export async function preparePersistableMethodologyOutcome({
  methodologyResult,

  investigation,

  investigationId,

  executionId,

  attempt,
} = {}) {
  /*
   * =================================================
   * Validate durable execution context
   * =================================================
   */

  if (!isNonEmptyString(investigationId)) {
    return {
      status: "persistable_outcome_failed",

      reason: "investigation_id_required",
    };
  }

  if (!isNonEmptyString(executionId)) {
    return {
      status: "persistable_outcome_failed",

      reason: "execution_id_required",
    };
  }

  if (!Number.isInteger(attempt) || attempt < 1) {
    return {
      status: "persistable_outcome_failed",

      reason: "valid_execution_attempt_required",
    };
  }

  if (!investigation || typeof investigation !== "object") {
    return {
      status: "persistable_outcome_failed",

      reason: "investigation_record_required",
    };
  }

  if (!methodologyResult || typeof methodologyResult !== "object") {
    return {
      status: "persistable_outcome_failed",

      reason: "methodology_result_required",
    };
  }

  /*
   * =================================================
   * Operational fail-closed result
   * =================================================
   *
   * This is NOT an UNKNOWN finding.
   *
   * It remains:
   *
   *   executionStatus = failed
   *   resultStatus    = null
   */

  if (methodologyResult.status === "frozen_methodology_not_run") {
    const failedResult = prepareFailedMethodologyOutcome(methodologyResult);

    const sensitiveIssue = findSensitivePersistedValue(failedResult.outcome);

    if (sensitiveIssue) {
      return {
        status: "persistable_outcome_failed",

        reason: "sensitive_data_scan_failed",

        sensitiveIssue,
      };
    }

    return failedResult;
  }

  /*
   * =================================================
   * Successful Methodology envelope required
   * =================================================
   */

  if (methodologyResult.status !== "methodology_run") {
    return {
      status: "persistable_outcome_failed",

      reason: "methodology_run_required",
    };
  }

  if (!ALLOWED_EXECUTION_STATUSES.has(methodologyResult.executionStatus)) {
    return {
      status: "persistable_outcome_failed",

      reason: "unrecognized_methodology_execution_status",
    };
  }

  if (
    methodologyResult.resultStatus !== null &&
    methodologyResult.resultStatus !== undefined &&
    !ALLOWED_RESULT_STATUSES.has(methodologyResult.resultStatus)
  ) {
    return {
      status: "persistable_outcome_failed",

      reason: "unrecognized_methodology_result_status",
    };
  }

  /*
   * Methodology 1.0 has exactly five checks.
   */

  if (
    !Array.isArray(methodologyResult.checks) ||
    methodologyResult.checks.length !== 5
  ) {
    return {
      status: "persistable_outcome_failed",

      reason: "methodology_1_0_checks_required",
    };
  }

  /*
   * =================================================
   * Project five Methodology checks
   * =================================================
   */

  const projectedChecks = [];

  const seenTitles = new Set();

  for (const check of methodologyResult.checks) {
    const projection = projectCheck(check);

    if (projection.status !== "projection_ready") {
      return {
        status: "persistable_outcome_failed",

        reason: projection.reason,
      };
    }

    const title = projection.check.title;

    /*
     * Prevent duplicated/missing check identities from
     * masquerading as Methodology 1.0.
     */

    if (seenTitles.has(title)) {
      return {
        status: "persistable_outcome_failed",

        reason: "duplicate_methodology_check",
      };
    }

    seenTitles.add(title);

    projectedChecks.push(projection.check);
  }

  const requiredTitles = [
    CHECK_1_TITLE,
    CHECK_2_TITLE,
    CHECK_3_TITLE,
    CHECK_4_TITLE,
    CHECK_5_TITLE,
  ];

  for (const title of requiredTitles) {
    if (!seenTitles.has(title)) {
      return {
        status: "persistable_outcome_failed",

        reason: "methodology_1_0_check_missing",
      };
    }
  }

  /*
   * =================================================
   * Project frozen provenance
   * =================================================
   */

  const frozenExecution = projectFrozenExecution(
    methodologyResult.frozenExecution,
  );

  if (!frozenExecution) {
    return {
      status: "persistable_outcome_failed",

      reason: "frozen_execution_provenance_required",
    };
  }

  /*
   * Verify that the returned Methodology result is
   * actually for the authoritative investigation's
   * frozen target.
   */

  const provenanceValidation = verifyFrozenExecutionAgainstInvestigation(
    frozenExecution,
    investigation,
  );

  if (provenanceValidation.status !== "frozen_provenance_verified") {
    return {
      status: "persistable_outcome_failed",

      reason: provenanceValidation.reason,
    };
  }

  /*
   * =================================================
   * Build allowlisted persistable outcome
   * =================================================
   *
   * NOTICE:
   *
   * methodologyResult.sourceAssessment is NOT copied.
   *
   * Any future arbitrary field added to the raw
   * Methodology result is also NOT copied.
   */

  const outcome = {
    schema: PERSISTABLE_SCHEMA,

    status: "methodology_run",

    executionStatus: methodologyResult.executionStatus,

    resultStatus: methodologyResult.resultStatus ?? null,

    checks: projectedChecks,

    aggregation: projectAggregation(methodologyResult.aggregation),

    frozenExecution,
  };

  /*
   * =================================================
   * Defense-in-depth sensitive-data scan
   * =================================================
   */

  const sensitiveIssue = findSensitivePersistedValue(outcome);

  if (sensitiveIssue) {
    return {
      status: "persistable_outcome_failed",

      reason: "sensitive_data_scan_failed",

      /*
       * Return only where/type of issue.
       *
       * Never return the sensitive value itself.
       */
      sensitiveIssue,
    };
  }

  /*
   * =================================================
   * Serialized-size guard
   * =================================================
   */

  let byteLength;

  try {
    byteLength = measureJsonBytes(outcome);
  } catch {
    return {
      status: "persistable_outcome_failed",

      reason: "persistable_outcome_serialization_failed",
    };
  }

  if (byteLength > MAX_PERSISTABLE_BYTES) {
    return {
      status: "persistable_outcome_failed",

      reason: "persistable_outcome_too_large",

      byteLength,

      maximumByteLength: MAX_PERSISTABLE_BYTES,
    };
  }

  /*
   * =================================================
   * Failure reason for durable execution row
   * =================================================
   *
   * Methodology findings remain separate from
   * operational execution state.
   */

  const failureReason =
    methodologyResult.executionStatus === "failed"
      ? cleanString(methodologyResult.reason) || "methodology_execution_failed"
      : null;

  /*
   * =================================================
   * Success
   * =================================================
   */

  return {
    status: "persistable_outcome_ready",

    reason: null,

    outcome,

    failureReason,

    byteLength,
  };
}
