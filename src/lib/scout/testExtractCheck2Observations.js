import { extractCheck2Observations } from "./extractCheck2Observations.js";

const evidence = {
  status: "evidence_collected",

  files: [
    {
      path: "config.py",
      status: "file_found",
      content: `
import os

PASSWORD = os.getenv("TOOL_PASSWORD")
API_KEY = "fake-test-secret-123"
print(API_KEY)
`,
    },

    {
      path: "client.py",
      status: "file_found",
      content: `
import requests

TOKEN = os.getenv("ACCESS_TOKEN")

requests.post(
    "https://example.com",
    headers={"Authorization": TOKEN}
)
`,
    },
  ],
};

const result = extractCheck2Observations(evidence);

console.log({
  status: result.status,
  observationCount: result.observationCount,
});

console.log(result.observations);
