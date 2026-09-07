/*
 * Run Frozen Methodology
 *
 * Production bridge between:
 *
 *   durable frozen investigation target
 *
 * and:
 *
 *   existing Scout Methodology 1.0 engine
 *
 *
 * Responsibilities:
 *
 * 1. verify the frozen Methodology identity
 * 2. verify the frozen Technocore reference snapshot
 * 3. verify the frozen reference-registry digest
 * 4. rebuild the source assessment from the exact
 *    frozen GitHub snapshot
 * 5. inject that frozen assessment into the existing
 *    runMethodology()
 *
 *
 * IMPORTANT:
 *
 * This file does NOT:
 *
 * - resolve the repository's moving default branch
 * - publish a review
 * - persist anything to D1
 * - convert operational failures into UNKNOWN
 */

import { runMethodology } from "../../lib/scout/runMethodology.js";

import { assessFrozenGitHubSource } from "../../lib/scout/assessFrozenGitHubSource.js";

import { methodologyIdentity } from "../../lib/scout/methodologyIdentity.js";

import { referenceRegistry } from "../../lib/scout/referenceRegistry.js";

import { createRegistryDigest } from "../../lib/scout/createRegistryDigest.js";

/*
 * ------------------------------------------------
 * Helpers
 * ------------------------------------------------
 */

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeRepositoryId(value) {
  if (value === null || value === undefined) {
    return null;
  }

  return String(value).trim();
}

function normalizeGitObjectId(value) {
  if (!isNonEmptyString(value)) {
    return null;
  }

  return value.trim().toLowerCase();
}

function valuesMatch(first, second) {
  return String(first ?? "").trim() === String(second ?? "").trim();
}

/*
 * ------------------------------------------------
 * Failure result
 * ------------------------------------------------
 *
 * Execution failures remain operational failures.
 *
 * We explicitly provide:
 *
 *   executionStatus: "failed"
 *
 * so the durable execution layer can persist FAILED
 * without manufacturing an UNKNOWN finding.
 */

function createFailureResult(reason, details = {}) {
  return {
    status: "frozen_methodology_not_run",

    executionStatus: "failed",

    resultStatus: null,

    reason,

    checks: [],

    ...details,
  };
}

/*
 * ------------------------------------------------
 * Heartbeat guard
 * ------------------------------------------------
 *
 * executePreparedInvestigation() supplies this
 * callback from the current D1 execution lease.
 */

async function renewExecutionLease(heartbeat) {
  if (typeof heartbeat !== "function") {
    return {
      status: "heartbeat_not_available",

      reason: "execution_heartbeat_required",
    };
  }

  let result;

  try {
    result = await heartbeat();
  } catch (error) {
    return {
      status: "heartbeat_not_available",

      reason: "execution_heartbeat_failed",

      error: error instanceof Error ? error.message : String(error),
    };
  }

  if (result?.status !== "execution_lease_renewed") {
    return {
      status: "heartbeat_not_available",

      reason: "execution_lease_not_renewed",

      heartbeatResult: result ?? null,
    };
  }

  return {
    status: "heartbeat_ready",

    result,
  };
}

/*
 * ------------------------------------------------
 * runFrozenMethodology
 * ------------------------------------------------
 *
 * This function's first argument deliberately
 * matches the object-style runner contract used by:
 *
 *   executePreparedInvestigation()
 *
 * That means it can later be injected directly as:
 *
 *   runMethodology: runFrozenMethodology
 */

