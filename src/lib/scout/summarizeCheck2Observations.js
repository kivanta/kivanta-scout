/*
 * =========================================================
 * KIVANTA SCOUT
 * CHECK 2 OBSERVATION SUMMARY
 * =========================================================
 *
 * PURPOSE
 *
 * Convert Check 2 observations into:
 *
 * - evidence categories
 * - sensitive-information lifecycle flags
 * - evidence completeness metadata
 *
 *
 * IMPORTANT
 *
 * "No observations found" is still a valid summary state
 * when the planned evidence scope was completely collected.
 *
 * That lets the result builder distinguish:
 *
 * complete scope + no sensitive handling
 *
 * from:
 *
 * partial scope + no sensitive handling observed yet.
 */

export function summarizeCheck2Observations(result) {
  const summarySupported =
    result?.status === "observations_found" ||
    result?.status === "no_observations_found";

  /*
   * -------------------------------------------------------
   * OBSERVATIONS NOT AVAILABLE
   * -------------------------------------------------------
   */

  if (!summarySupported) {
    return {
      status: "summary_not_available",

      evidenceStatus: result?.evidenceStatus ?? null,

      evidenceComplete: false,

      categories: [],

      lifecycle: {},
    };
  }

  /*
   * -------------------------------------------------------
   * GROUP OBSERVATIONS
   * -------------------------------------------------------
   */

  const grouped = new Map();

  const observations = Array.isArray(result.observations)
    ? result.observations
    : [];

  for (const observation of observations) {
    const key = observation.category;

    if (!grouped.has(key)) {
      grouped.set(key, {
        category: key,

        count: 0,

        sensitiveCount: 0,

        labels: new Set(),

        evidence: [],
      });
    }

    const group = grouped.get(key);

    group.count += 1;

    if (observation.sensitive) {
      group.sensitiveCount += 1;
    }

    group.labels.add(observation.label);

    if (group.evidence.length < 3) {
      group.evidence.push({
        path: observation.path,

        line: observation.line,

        label: observation.label,

        sensitive: observation.sensitive,

        excerpt: observation.excerpt,
      });
    }
  }

  /*
   * -------------------------------------------------------
   * PUBLIC CATEGORY SUMMARY
   * -------------------------------------------------------
   */

  const categories = [...grouped.values()].map((group) => {
    return {
      category: group.category,

      count: group.count,

      sensitiveCount: group.sensitiveCount,

      labels: [...group.labels],

      evidence: group.evidence,
    };
  });

  /*
   * -------------------------------------------------------
   * SENSITIVE LIFECYCLE
   * -------------------------------------------------------
   */

  const hasSensitive = (category) => {
    const group = grouped.get(category);

    return Boolean(group && group.sensitiveCount > 0);
  };

  /*
   * -------------------------------------------------------
   * RESULT
   * -------------------------------------------------------
   */

  return {
    status: "summary_ready",

    evidenceStatus: result.evidenceStatus ?? null,

    evidenceComplete: result.evidenceComplete === true,

    categoryCount: categories.length,

    lifecycle: {
      sensitiveInput: hasSensitive("input"),

      sensitiveStorage: hasSensitive("storage"),

      sensitiveTransmission: hasSensitive("transmission"),

      sensitiveExposure: hasSensitive("exposure"),

      sensitiveProcessUse: hasSensitive("process"),
    },

    categories,
  };
}
