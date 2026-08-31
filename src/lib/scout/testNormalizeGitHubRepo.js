import { normalizeGitHubRepo } from "./normalizeGitHubRepo.js";

console.log(
  normalizeGitHubRepo("https://github.com/example-owner/example-repo"),
);

console.log(normalizeGitHubRepo("https://github.com/example-owner"));

console.log(
  normalizeGitHubRepo("https://example.com/example-owner/example-repo"),
);

console.log(
  normalizeGitHubRepo("https://github.com/example-owner/example-repo.git"),
);

console.log(
  normalizeGitHubRepo("https://github.com/example-owner/example-repo/"),
);

console.log(
  normalizeGitHubRepo(
    "https://github.com/example-owner/example-repo/tree/main",
  ),
);

console.log(normalizeGitHubRepo("not-a-valid-url"));