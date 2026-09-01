export function buildCheck3Result(summary) {
  const title = "Where Does It Connect?";

  if (summary.status !== "summary_ready") {
    return {
      status: "UNKNOWN",
      title: title,
      conclusion:
        "Scout could not establish the tool's material external communication from the available source evidence.",
      evidence: [],
    };
  }

  const destinations = summary.destinations || [];

  const otherExternalDestinations = destinations.filter(
    (destination) => !destination.technocore,
  );

  if (summary.unresolvedConfiguredDestination) {
    return {
      status: "UNKNOWN",
      title: title,
      conclusion:
        "Scout found configurable network behavior, but at least one materially important destination cannot be established from the inspected source alone.",
      mechanisms: summary.mechanisms,
      destinations: destinations,
      evidence: destinations,
    };
  }

  if (otherExternalDestinations.length > 0) {
    return {
      status: "CAUTION",
      title: title,
      conclusion:
        "Source evidence shows communication with external destinations beyond the established Technocore destination.",
      mechanisms: summary.mechanisms,
      destinations: destinations,
      externalDestinations: otherExternalDestinations,
      limitation:
        "Scout identifies observed connection destinations from the inspected source. It does not audit the receiving services.",
    };
  }

  if (destinations.length > 0) {
    return {
      status: "PASS",
      title: title,
      conclusion:
        "Within the inspected source scope, Scout established the material observed network destinations and found no unresolved destination path.",
      mechanisms: summary.mechanisms,
      destinations: destinations,
      limitation:
        "This result is limited to the inspected source snapshot and does not prove that no other connection can ever occur.",
    };
  }

  return {
    status: "UNKNOWN",
    title: title,
    conclusion:
      "Scout did not find enough evidence to establish whether external network communication materially applies.",
    mechanisms: summary.mechanisms,
    destinations: [],
  };
}
