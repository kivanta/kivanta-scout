export async function getGitHubRepo(owner, repo, request = globalThis.fetch) {
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}`;

  const response = await request(apiUrl);

  if (response.status === 404) {
    return {
      status: "repo_not_found",
    };
  }

  if (!response.ok) {
    return {
      status: "github_error",
      httpStatus: response.status,
    };
  }

  const data = await response.json();

  return {
    status: "repo_found",

    repositoryId: data.id,

    fullName: data.full_name,

    defaultBranch: data.default_branch,

    archived: data.archived,
  };
}
