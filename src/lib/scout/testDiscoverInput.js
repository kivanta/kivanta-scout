import { discoverInput } from "./discoverInput.js";

console.log(await discoverInput("kivanta.eth"));

console.log(await discoverInput("did:key:z6Mk123456789"));

console.log(
  await discoverInput("https://technocore.chat/kv/did-be/91c469722bbfd3"),
);

console.log(await discoverInput("https://example.com"));

console.log(await discoverInput("https://github.com/withastro/astro"));

console.log(
  await discoverInput(
    "https://github.com/example-owner-that-should-not-exist/example-repo-that-should-not-exist",
  ),
);

console.log(await discoverInput(""));

console.log(await discoverInput("hello scout"));
