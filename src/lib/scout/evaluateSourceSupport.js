export function evaluateSourceSupport({
  repo,
  tree,
  python,
  technocoreEvidence,
  toolIdentity,
}) {
  if (repo.status !== "repo_found") {
    return {
      status: "unsupported_source",
      reason: "repository_not_available",
    };
  }

  if (tree.status !== "tree_found") {
    return {
      status: "source_not_established",
      reason: "repository_tree_not_available",
    };
  }

  if (tree.truncated) {
    return {
      status: "source_not_established",
      reason: "repository_tree_truncated",
    };
  }

  if (!python.hasPython) {
    return {
      status: "unsupported_source",
      reason: "python_source_not_found",
    };
  }

  if (!technocoreEvidence?.established) {
    return {
      status: "source_not_established",
      reason: "technocore_evidence_not_established",
    };
  }

  if (!toolIdentity?.singleTool) {
    return {
      status: "source_not_established",
      reason: "tool_not_unambiguously_identified",
    };
  }

  return {
    status: "supported_source",
    reason: "v1_source_requirements_established",
  };
}
