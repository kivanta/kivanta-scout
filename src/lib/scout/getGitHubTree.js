export async function getGitHubTree(
  owner,
  repo,
  branch,
  request = globalThis.fetch,
) {
  const apiUrl =
    `https://api.github.com/repos/${owner}/${repo}/git/trees/` +
    `${encodeURIComponent(branch)}?recursive=1`;

  const response = await request(apiUrl);

  if (response.status === 404) {
    return {
      status: "tree_not_found",
    };
  }

  if (!response.ok) {
    return {
      status: "github_error",

      httpStatus: response.status,
    };
  }

  const data = await response.json();

  const items = data.tree.map((item) => {
    return {
      path: item.path,

      type: item.type,
    };
  });

  return {
    status: "tree_found",

    truncated: data.truncated,

    items,
  };
}
