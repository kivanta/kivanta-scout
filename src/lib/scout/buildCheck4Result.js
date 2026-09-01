export function buildCheck4Result(comparison, authority) {
  const title = "Does It Match the Official Technocore Reference?";

  if (comparison?.status !== "comparison_ready") {
    return {
      status: "UNKNOWN",
      title: title,
      conclusion:
        "Scout could not establish a sufficiently complete behavioral comparison with the authoritative Technocore reference.",
      reason: comparison?.reason || "comparison_not_available",
      evidence: [],
    };
  }

  const dimensions = comparison.dimensions || [];

  const cautionDimensions = dimensions.filter(
    (dimension) => dimension.status === "CAUTION",
  );

  const unknownDimensions = dimensions.filter(
    (dimension) => dimension.status === "UNKNOWN",
  );

  if (cautionDimensions.length > 0) {
    return {
      status: "CAUTION",
      title: title,

      conclusion:
        "Scout found a material behavioral difference between the inspected tool and the authoritative Technocore reference.",

      authority: authority,

      dimensions: dimensions,

      differences: cautionDimensions,

      limitation:
        "This comparison is behavioral and limited to the inspected source snapshot. It does not determine official status or endorsement.",
    };
  }

  if (unknownDimensions.length > 0) {
    return {
      status: "UNKNOWN",
      title: title,

      conclusion:
        "At least one materially important correspondence with the authoritative Technocore reference could not be established.",

      authority: authority,

      dimensions: dimensions,

      unresolved: unknownDimensions,

      limitation:
        "An unresolved comparison is not treated as either a match or a mismatch.",
    };
  }

  if (
    dimensions.length > 0 &&
    dimensions.every((dimension) => dimension.status === "PASS")
  ) {
    return {
      status: "PASS",
      title: title,

      conclusion:
        "Within the inspected scope, the established material behaviors are consistent with the authoritative Technocore reference.",

      authority: authority,

      dimensions: dimensions,

      limitation:
        "Matching the reference does not imply official status, endorsement, or identical implementation.",
    };
  }

  return {
    status: "UNKNOWN",
    title: title,
    conclusion:
      "Scout could not establish the overall behavioral correspondence with the authoritative Technocore reference.",
    authority: authority,
    dimensions: dimensions,
  };
}
