import { buildCheck3Result } from "./buildCheck3Result.js";

const passExample = {
  status: "summary_ready",

  mechanisms: ["http_client"],

  destinations: [
    {
      url: "https://technocore.chat/r/example",
      host: "technocore.chat",
      technocore: true,
      evidence: [],
    },
  ],

  unresolvedConfiguredDestination: false,
};

console.log("PASS EXAMPLE:");
console.log(buildCheck3Result(passExample));

const cautionExample = {
  status: "summary_ready",

  mechanisms: ["http_client"],

  destinations: [
    {
      url: "https://technocore.chat/r/example",
      host: "technocore.chat",
      technocore: true,
      evidence: [],
    },

    {
      url: "https://api.example.com/status",
      host: "api.example.com",
      technocore: false,
      evidence: [],
    },
  ],

  unresolvedConfiguredDestination: false,
};

console.log("\nCAUTION EXAMPLE:");
console.log(buildCheck3Result(cautionExample));

const unknownExample = {
  status: "summary_ready",

  mechanisms: ["http_client"],

  destinations: [],

  configurableEndpointObserved: true,

  unresolvedConfiguredDestination: true,
};

console.log("\nUNKNOWN EXAMPLE:");
console.log(buildCheck3Result(unknownExample));
