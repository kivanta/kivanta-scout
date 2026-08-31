const PROJECT_MARKERS = new Set(["pyproject.toml", "setup.py", "setup.cfg"]);

const IGNORED_DIRS = new Set([
  "tests",
  "test",
  "docs",
  "examples",
  "example",
  "bench",
  "benchmark",
]);

function directoryOf(path) {
  const parts = path.split("/");
  parts.pop();

  return parts.join("/") || ".";
}

function fileName(path) {
  return path.split("/").pop().toLowerCase();
}

function isWithinRoot(path, root) {
  return root === "." || path === root || path.startsWith(`${root}/`);
}

function relativeToRoot(path, root) {
  if (root === ".") {
    return path;
  }

  return path.slice(root.length + 1);
}

function isIgnored(path, root = ".") {
  const relative = relativeToRoot(path, root);
  const firstPart = relative.split("/")[0].toLowerCase();

  return IGNORED_DIRS.has(firstPart);
}

export function identifySingleTool(items, technocoreEvidence) {
  if (!technocoreEvidence?.established) {
    return {
      singleTool: false,
      reason: "technocore_evidence_not_established",
    };
  }

  const pythonFiles = items.filter((item) => {
    return (
      item.type === "blob" &&
      item.path.toLowerCase().endsWith(".py") &&
      !isIgnored(item.path)
    );
  });

  const projectMarkers = items.filter((item) => {
    return (
      item.type === "blob" &&
      PROJECT_MARKERS.has(fileName(item.path)) &&
      !isIgnored(item.path)
    );
  });

  const projectRoots = [
    ...new Set(projectMarkers.map((item) => directoryOf(item.path))),
  ];

  // Allow a very simple one-file Python tool.
  if (projectRoots.length === 0) {
    if (pythonFiles.length === 1) {
      const evidenceMatch = technocoreEvidence.matches?.some(
        (match) => match.path === pythonFiles[0].path,
      );

      if (evidenceMatch) {
        return {
          singleTool: true,
          identificationBasis: "single_python_file",
          projectRoot: ".",
          pythonFiles: [pythonFiles[0].path],
          entryPointCandidates: [pythonFiles[0].path],
        };
      }
    }

    return {
      singleTool: false,
      reason: "project_boundary_not_established",
    };
  }

  if (projectRoots.length > 1) {
    return {
      singleTool: false,
      reason: "multiple_python_project_roots",
      projectRoots: projectRoots,
    };
  }

  const projectRoot = projectRoots[0];

  const projectPythonFiles = pythonFiles.filter((item) => {
    return (
      isWithinRoot(item.path, projectRoot) && !isIgnored(item.path, projectRoot)
    );
  });

  const outsidePythonFiles = pythonFiles.filter((item) => {
    return !isWithinRoot(item.path, projectRoot);
  });

  if (projectRoot !== "." && outsidePythonFiles.length > 0) {
    return {
      singleTool: false,
      reason: "python_source_outside_project_root",
      projectRoot: projectRoot,
      outsidePythonFiles: outsidePythonFiles.map((item) => item.path),
    };
  }

  const technocoreMatches =
    technocoreEvidence.matches?.filter((match) => {
      return (
        isWithinRoot(match.path, projectRoot) &&
        !isIgnored(match.path, projectRoot)
      );
    }) || [];

  if (technocoreMatches.length === 0) {
    return {
      singleTool: false,
      reason: "technocore_evidence_outside_tool_root",
      projectRoot: projectRoot,
    };
  }

  const entryNames = new Set([
    "main.py",
    "__main__.py",
    "app.py",
    "server.py",
    "cli.py",
    "agent.py",
    "bot.py",
    "worker.py",
  ]);

  const entryPointCandidates = projectPythonFiles
    .filter((item) => entryNames.has(fileName(item.path)))
    .map((item) => item.path);

  return {
    singleTool: true,
    identificationBasis: "single_python_project",
    projectRoot: projectRoot,
    projectMarkers: projectMarkers.map((item) => item.path),
    pythonFileCount: projectPythonFiles.length,
    entryPointCandidates: entryPointCandidates,
  };
}
