export function compareCheck4BehaviorProfiles(targetProfile, referenceProfile) {
  if (
    targetProfile?.status !== "behavior_profile_ready" ||
    referenceProfile?.status !== "behavior_profile_ready"
  ) {
    return {
      status: "comparison_not_available",
      reason: "behavior_profile_not_available",
      dimensions: [],
    };
  }

  const targetBehaviors = targetProfile.behaviors || {};

  const referenceBehaviors = referenceProfile.behaviors || {};

  const dimensions = [];

  for (const [category, target] of Object.entries(targetBehaviors)) {
    /*
     * We compare behavior that Scout actually observed
     * in the target.
     *
     * Absence of a target observation is NOT automatically
     * called N/A and is NOT automatically treated as a
     * mismatch.
     */
    if (!target?.observed) {
      continue;
    }

    const reference = referenceBehaviors[category];

    const targetLabels = target.labels || [];

    const referenceLabels = reference?.labels || [];

    if (!reference?.observed) {
      dimensions.push({
        category: category,
        status: "UNKNOWN",
        reason: "corresponding_reference_behavior_not_established",

        targetLabels: targetLabels,

        referenceLabels: referenceLabels,
      });

      continue;
    }

    if (targetLabels.length === 0 || referenceLabels.length === 0) {
      dimensions.push({
        category: category,
        status: "UNKNOWN",
        reason: "behavior_correspondence_not_established",

        targetLabels: targetLabels,

        referenceLabels: referenceLabels,
      });

      continue;
    }

    const referenceLabelSet = new Set(referenceLabels);

    const unmatchedTargetLabels = targetLabels.filter(
      (label) => !referenceLabelSet.has(label),
    );

    if (unmatchedTargetLabels.length > 0) {
      dimensions.push({
        category: category,
        status: "CAUTION",
        reason: "material_behavior_difference",

        targetLabels: targetLabels,

        referenceLabels: referenceLabels,

        unmatchedTargetLabels: unmatchedTargetLabels,
      });

      continue;
    }

    dimensions.push({
      category: category,
      status: "PASS",
      reason: "observed_behavior_consistent",

      targetLabels: targetLabels,

      referenceLabels: referenceLabels,
    });
  }

  if (dimensions.length === 0) {
    return {
      status: "comparison_not_available",
      reason: "no_material_target_behavior_established",
      dimensions: [],
    };
  }

  return {
    status: "comparison_ready",
    dimensionCount: dimensions.length,
    dimensions: dimensions,
  };
}
