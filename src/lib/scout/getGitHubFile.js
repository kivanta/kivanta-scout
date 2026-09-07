/*
 * Get GitHub File
 *
 * Fetch one file from a GitHub repository at an
 * exact branch or commit reference.
 *
 * Production callers may inject Scout's hardened
 * GitHub request boundary.
 *
 * GitHub's Contents API returns file content as
 * base64.
 *
 * Do NOT use Node Buffer because this module runs
 * in the Cloudflare Worker execution path.
 */

function decodeBase64Utf8(base64Content) {
  const normalizedBase64 = base64Content.replace(/\s+/g, "");

  const binaryString = atob(normalizedBase64);

  const bytes = new Uint8Array(binaryString.length);

  for (let index = 0; index < binaryString.length; index += 1) {
    bytes[index] = binaryString.charCodeAt(index);
  }

  return new TextDecoder("utf-8").decode(bytes);
}

export async function getGitHubFile(
  owner,
  repo,
  path,
  branch,
  request = globalThis.fetch,
) {
  const apiUrl =
    `https://api.github.com/repos/${owner}/${repo}/contents/${path}` +
    `?ref=${encodeURIComponent(branch)}`;

  const response = await request(apiUrl);

  if (response.status === 404) {
    return {
      status: "file_not_found",

      path,
    };
  }

  if (!response.ok) {
    return {
      status: "github_error",

      httpStatus: response.status,

      path,
    };
  }

  const data = await response.json();

  if (data.type !== "file" || !data.content) {
    return {
      status: "not_a_file",

      path,
    };
  }

  const content = decodeBase64Utf8(data.content);

  return {
    status: "file_found",

    path: data.path,

    content,
  };
}
