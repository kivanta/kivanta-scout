import { extractCheck2Observations } from "./extractCheck2Observations.js";
import { summarizeCheck2Observations } from "./summarizeCheck2Observations.js";

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
import os
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

const observations = extractCheck2Observations(evidence);

const summary = summarizeCheck2Observations(observations);

console.log(summary);
