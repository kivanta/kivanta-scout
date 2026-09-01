import { correlateDiscovery } from "./correlateDiscovery.js";

/*
 * DIRECT GITHUB
 */

async function githubInputDiscoverer() {
  return {
    status: "repo_found",

    inputType: "github_repo",

    owner: "example",

    repo: "scout-tool",

    canonicalUrl: "https://github.com/example/scout-tool",

    fullName: "example/scout-tool",

    defaultBranch: "main",

    archived: false,
  };
}

/*
 * WEBSITE
 */

async function websiteInputDiscoverer() {
  return {
    status: "discovery_required",

    inputType: "website_url",

    value: "https://example.com",
  };
}

async function websiteCorrelator() {
  return {
    status: "candidate_source",

    candidate: {
      owner: "example",

      repo: "website-tool",

      canonicalUrl: "https://github.com/example/website-tool",

      discoveryBasis: "first_party_website_link",
    },

    candidates: [],

    evidence: [
      {
        type: "first_party_website",

        url: "https://example.com",
      },
    ],
  };
}

/*
 * RAW DID
 */

async function didInputDiscoverer() {
  return {
    status: "discovery_required",

    inputType: "technocore_did",

    value: "did:key:z6MkExampleScoutIdentity",
  };
}

async function didCorrelator() {
  return {
    status: "candidate_source",

    candidate: {
      owner: "example",

      repo: "did-tool",

      canonicalUrl: "https://github.com/example/did-tool",

      discoveryBasis: "technocore_did_note",
    },

    candidates: [],

    evidence: [
      {
        type: "technocore_did_note",
      },
    ],
  };
}

/*
 * TECHNOCORE REFERENCE
 */

async function technocoreInputDiscoverer() {
  return {
    status: "discovery_required",

    inputType: "technocore_reference",

    value: "https://technocore.chat/r/example",
  };
}

async function technocoreReferenceCorrelator() {
  return {
    status: "candidate_source",

    candidate: {
      owner: "example",

      repo: "reference-tool",

      canonicalUrl: "https://github.com/example/reference-tool",

      discoveryBasis: "technocore_reference_link",
    },

    candidates: [],

    evidence: [
      {
        type: "technocore_public_reference",
      },
    ],
  };
}

/*
 * ENS
 */

async function ensInputDiscoverer() {
  return {
    status: "discovery_required",

    inputType: "ens_name",

    value: "project.eth",
  };
}

async function ensCorrelator() {
  return {
    status: "candidate_source",

    candidate: {
      owner: "example",

      repo: "ens-tool",

      canonicalUrl: "https://github.com/example/ens-tool",

      discoveryBasis: "ens_url_github_repository",
    },

    candidates: [],

    evidence: [
      {
        type: "ens_text_record",

        key: "url",
      },
    ],
  };
}

/*
 * RUN TESTS
 */

console.log("DIRECT GITHUB:");

console.dir(
  await correlateDiscovery("https://github.com/example/scout-tool", {
    inputDiscoverer: githubInputDiscoverer,
  }),
  {
    depth: null,
  },
);

console.log("\nWEBSITE:");

console.dir(
  await correlateDiscovery("https://example.com", {
    inputDiscoverer: websiteInputDiscoverer,

    websiteCorrelator: websiteCorrelator,
  }),
  {
    depth: null,
  },
);

console.log("\nRAW DID:");

console.dir(
  await correlateDiscovery("did:key:z6MkExampleScoutIdentity", {
    inputDiscoverer: didInputDiscoverer,

    didCorrelator: didCorrelator,
  }),
  {
    depth: null,
  },
);

console.log("\nTECHNOCORE REFERENCE:");

console.dir(
  await correlateDiscovery("https://technocore.chat/r/example", {
    inputDiscoverer: technocoreInputDiscoverer,

    technocoreReferenceCorrelator: technocoreReferenceCorrelator,
  }),
  {
    depth: null,
  },
);

console.log("\nENS:");

console.dir(
  await correlateDiscovery("project.eth", {
    inputDiscoverer: ensInputDiscoverer,

    ensCorrelator: ensCorrelator,
  }),
  {
    depth: null,
  },
);
