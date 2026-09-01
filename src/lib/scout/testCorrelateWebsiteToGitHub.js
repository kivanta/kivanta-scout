import { correlateWebsiteToGitHub } from "./correlateWebsiteToGitHub.js";

async function oneRepoFetcher() {
  return {
    ok: true,
    status: 200,

    headers: {
      get() {
        return "text/html";
      },
    },

    async text() {
      return `
        <html>
          <body>
            <a href="https://github.com/example/scout-tool">
              Source
            </a>
          </body>
        </html>
      `;
    },
  };
}

async function multipleRepoFetcher() {
  return {
    ok: true,
    status: 200,

    headers: {
      get() {
        return "text/html";
      },
    },

    async text() {
      return `
        <a href="https://github.com/example/tool-one">
          Tool One
        </a>

        <a href="https://github.com/example/tool-two">
          Tool Two
        </a>
      `;
    },
  };
}

console.log("ONE REPO:");

console.dir(
  await correlateWebsiteToGitHub("https://example.com", {
    fetcher: oneRepoFetcher,
  }),
  {
    depth: null,
  },
);

console.log("\nMULTIPLE REPOS:");

console.dir(
  await correlateWebsiteToGitHub("https://example.com", {
    fetcher: multipleRepoFetcher,
  }),
  {
    depth: null,
  },
);
