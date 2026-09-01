import { buildCheck2Result } from "./buildCheck2Result.js";

const cautionExample = {
  status: "summary_ready",

  lifecycle: {
    sensitiveInput: true,
    sensitiveStorage: false,
    sensitiveTransmission: true,
    sensitiveExposure: true,
    sensitiveProcessUse: false,
  },

  categories: [],
};

console.log("CAUTION EXAMPLE:");

console.log(buildCheck2Result(cautionExample));

const passExample = {
  status: "summary_ready",

  lifecycle: {
    sensitiveInput: true,
    sensitiveStorage: false,
    sensitiveTransmission: false,
    sensitiveExposure: false,
    sensitiveProcessUse: false,
  },

  categories: [],
};

console.log("\nPASS EXAMPLE:");

console.log(buildCheck2Result(passExample));
