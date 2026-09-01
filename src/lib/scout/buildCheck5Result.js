function deduplicateFacts(facts) {
  const seen = new Set();

  return facts.filter((fact) => {
    const key = JSON.stringify({
      type: fact.type,
      sourceCheck: fact.sourceCheck,
      sourceStatus: fact.sourceStatus,
      kind: fact.kind,
      text: fact.text,
      host: fact.host,
      category: fact.category,
      reason: fact.reason,
    });

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export function buildCheck5Result(materialFacts) {
  const title = "What Should I Know Before I Use It?";

  if (materialFacts?.status !== "material_facts_ready") {
    return {
      status: "UNKNOWN",
      title: title,
      conclusion:
        "Scout could not establish enough material before-use information from the available evidence.",
      considerations: [],
      precautions: [],
    };
  }

  const facts = deduplicateFacts(materialFacts.facts || []);

  const unresolved = facts.filter((fact) => fact.sourceStatus === "UNKNOWN");

  const concerns = facts.filter((fact) => fact.sourceStatus === "CAUTION");

  if (unresolved.length > 0) {
    return {
      status: "UNKNOWN",
      title: title,

      conclusion:
        "At least one materially important fact needed for informed use remains unresolved.",

      considerations: facts,
      unresolved: unresolved,

      precautions: [],

      limitation:
        "UNKNOWN means the information could not be sufficiently established; it is not itself evidence of a problem.",
    };
  }

  if (concerns.length > 0) {
    return {
      status: "CAUTION",
      title: title,

      conclusion:
        "Scout established one or more material facts that a newcomer should understand and take into account before use.",

      considerations: facts,
      materialConcerns: concerns,

      precautions: [],

      limitation:
        "CAUTION identifies established facts requiring additional care. It is not an overall unsafe verdict.",
    };
  }

  return {
    status: "PASS",
    title: title,

    conclusion:
      "Within the inspected scope, Scout sufficiently evaluated the applicable before-use considerations and found no material unresolved consideration or observed material concern.",

    considerations: facts,

    precautions: [],

    limitation:
      "PASS is check-specific and does not certify the tool as safe, trustworthy, official, or risk-free.",
  };
}
