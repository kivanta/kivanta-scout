const ASSESSMENT_STATUSES = new Set(["PASS", "CAUTION", "UNKNOWN", "N/A"]);

export function aggregateMethodologyResult(checks) {
  if (!Array.isArray(checks)) {
    return {
      status: "aggregation_not_available",
      reason: "checks_not_available",
    };
  }

  const failedChecks = checks.filter((check) => check?.status === "FAILED");

  const partialChecks = checks.filter((check) => check?.status === "PARTIAL");

  const notRunChecks = checks.filter((check) => check?.status === "NOT_RUN");

  /*
   * Execution state remains separate from
   * assessment state.
   */
  if (failedChecks.length > 0) {
    return {
      status: "aggregation_ready",
      executionStatus: "failed",
      resultStatus: null,

      failedChecks: failedChecks,

      checks: checks,
    };
  }

  if (partialChecks.length > 0) {
    return {
      status: "aggregation_ready",
      executionStatus: "partial",
      resultStatus: null,

      partialChecks: partialChecks,

      checks: checks,
    };
  }

  if (notRunChecks.length > 0) {
    return {
      status: "aggregation_ready",
      executionStatus: "not_run",
      resultStatus: null,

      notRunChecks: notRunChecks,

      checks: checks,
    };
  }

  const assessmentChecks = checks.filter((check) =>
    ASSESSMENT_STATUSES.has(check?.status),
  );

  const applicableChecks = assessmentChecks.filter(
    (check) => check.status !== "N/A",
  );

  const unknownChecks = applicableChecks.filter(
    (check) => check.status === "UNKNOWN",
  );

  const cautionChecks = applicableChecks.filter(
    (check) => check.status === "CAUTION",
  );

  const passChecks = applicableChecks.filter(
    (check) => check.status === "PASS",
  );

  const naChecks = assessmentChecks.filter((check) => check.status === "N/A");

  let resultStatus = "PASS";

  /*
   * Locked precedence:
   *
   * UNKNOWN
   *   ↓
   * CAUTION
   *   ↓
   * PASS
   *
   * N/A is neutral.
   */
  if (unknownChecks.length > 0) {
    resultStatus = "UNKNOWN";
  } else if (cautionChecks.length > 0) {
    resultStatus = "CAUTION";
  }

  return {
    status: "aggregation_ready",

    executionStatus: "complete",

    resultStatus: resultStatus,

    counts: {
      total: checks.length,
      applicable: applicableChecks.length,
      pass: passChecks.length,
      caution: cautionChecks.length,
      unknown: unknownChecks.length,
      notApplicable: naChecks.length,
    },

    unknownChecks: unknownChecks,

    cautionChecks: cautionChecks,

    passChecks: passChecks,

    notApplicableChecks: naChecks,

    checks: checks,
  };
}
