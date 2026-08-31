export async function checkLiveReference(origin, surfaces) {
  const results = await Promise.all(
    surfaces.map(async (path) => {
      const url = new URL(path, origin);

      try {
        const response = await fetch(url);

        return {
          path: path,
          status: response.ok ? "live_surface_found" : "live_surface_error",
          httpStatus: response.status,
        };
      } catch {
        return {
          path: path,
          status: "network_error",
        };
      }
    }),
  );

  const complete = results.every(
    (result) => result.status === "live_surface_found",
  );

  return {
    status: complete ? "live_reference_complete" : "live_reference_incomplete",
    results: results,
  };
}
