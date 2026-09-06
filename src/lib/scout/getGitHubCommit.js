/**
 * Resolve a GitHub ref to one exact commit.
 *
 * The ref may be:
 * - a branch
 * - a tag
 * - an existing commit SHA
 *
 * Scout uses this so an investigation can be
 * frozen to one exact repository snapshot.
 */
export async function getGitHubCommit(owner, repo, ref) {
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}`;

  const response = await fetch(apiUrl);

  if (response.status === 404) {
    return {
      status: "commit_not_found",
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
    status: "commit_found",

    // Exact immutable commit for this investigation.
    commitSha: data.sha,

    // Git tree belonging to that exact commit.
    treeSha: data.commit?.tree?.sha || null,
  };
}
