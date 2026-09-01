import { correlateEnsToGitHub } from "./correlateEnsToGitHub.js";

/*
 * DIRECT GITHUB REPOSITORY
 */

async function directRepoResolver() {
  return {
    status: "ens_records_found",

    name: "project.eth",

    records: {
      url: "https://github.com/example/ens-tool",

      githubHandle: "example",

      githubKey: "com.github",
    },

    evidence: [
      {
        type: "ens_text_record",

        name: "project.eth",

        key: "url",

        value: "https://github.com/example/ens-tool",
      },
    ],
  };
}

/*
 * ENS → PROJECT WEBSITE
 */

async function websiteResolver() {
  return {
    status: "ens_records_found",

    name: "project.eth",

    records: {
      url: "https://project.example",

      githubHandle: null,

      githubKey: null,
    },

    evidence: [
      {
        type: "ens_text_record",

        name: "project.eth",

        key: "url",

        value: "https://project.example",
      },
    ],
  };
}

async function fixtureWebsiteCorrelator() {
  return {
    status: "candidate_source",

    candidate: {
      owner: "example",

      repo: "website-tool",

      canonicalUrl: "https://github.com/example/website-tool",

      discoveryBasis: "first_party_website_link",
    },

    evidence: [
      {
        type: "first_party_website",

        url: "https://project.example",
      },
    ],
  };
}

/*
 * GITHUB HANDLE ONLY
 */

async function handleOnlyResolver() {
  return {
    status: "ens_records_found",

    name: "project.eth",

    records: {
      url: null,

      githubHandle: "example",

      githubKey: "com.github",
    },

    evidence: [
      {
        type: "ens_text_record",

        name: "project.eth",

        key: "com.github",

        value: "example",
      },
    ],
  };
}

console.log("DIRECT REPOSITORY:");

console.dir(
  await correlateEnsToGitHub("project.eth", {
    ensResolver: directRepoResolver,
  }),
  {
    depth: null,
  },
);

console.log("\nVIA WEBSITE:");

console.dir(
  await correlateEnsToGitHub("project.eth", {
    ensResolver: websiteResolver,

    websiteCorrelator: fixtureWebsiteCorrelator,
  }),
  {
    depth: null,
  },
);

console.log("\nHANDLE ONLY:");

console.dir(
  await correlateEnsToGitHub("project.eth", {
    ensResolver: handleOnlyResolver,
  }),
  {
    depth: null,
  },
);
