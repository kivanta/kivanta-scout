export async function getGitHubFile(owner, repo, path, branch) {
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`;

  const response = await fetch(apiUrl);

  if (response.status === 404) {
    return {
      status: "file_not_found",
      path: path,
    };
  }

  if (!response.ok) {
    return {
      status: "github_error",
      httpStatus: response.status,
      path: path,
    };
  }

  const data = await response.json();

  if (data.type !== "file" || !data.content) {
    return {
      status: "not_a_file",
      path: path,
    };
  }

  const content = Buffer.from(data.content, "base64").toString("utf8");

  return {
    status: "file_found",
    path: data.path,
    content: content,
  };
}
