export function buildCheck1Result(summary) {
  if (summary.status !== "summary_ready") {
    return {
      status: "UNKNOWN",
      title: "What does this tool actually do?",
      conclusion:
        "Scout could not establish the tool's primary behavior from the available source evidence.",
      evidence: [],
    };
  }

  const byCategory = new Map(
    summary.categories.map((category) => [category.category, category]),
  );

  const evidence = [];

  function addCategory(categoryName) {
    const category = byCategory.get(categoryName);

    if (!category) {
      return;
    }

    evidence.push({
      category: category.category,
      labels: category.labels,
      observationCount: category.count,
      examples: category.evidence,
    });
  }

  addCategory("entry_point");
  addCategory("technocore");
  addCategory("identity");
  addCategory("signing");
  addCategory("configuration");
  addCategory("network");
  addCategory("filesystem");
  addCategory("process");

  const hasTechnocore = byCategory.has("technocore");

  const hasIdentity = byCategory.has("identity");

  const hasSigning = byCategory.has("signing");

  if (hasTechnocore && hasIdentity && hasSigning) {
    return {
      status: "PASS",
      title: "What does this tool actually do?",
      conclusion:
        "Source evidence shows Technocore protocol behavior together with DID-based identity and cryptographic signing behavior.",
      evidence: evidence,
    };
  }

  return {
    status: "UNKNOWN",
    title: "What does this tool actually do?",
    conclusion:
      "Scout found source-level behavior, but the available evidence is not sufficient to establish the tool's primary Technocore behavior.",
    evidence: evidence,
  };
}
