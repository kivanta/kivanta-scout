import { collectCheck1Evidence } from "./collectCheck1Evidence.js";

const evidencePlan = {
  status: "evidence_plan_ready",
  paths: ["scripts/sign.py", "src/manifest.py"],
};

const result = await collectCheck1Evidence({
  owner: "flop-labs",
  repo: "technocore-chat",
  branch: "main",
  evidencePlan: evidencePlan,
});

console.log({
  status: result.status,
  fileCount: result.fileCount,
  files: result.files.map((file) => {
    return {
      path: file.path,
      status: file.status,
      contentLength: file.content?.length || 0,
    };
  }),
});
