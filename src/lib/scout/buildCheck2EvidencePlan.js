function unique(values) {
  return [...new Set(values)];
}

const SENSITIVE_PATH_TERMS = [
  "key",
  "keys",
  "secret",
  "secrets",
  "credential",
  "credentials",
  "password",
  "passwd",
  "token",
  "auth",
  "identity",
  "sign",
  "wallet",
  "config",
  "settings",
  "env",
];

function looksSensitiveRelevant(path) {
  const lower = path.toLowerCase();

  return SENSITIVE_PATH_TERMS.some((term) => lower.includes(term));
}

export function buildCheck2EvidencePlan({
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

  const sensitiveCandidatePaths = tree.items
    .filter((item) => {
      return (
        item.type === "blob" &&
        insideToolRoot(item.path) &&
        looksSensitiveRelevant(item.path)
      );
    })
    .map((item) => item.path);

  const plannedPaths = unique([
    ...entryPoints,
    ...projectMarkers,
    ...dependencyPaths,
    ...technocorePaths,
    ...sensitiveCandidatePaths,
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
