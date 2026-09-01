const CHECK_TYPES = {
  "What does this tool actually do?": "tool_behavior",

  "Your Key, Password & Sensitive Information": "sensitive_information",

  "Where Does It Connect?": "external_connections",

  "Does It Match the Official Technocore Reference?": "reference_compatibility",
};

export function buildCheck5MaterialFacts(priorChecks) {
  if (!Array.isArray(priorChecks)) {
    return {
      status: "material_facts_not_available",
      facts: [],
    };
  }

  const facts = [];

  for (const check of priorChecks) {
    if (!check?.title) {
      continue;
    }

    const type = CHECK_TYPES[check.title];

    if (!type) {
      continue;
    }

    /*
     * Check 5 preserves established findings.
     * It does not manufacture a new concern merely
     * because a check exists.
     */
    if (check.conclusion) {
      facts.push({
        type: type,
        sourceCheck: check.title,
        sourceStatus: check.status,
        kind: "finding",
        text: check.conclusion,
      });
    }

    if (check.limitation) {
      facts.push({
        type: type,
        sourceCheck: check.title,
        sourceStatus: check.status,
        kind: "limitation",
        text: check.limitation,
      });
    }

    if (type === "external_connections" && Array.isArray(check.destinations)) {
      for (const destination of check.destinations) {
        if (!destination?.host) {
          continue;
        }

        facts.push({
          type: type,
          sourceCheck: check.title,
          sourceStatus: check.status,
          kind: "destination",
          host: destination.host,
          technocore: Boolean(destination.technocore),
        });
      }
    }

    if (
      type === "reference_compatibility" &&
      Array.isArray(check.differences)
    ) {
      for (const difference of check.differences) {
        facts.push({
          type: type,
          sourceCheck: check.title,
          sourceStatus: check.status,
          kind: "difference",
          category: difference.category,
          reason: difference.reason,
        });
      }
    }
  }

  return {
    status: facts.length > 0 ? "material_facts_ready" : "material_facts_empty",

    factCount: facts.length,
    facts: facts,
  };
}
