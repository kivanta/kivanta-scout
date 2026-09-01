import { getGitHubFile } from "./getGitHubFile.js";

export async function collectCheck2Evidence({
  owner,
  repo,
  branch,
  evidencePlan,
}) {
  if (evidencePlan.status !== "evidence_plan_ready") {
    return {
      status: "evidence_not_collected",
      reason: evidencePlan.reason || "evidence_plan_not_ready",
      files: [],
    };
  }

  const files = [];

  for (const path of evidencePlan.paths) {
    const result = await getGitHubFile(owner, repo, path, branch);

    if (result.status === "file_found") {
      files.push({
        path: result.path,
        status: "file_found",
        content: result.content,
      });

      continue;
    }

    files.push({
      path: path,
      status: result.status,
    });
  }

  const failedFiles = files.filter((file) => file.status !== "file_found");

  return {
    status:
      failedFiles.length === 0 ? "evidence_collected" : "evidence_partial",

    fileCount: files.length,
    files: files,
  };
}
