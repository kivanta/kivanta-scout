import { getGitHubTree } from "./getGitHubTree.js";
import { detectPythonSurfaces } from "./detectPythonSurfaces.js";

const tree = await getGitHubTree("psf", "requests", "main");

console.log("TREE STATUS:");
console.log(tree.status);

if (tree.status === "tree_found") {
  const python = detectPythonSurfaces(tree.items);

  console.log("PYTHON SURFACES:");
  console.log(python);
}
