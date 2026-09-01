import { aggregateMethodologyResult } from "./aggregateMethodologyResult.js";

function check(title, status) {
  return {
    title: title,
    status: status,
  };
}

const passOnly = [
  check("Check 1", "PASS"),
  check("Check 2", "PASS"),
  check("Check 3", "PASS"),
  check("Check 4", "PASS"),
  check("Check 5", "PASS"),
];

const withCaution = [
  check("Check 1", "PASS"),
  check("Check 2", "PASS"),
  check("Check 3", "CAUTION"),
  check("Check 4", "PASS"),
  check("Check 5", "CAUTION"),
];

const withUnknown = [
  check("Check 1", "PASS"),
  check("Check 2", "UNKNOWN"),
  check("Check 3", "PASS"),
  check("Check 4", "PASS"),
  check("Check 5", "PASS"),
];

const unknownAndCaution = [
  check("Check 1", "PASS"),
  check("Check 2", "UNKNOWN"),
  check("Check 3", "CAUTION"),
  check("Check 4", "PASS"),
  check("Check 5", "PASS"),
];

const withNA = [
  check("Check 1", "PASS"),
  check("Check 2", "N/A"),
  check("Check 3", "PASS"),
  check("Check 4", "PASS"),
  check("Check 5", "PASS"),
];

const withPartial = [
  check("Check 1", "PASS"),
  check("Check 2", "PARTIAL"),
  check("Check 3", "PASS"),
];

const withFailed = [
  check("Check 1", "PASS"),
  check("Check 2", "FAILED"),
  check("Check 3", "CAUTION"),
];

console.log("PASS ONLY:");
console.dir(aggregateMethodologyResult(passOnly), {
  depth: null,
});

console.log("\nCAUTION:");
console.dir(aggregateMethodologyResult(withCaution), {
  depth: null,
});

console.log("\nUNKNOWN:");
console.dir(aggregateMethodologyResult(withUnknown), {
  depth: null,
});

console.log("\nUNKNOWN + CAUTION:");
console.dir(aggregateMethodologyResult(unknownAndCaution), {
  depth: null,
});

console.log("\nN/A:");
console.dir(aggregateMethodologyResult(withNA), {
  depth: null,
});

console.log("\nPARTIAL:");
console.dir(aggregateMethodologyResult(withPartial), {
  depth: null,
});

console.log("\nFAILED:");
console.dir(aggregateMethodologyResult(withFailed), {
  depth: null,
});
