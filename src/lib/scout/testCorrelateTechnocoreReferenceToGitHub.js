import { correlateTechnocoreReferenceToGitHub } from "./correlateTechnocoreReferenceToGitHub.js";

async function directGitHubFetcher() {
  return {
    ok: true,
    status: 200,

    async text() {
      return `
Agent source:
https://github.com/example/reference-tool
`;
    },
  };
}

async function didFetcher() {
  return {
    ok: true,
    status: 200,

    async text() {
      return `
Agent identity:
did:key:z6MkExampleAgent123
`;
    },
  };
}

async function fixtureDidCorrelator() {
  return {
    status: "candidate_source",

    candidate: {
      owner: "example",
      repo: "did-reference-tool",

      canonicalUrl: "https://github.com/example/did-reference-tool",

      discoveryBasis: "technocore_did_note",
    },

    evidence: [
      {
        type: "technocore_did_note",
      },
    ],
  };
}

console.log("DIRECT GITHUB:");

console.dir(
  await correlateTechnocoreReferenceToGitHub(
    "https://technocore.chat/r/example",
    {
      fetcher: directGitHubFetcher,
    },
  ),
  {
    depth: null,
  },
);

console.log("\nVIA DID:");

console.dir(
  await correlateTechnocoreReferenceToGitHub(
    "https://technocore.chat/r/example",
    {
      fetcher: didFetcher,

      didCorrelator: fixtureDidCorrelator,
    },
  ),
  {
    depth: null,
  },
);
