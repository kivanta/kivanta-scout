function unique(values) {
  return [...new Set(values)];
}

const NETWORK_PATH_TERMS = [
  "client",
  "http",
  "https",
  "api",
  "rpc",
  "socket",
  "websocket",
  "network",
  "transport",
  "request",
  "connect",
  "endpoint",
  "server",
  "technocore",
  "config",
  "settings",
];

function looksNetworkRelevant(path) {
  const lower = path.toLowerCase();

  return NETWORK_PATH_TERMS.some((term) => lower.includes(term));
}

export function buildCheck3EvidencePlan({
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

  const dependencyPaths = python.dependencyFiles?.filter(insideToolRoot) || [];

  const technocorePaths =
    technocoreEvidence.matches
      ?.map((match) => match.path)
      .filter(insideToolRoot) || [];

  const networkCandidatePaths = tree.items
    .filter((item) => {
      return (
        item.type === "blob" &&
        insideToolRoot(item.path) &&
        looksNetworkRelevant(item.path)
      );
    })
    .map((item) => item.path);

  const plannedPaths = unique([
    ...entryPoints,
    ...projectMarkers,
    ...dependencyPaths,
    ...technocorePaths,
    ...networkCandidatePaths,
  ]);

  const existingPaths = new Set(
    tree.items.filter((item) => item.type === "blob").map((item) => item.path),
  );

  const paths = plannedPaths
    .filter((path) => existingPaths.has(path))
    .slice(0, 30);

  return {
    status: paths.length > 0 ? "evidence_plan_ready" : "evidence_plan_empty",

    projectRoot: projectRoot,
    paths: paths,
  };
}
