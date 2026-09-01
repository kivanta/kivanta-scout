export function summarizeCheck2Observations(result) {
  if (result.status !== "observations_found") {
    return {
      status: "summary_not_available",
      categories: [],
      lifecycle: {},
    };
  }

  const grouped = new Map();

  for (const observation of result.observations) {
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

  const categories = [...grouped.values()].map((group) => {
    return {
      category: group.category,
      count: group.count,
      sensitiveCount: group.sensitiveCount,
      labels: [...group.labels],
      evidence: group.evidence,
    };
  });

  const hasSensitive = (category) => {
    const group = grouped.get(category);

    return Boolean(group && group.sensitiveCount > 0);
  };

  return {
    status: "summary_ready",

    categoryCount: categories.length,

    lifecycle: {
      sensitiveInput: hasSensitive("input"),

      sensitiveStorage: hasSensitive("storage"),

      sensitiveTransmission: hasSensitive("transmission"),

      sensitiveExposure: hasSensitive("exposure"),

      sensitiveProcessUse: hasSensitive("process"),
    },

    categories: categories,
  };
}
