function hostFromUrl(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

export function summarizeCheck3Observations(result) {
  if (result.status !== "observations_found") {
    return {
      status: "summary_not_available",
      mechanisms: [],
      destinations: [],
      configurableEndpointObserved: false,
      unresolvedConfiguredDestination: false,
    };
  }

  const mechanisms = new Set();
  const destinationMap = new Map();

  let configurableEndpointObserved = false;

  for (const observation of result.observations) {
    if (
      observation.category === "http" ||
      observation.category === "websocket" ||
      observation.category === "socket" ||
      observation.category === "rpc" ||
      observation.category === "process"
    ) {
      mechanisms.add(observation.label);
    }

    if (
      observation.category === "configuration" &&
      observation.label === "environment_endpoint"
    ) {
      configurableEndpointObserved = true;
    }

    for (const destination of observation.destinations || []) {
      const host = hostFromUrl(destination);

      if (!host) {
        continue;
      }

      const key = destination;

      if (!destinationMap.has(key)) {
        destinationMap.set(key, {
          url: destination,
          host: host,
          technocore:
            host === "technocore.chat" || host.endsWith(".technocore.chat"),
          evidence: [],
        });
      }

      const item = destinationMap.get(key);

      if (item.evidence.length < 3) {
        item.evidence.push({
          path: observation.path,
          line: observation.line,
          label: observation.label,
        });
      }
    }
  }

  const destinations = [...destinationMap.values()];

  return {
    status: "summary_ready",

    mechanisms: [...mechanisms],

    destinationCount: destinations.length,

    destinations: destinations,

    configurableEndpointObserved: configurableEndpointObserved,

    unresolvedConfiguredDestination: configurableEndpointObserved,
  };
}
