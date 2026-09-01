import { runDiscoveryPipeline } from "./runDiscoveryPipeline.js";

async function candidateCorrelator() {
  return {
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

    discovery: {
      inputType: "website_url",
    },
  };
}

async function ambiguousCorrelator() {
  return {
    status: "candidate_source_ambiguous",

    reason: "multiple_github_repositories_found",

    inputType: "website_url",

    candidates: [
      {
        owner: "example",
        repo: "tool-one",
      },

      {
        owner: "example",
        repo: "tool-two",
      },
    ],
  };
}

async function supportedEstablisher(correlation) {
  return {
    status: "supported_source",

    canonicalSource: {
      owner: correlation.candidate.owner,

      repo: correlation.candidate.repo,

      canonicalUrl: correlation.candidate.canonicalUrl,
    },

    evidence: correlation.evidence,

    sourceAssessment: {
      status: "supported_source",
    },
  };
}

async function rejectedEstablisher(correlation) {
  return {
    status: "source_not_established",

    reason: "tool_not_unambiguously_identified",

    candidate: correlation.candidate,
  };
}

console.log("SUPPORTED:");

console.dir(
  await runDiscoveryPipeline("https://example.com", {
    correlator: candidateCorrelator,

    sourceEstablisher: supportedEstablisher,
  }),
  {
    depth: null,
  },
);

console.log("\nREJECTED:");

console.dir(
  await runDiscoveryPipeline("https://example.com", {
    correlator: candidateCorrelator,

    sourceEstablisher: rejectedEstablisher,
  }),
  {
    depth: null,
  },
);

console.log("\nAMBIGUOUS:");

console.dir(
  await runDiscoveryPipeline("https://example.com", {
    correlator: ambiguousCorrelator,
  }),
  {
    depth: null,
  },
);
