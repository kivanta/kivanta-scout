export function summarizeCheck1Observations(result) {
  if (result.status !== "observations_found") {
    return {
      status: "summary_not_available",
      categories: [],
    };
  }

  const grouped = new Map();

  for (const observation of result.observations) {
    const key = observation.category;

    if (!grouped.has(key)) {
      grouped.set(key, {
        category: key,
        count: 0,
        labels: new Set(),
        evidence: [],
      });
    }

    const group = grouped.get(key);

    group.count += 1;
    group.labels.add(observation.label);

    if (group.evidence.length < 3) {
      group.evidence.push({
        path: observation.path,
        line: observation.line,
        label: observation.label,
        excerpt: observation.excerpt,
      });
    }
  }

  const categories = [...grouped.values()].map((group) => {
    return {
      category: group.category,
      count: group.count,
      labels: [...group.labels],
      evidence: group.evidence,
    };
  });

  return {
    status: "summary_ready",
    categoryCount: categories.length,
    categories: categories,
  };
}
