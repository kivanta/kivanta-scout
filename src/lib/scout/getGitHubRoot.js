export async function getGitHubRoot(
  owner,
  repo,
  branch,
  request = globalThis.fetch,
) {
  const apiUrl =
    `https://api.github.com/repos/${owner}/${repo}/contents` +
    `?ref=${encodeURIComponent(branch)}`;

  const response = await request(apiUrl);

  if (response.status === 404) {
    return {
      status: "root_not_found",
    };
  }

  if (!response.ok) {
    return {
      status: "github_error",

      httpStatus: response.status,
    };
  }

  const data = await response.json();

  const items = data.map((item) => {
    return {
      name: item.name,

      path: item.path,

      type: item.type,
    };
  });

  return {
    status: "root_found",

    items,
  };
}
