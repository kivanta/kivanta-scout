export function detectPythonSurfaces(items) {
  const pythonFiles = items.filter(
    (item) => item.type === "blob" && item.path.toLowerCase().endsWith(".py"),
  );

  const dependencyFiles = items.filter((item) => {
    const name = item.path.split("/").pop().toLowerCase();

    return (
      name === "pyproject.toml" ||
      name === "setup.py" ||
      name === "setup.cfg" ||
      name === "pipfile" ||
      name === "poetry.lock" ||
      name.startsWith("requirements")
    );
  });

  return {
    hasPython: pythonFiles.length > 0,
    pythonFileCount: pythonFiles.length,
    pythonFiles: pythonFiles.map((item) => item.path),
    dependencyFiles: dependencyFiles.map((item) => item.path),
  };
}
