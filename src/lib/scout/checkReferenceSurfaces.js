export function checkReferenceSurfaces(items, expectedSurfaces) {
  const paths = new Set(
    items.filter((item) => item.type === "blob").map((item) => item.path),
  );

  const found = expectedSurfaces.filter((path) => paths.has(path));

  const missing = expectedSurfaces.filter((path) => !paths.has(path));

  return {
    status:
      missing.length === 0 ? "reference_complete" : "reference_incomplete",

    found: found,
    missing: missing,
  };
}
