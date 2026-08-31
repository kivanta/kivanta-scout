function unique(values) {
  return [...new Set(values)];
}

export function buildCheck1EvidencePlan({
  tree,
  python,
  technocoreEvidence,
  toolIdentity,
}) {
  if (!toolIdentity?.singleTool) {
    return {
      status: "evidence_plan_not_available",
      reason: "single_tool_not_established",
      paths: [],
    };
  }

  const projectRoot = toolIdentity.projectRoot;

  const insideToolRoot = (path) => {
    return (
      projectRoot === "." ||
      path === projectRoot ||
      path.startsWith(`${projectRoot}/`)
    );
  };

  const entryPoints = toolIdentity.entryPointCandidates || [];

  const projectMarkers = toolIdentity.projectMarkers || [];

  const technocorePaths =
    technocoreEvidence.matches
      ?.map((match) => match.path)
      .filter(insideToolRoot) || [];

  const dependencyPaths = python.dependencyFiles?.filter(insideToolRoot) || [];

  const plannedPaths = unique([
    ...entryPoints,
    ...projectMarkers,
    ...dependencyPaths,
    ...technocorePaths,
  ]);

  const existingPaths = new Set(
    tree.items.filter((item) => item.type === "blob").map((item) => item.path),
  );

  const paths = plannedPaths.filter((path) => existingPaths.has(path));

  return {
    status: paths.length > 0 ? "evidence_plan_ready" : "evidence_plan_empty",

    projectRoot: projectRoot,
    paths: paths,
  };
}
