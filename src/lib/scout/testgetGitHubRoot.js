import { getGitHubRoot } from "./getGitHubRoot.js";

const result = await getGitHubRoot("withastro", "astro", "main");

console.log(result);
