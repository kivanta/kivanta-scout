import { establishDiscoveredSource } from "./establishDiscoveredSource.js";

const correlation = {
  status: "candidate_source",

  candidate: {
    owner: "example",
    repo: "scout-tool",

    canonicalUrl: "https://github.com/example/scout-tool",

    discoveryBasis: "first_party_website_link",
  },

  evidence: [
    {
      type: "first_party_website",

      url: "https://example.com",
    },
  ],
};

async function supportedAssessor() {
  return {
    status: "supported_source",
    reason: "v1_source_requirements_established",

    repository: {
      fullName: "example/scout-tool",

      defaultBranch: "main",
    },

    python: {
      hasPython: true,
    },

    technocoreEvidence: {
      established: true,
    },

    toolIdentity: {
      singleTool: true,
    },
  };
}

async function rejectedAssessor() {
  return {
    status: "source_not_established",

    reason: "technocore_evidence_not_established",
  };
}

console.log("SUPPORTED:");

console.dir(
  await establishDiscoveredSource(correlation, {
    sourceAssessor: supportedAssessor,
  }),
  {
    depth: null,
  },
);

console.log("\nREJECTED:");

console.dir(
  await establishDiscoveredSource(correlation, {
    sourceAssessor: rejectedAssessor,
  }),
  {
    depth: null,
  },
);
