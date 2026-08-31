export async function getGitHubRepo(owner, repo) {
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}`;

  const response = await fetch(apiUrl);

  if (response.status === 404) {
  return {
    status: "repo_not_found"
  };
}

if (!response.ok) {
  return {
    status: "github_error",
    httpStatus: response.status
  };
}

const data = await response.json();

return {
  status: "repo_found",
  fullName: data.full_name,
  defaultBranch: data.default_branch,
  archived: data.archived,
};
}
