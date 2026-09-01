import { extractCheck3Observations } from "./extractCheck3Observations.js";

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

const result = extractCheck3Observations(evidence);

console.log({
  status: result.status,
  observationCount: result.observationCount,
});

console.log(result.observations);
