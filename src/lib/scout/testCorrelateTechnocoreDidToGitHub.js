import { correlateTechnocoreDidToGitHub } from "./correlateTechnocoreDidToGitHub.js";

async function fixtureFetcher() {
  return {
    ok: true,
    status: 200,

    async text() {
      return `
name: Scout Example
source: https://github.com/example/scout-tool
`;
    },
  };
}

const result = await correlateTechnocoreDidToGitHub(
  "did:key:z6MkExampleScoutIdentity",
  {
    fetcher: fixtureFetcher,
  },
);

console.dir(result, {
  depth: null,
});