export async function runFrozenMethodology(
  { target, heartbeat } = {},
  {
    methodologyRunner = runMethodology,

    frozenSourceAssessor = assessFrozenGitHubSource,

    currentMethodologyIdentity = methodologyIdentity,

    currentReferenceRegistry = referenceRegistry,

    registryDigestCreator = createRegistryDigest,
  } = {},
) {
  /*
   * =================================================
   * Validate basic target
   * =================================================
   */

  if (!target || typeof target !== "object") {
    return createFailureResult("frozen_target_required");
  }

  const source = target.source;

  if (!source || typeof source !== "object") {
    return createFailureResult("frozen_source_target_required");
  }

  if (
    !isNonEmptyString(source.owner) ||
    !isNonEmptyString(source.repo) ||
    !normalizeRepositoryId(source.repositoryId) ||
    !normalizeGitObjectId(source.commitSha) ||
    !normalizeGitObjectId(source.treeSha)
  ) {
    return createFailureResult("frozen_source_snapshot_not_available");
  }

  /*
   * =================================================
   * Step 1
   * Verify Methodology identity
   * =================================================
   *
   * Historical investigation frozen under 1.0
   * must never silently execute as 1.1.
   */

  const frozenMethodology = target.methodology;

  if (!frozenMethodology || typeof frozenMethodology !== "object") {
    return createFailureResult("frozen_methodology_identity_required");
  }

  if (
    !valuesMatch(frozenMethodology.id, currentMethodologyIdentity?.id) ||
    !valuesMatch(frozenMethodology.version, currentMethodologyIdentity?.version)
  ) {
    return createFailureResult(
      "frozen_methodology_identity_mismatch",

      {
        expectedMethodology: {
          id: frozenMethodology.id ?? null,

          version: frozenMethodology.version ?? null,
        },

        currentMethodology: {
          id: currentMethodologyIdentity?.id ?? null,

          version: currentMethodologyIdentity?.version ?? null,
        },
      },
    );
  }

  /*
   * =================================================
   * Step 2
   * Verify Technocore reference snapshot
   * =================================================
   */

  const frozenReference = target.technocoreReference;

  const currentTechnocore = currentReferenceRegistry?.technocore;

  const currentReferenceRepo = currentTechnocore?.sourceRepo;

  if (!frozenReference || typeof frozenReference !== "object") {
    return createFailureResult("frozen_reference_snapshot_required");
  }

  if (!currentTechnocore || !currentReferenceRepo) {
    return createFailureResult("current_reference_registry_not_available");
  }

  /*
   * Registry version
   */

  if (
    !valuesMatch(frozenReference.registryVersion, currentTechnocore.version)
  ) {
    return createFailureResult("frozen_reference_version_mismatch");
  }

  /*
   * Stable Technocore repository identity
   */

  if (
    normalizeRepositoryId(frozenReference.repositoryId) !==
    normalizeRepositoryId(currentReferenceRepo.repositoryId)
  ) {
    return createFailureResult("frozen_reference_repository_identity_mismatch");
  }

  /*
   * Human-readable repository coordinates.
   *
   * Stable repository ID is authoritative, but the
   * coordinates are also frozen provenance and should
   * match the registry used by this investigation.
   */

  if (
    !valuesMatch(frozenReference.owner, currentReferenceRepo.owner) ||
    !valuesMatch(frozenReference.repo, currentReferenceRepo.repo)
  ) {
    return createFailureResult("frozen_reference_coordinates_mismatch");
  }

  /*
   * Immutable Technocore reference commit.
   */

  if (
    normalizeGitObjectId(frozenReference.commitSha) !==
    normalizeGitObjectId(currentReferenceRepo.commitSha)
  ) {
    return createFailureResult("frozen_reference_commit_mismatch");
  }

  /*
   * Immutable Technocore reference tree.
   */

  if (
    normalizeGitObjectId(frozenReference.treeSha) !==
    normalizeGitObjectId(currentReferenceRepo.treeSha)
  ) {
    return createFailureResult("frozen_reference_tree_mismatch");
  }

  /*
   * Canonical URL is part of the frozen reference
   * provenance as well.
   */

  if (
    !valuesMatch(
      frozenReference.canonicalUrl,
      currentReferenceRepo.canonicalUrl,
    )
  ) {
    return createFailureResult("frozen_reference_canonical_url_mismatch");
  }

  /*
   * =================================================
   * Step 3
   * Verify complete reference-registry digest
   * =================================================
   *
   * Individual checks above provide precise failure
   * reasons.
   *
   * The digest additionally verifies the COMPLETE
   * registry, including:
   *
   * - repo surfaces
   * - live-reference origin
   * - live-reference paths
   * - every other registry field
   */

  const frozenDigest = target.referenceRegistryDigest;

  if (
    !frozenDigest ||
    typeof frozenDigest !== "object" ||
    !isNonEmptyString(frozenDigest.algorithm) ||
    !isNonEmptyString(frozenDigest.canonicalization) ||
    !isNonEmptyString(frozenDigest.value)
  ) {
    return createFailureResult("frozen_reference_registry_digest_required");
  }

  let currentDigest;

  try {
    currentDigest = await registryDigestCreator(currentReferenceRegistry);
  } catch (error) {
    return createFailureResult(
      "current_reference_registry_digest_not_available",

      {
        error: error instanceof Error ? error.message : String(error),
      },
    );
  }

  if (
    !currentDigest ||
    !isNonEmptyString(currentDigest.algorithm) ||
    !isNonEmptyString(currentDigest.canonicalization) ||
    !isNonEmptyString(currentDigest.value)
  ) {
    return createFailureResult(
      "current_reference_registry_digest_not_available",
    );
  }

  if (
    !valuesMatch(frozenDigest.algorithm, currentDigest.algorithm) ||
    !valuesMatch(
      frozenDigest.canonicalization,
      currentDigest.canonicalization,
    ) ||
    !valuesMatch(frozenDigest.value, currentDigest.value)
  ) {
    return createFailureResult(
      "frozen_reference_registry_digest_mismatch",

      {
        expectedDigest: {
          algorithm: frozenDigest.algorithm,

          canonicalization: frozenDigest.canonicalization,

          value: frozenDigest.value,
        },

        currentDigest: {
          algorithm: currentDigest.algorithm,

          canonicalization: currentDigest.canonicalization,

          value: currentDigest.value,
        },
      },
    );
  }

  /*
   * =================================================
   * Step 4
   * Renew lease before upstream source work
   * =================================================
   */

  const beforeAssessmentHeartbeat = await renewExecutionLease(heartbeat);

  if (beforeAssessmentHeartbeat.status !== "heartbeat_ready") {
    return createFailureResult(
      beforeAssessmentHeartbeat.reason,

      {
        heartbeat: beforeAssessmentHeartbeat,
      },
    );
  }

  /*
   * =================================================
   * Step 5
   * Rebuild source assessment from frozen snapshot
   * =================================================
   */

  let sourceAssessment;

  try {
    sourceAssessment = await frozenSourceAssessor(target);
  } catch (error) {
    return createFailureResult(
      "frozen_source_assessment_failed",

      {
        error: error instanceof Error ? error.message : String(error),
      },
    );
  }

  if (sourceAssessment?.status !== "supported_source") {
    return createFailureResult(
      sourceAssessment?.reason || "frozen_source_not_supported",

      {
        sourceAssessment: sourceAssessment ?? null,
      },
    );
  }

  /*
   * =================================================
   * Step 6
   * Renew lease before Methodology checks
   * =================================================
   */

  const beforeMethodologyHeartbeat = await renewExecutionLease(heartbeat);

  if (beforeMethodologyHeartbeat.status !== "heartbeat_ready") {
    return createFailureResult(
      beforeMethodologyHeartbeat.reason,

      {
        heartbeat: beforeMethodologyHeartbeat,
      },
    );
  }

  /*
   * =================================================
   * Step 7
   * Inject frozen assessment into existing engine
   * =================================================
   *
   * Existing runMethodology() normally calls:
   *
   *   assessGitHubSource(owner, repo)
   *
   * which resolves the current default branch.
   *
   * We replace that dependency with this closure.
   *
   * No production branch re-resolution occurs.
   */

  const frozenOwner = source.owner.trim();

  const frozenRepo = source.repo.trim();

  const frozenSourceAssessorForMethodology = async (owner, repo) => {
    /*
     * Fail closed if the Methodology runner somehow
     * asks for coordinates different from the frozen
     * target supplied here.
     */

    if (!valuesMatch(owner, frozenOwner) || !valuesMatch(repo, frozenRepo)) {
      return {
        status: "source_not_established",

        reason: "methodology_source_coordinates_mismatch",
      };
    }

    return sourceAssessment;
  };

  let methodologyResult;

  try {
    methodologyResult = await methodologyRunner(
      frozenOwner,
      frozenRepo,

      {
        sourceAssessor: frozenSourceAssessorForMethodology,
      },
    );
  } catch (error) {
    return createFailureResult(
      "methodology_execution_failed",

      {
        error: error instanceof Error ? error.message : String(error),
      },
    );
  }

  /*
   * =================================================
   * Step 8
   * Renew lease after Methodology
   * =================================================
   *
   * This gives the durable execution service fresh
   * ownership time before it prepares/redacts and
   * writes the final execution outcome.
   */

  const afterMethodologyHeartbeat = await renewExecutionLease(heartbeat);

  if (afterMethodologyHeartbeat.status !== "heartbeat_ready") {
    return createFailureResult(
      afterMethodologyHeartbeat.reason,

      {
        heartbeat: afterMethodologyHeartbeat,
      },
    );
  }

  /*
   * =================================================
   * Step 9
   * Validate existing Methodology result
   * =================================================
   */

  if (methodologyResult?.status !== "methodology_run") {
    return createFailureResult(
      methodologyResult?.reason || "methodology_not_run",

      {
        sourceAssessment,

        methodologyResult: methodologyResult ?? null,
      },
    );
  }

  if (
    !["complete", "partial", "failed"].includes(
      methodologyResult.executionStatus,
    )
  ) {
    return createFailureResult(
      "methodology_execution_status_unrecognized",

      {
        sourceAssessment,

        methodologyResult,
      },
    );
  }

  /*
   * =================================================
   * Success
   * =================================================
   *
   * Preserve the existing Methodology result shape.
   *
   * executePreparedInvestigation() can therefore
   * consume this result without translating the
   * domain findings.
   */

  return {
    ...methodologyResult,

    frozenExecution: {
      methodology: {
        id: frozenMethodology.id,

        version: frozenMethodology.version,
      },

      source: {
        repositoryId: normalizeRepositoryId(source.repositoryId),

        owner: frozenOwner,

        repo: frozenRepo,

        commitSha: normalizeGitObjectId(source.commitSha),

        treeSha: normalizeGitObjectId(source.treeSha),
      },

      technocoreReference: {
        registryVersion: frozenReference.registryVersion,

        repositoryId: normalizeRepositoryId(frozenReference.repositoryId),

        commitSha: normalizeGitObjectId(frozenReference.commitSha),

        treeSha: normalizeGitObjectId(frozenReference.treeSha),
      },

      referenceRegistryDigest: {
        algorithm: frozenDigest.algorithm,

        canonicalization: frozenDigest.canonicalization,

        value: frozenDigest.value,
      },
    },
  };
}
