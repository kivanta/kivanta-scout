import { classifyInput } from "./classifyInput.js";
import { normalizeGitHubRepo } from "./normalizeGitHubRepo.js";
import { getGitHubRepo } from "./getGitHubRepo.js";

export async function discoverInput(input) {
  const classified = classifyInput(input);

  if (classified.type === "github_repo") {
    const repository = normalizeGitHubRepo(classified.value);

    if (!repository) {
      return {
        status: "unsupported_input",
        inputType: classified.type,
        value: classified.value,
      };
    }

    const githubResult = await getGitHubRepo(repository.owner, repository.repo);
    if (githubResult.status !== "repo_found") {
      return {
        status: githubResult.status,
        inputType: classified.type,
        value: classified.value,
        owner: repository.owner,
        repo: repository.repo,
        canonicalUrl: repository.canonicalUrl,
      };
    }
    return {
      status: githubResult.status,
      inputType: classified.type,
      value: classified.value,
      owner: repository.owner,
      repo: repository.repo,
      canonicalUrl: repository.canonicalUrl,
      fullName: githubResult.fullName,
      defaultBranch: githubResult.defaultBranch,
      archived: githubResult.archived,
    };
  }

  if (classified.type === "ens_name") {
    return {
      status: "discovery_required",
      inputType: classified.type,
      value: classified.value,
    };
  }

  if (classified.type === "technocore_did") {
    return {
      status: "discovery_required",
      inputType: classified.type,
      value: classified.value,
    };
  }

  if (classified.type === "technocore_reference") {
    return {
      status: "discovery_required",
      inputType: classified.type,
      value: classified.value,
    };
  }

  if (classified.type === "website_url") {
    return {
      status: "discovery_required",
      inputType: classified.type,
      value: classified.value,
    };
  }

  if (classified.type === "empty") {
    return {
      status: "input_required",
      inputType: classified.type,
      value: classified.value,
    };
  }

  if (classified.type === "unknown") {
    return {
      status: "unsupported_input",
      inputType: classified.type,
      value: classified.value,
    };
  }
}
