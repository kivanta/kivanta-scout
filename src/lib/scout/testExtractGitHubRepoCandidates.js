import { extractGitHubRepoCandidates } from "./extractGitHubRepoCandidates.js";

const text = `
Official source:
https://github.com/kivanta/kivanta-scout

Documentation also links to:
https://github.com/kivanta/kivanta-scout/tree/main/src

Another project:
https://github.com/example/other-tool.git

Duplicate:
https://github.com/kivanta/kivanta-scout
`;

console.dir(extractGitHubRepoCandidates(text), {
  depth: null,
});
