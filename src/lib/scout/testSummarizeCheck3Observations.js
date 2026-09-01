import { extractCheck3Observations } from "./extractCheck3Observations.js";
import { summarizeCheck3Observations } from "./summarizeCheck3Observations.js";

const evidence = {
  status: "evidence_collected",

  files: [
    {
      path: "client.py",
      status: "file_found",

      content: `
import os
import requests
import websockets

API_URL = os.getenv("API_URL")

requests.post(
    "https://technocore.chat/r/example"
)

requests.get(
    "https://api.example.com/status"
)

SOCKET_URL = "wss://stream.example.com/ws"
`,
    },
  ],
};

const observations = extractCheck3Observations(evidence);

const summary = summarizeCheck3Observations(observations);

console.log(summary);
