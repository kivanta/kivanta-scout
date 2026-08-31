import { getGitHubFile } from "./getGitHubFile.js";

const result = await getGitHubFile("psf", "requests", "pyproject.toml", "main");

console.log(result.status);
console.log(result.path);

if (result.status === "file_found") {
  console.log(result.content.slice(0, 1000));
}
