/*
 * Get GitHub File
 *
 * Fetch one file from a GitHub repository at an
 * exact branch or commit reference.
 *
 * Worker compatibility:
 *
 * GitHub's Contents API returns file content as
 * base64.
 *
 * Do NOT use Node's Buffer here because this module
 * runs inside the Cloudflare Worker execution path.
 *
 * Instead use:
 *
 *   atob()
 *      ↓
 *   Uint8Array
 *      ↓
 *   TextDecoder
 *
 * These are standard Web APIs available in modern
 * browsers, Node 24, and Cloudflare Workers.
 */

/*
 * ------------------------------------------------
 * Decode GitHub base64 content as UTF-8
 * ------------------------------------------------
 */

function decodeBase64Utf8(base64Content) {
  /*
   * GitHub may insert line breaks into base64
   * content.
   *
   * Remove ASCII whitespace before decoding.
   */
  const normalizedBase64 = base64Content.replace(/\s+/g, "");

  const binaryString = atob(normalizedBase64);

  const bytes = new Uint8Array(binaryString.length);

  for (let index = 0; index < binaryString.length; index += 1) {
    bytes[index] = binaryString.charCodeAt(index);
  }

  return new TextDecoder("utf-8").decode(bytes);
}

/*
 * ------------------------------------------------
 * getGitHubFile
 * ------------------------------------------------
 */

export async function getGitHubFile(owner, repo, path, branch) {
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(
    branch,
  )}`;

  const response = await fetch(apiUrl);

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
