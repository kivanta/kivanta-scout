/*
 * Resolve a GitHub ref to one exact commit.
 *
 * The ref may be:
 *
 * - branch
 * - tag
 * - existing commit SHA
 *
 * Production callers may inject a hardened
 * GitHub request function.
 */

export async function getGitHubCommit(
  owner,
  repo,
  ref,
  request = globalThis.fetch,
) {
  const apiUrl =
    `https://api.github.com/repos/${owner}/${repo}/commits/` +
    encodeURIComponent(ref);

  const response = await request(apiUrl);

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

    commitSha: data.sha,

    treeSha: data.commit?.tree?.sha || null,
  };
}
