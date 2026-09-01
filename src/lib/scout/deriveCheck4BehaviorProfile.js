const MATERIAL_CATEGORIES = [
  "technocore",
  "identity",
  "signing",
  "configuration",
  "network",
  "filesystem",
  "process",
];

export function deriveCheck4BehaviorProfile(summary) {
  if (
    summary?.status !== "summary_ready" ||
    !Array.isArray(summary.categories)
  ) {
    return {
      status: "behavior_profile_not_available",
      behaviors: {},
    };
  }

  const categoryMap = new Map(
    summary.categories.map((category) => [category.category, category]),
  );

  const behaviors = {};

  for (const category of MATERIAL_CATEGORIES) {
    const value = categoryMap.get(category);

    behaviors[category] = {
      observed: Boolean(value && value.count > 0),

      count: value?.count || 0,

      labels: value?.labels || [],

      evidence: value?.evidence || [],
    };
  }

  return {
    status: "behavior_profile_ready",

    behaviors: behaviors,
  };
}
