import { extractDidKeyCandidates } from "./extractDidKeyCandidates.js";

const text = `
Agent:
did:key:z6MkExampleAgent123

Duplicate:
did:key:z6MkExampleAgent123

Another:
did:key:z6MkSecondAgent456
`;

console.log(extractDidKeyCandidates(text));
