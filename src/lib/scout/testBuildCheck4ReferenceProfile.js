import { buildCheck4ReferenceProfile } from "./buildCheck4ReferenceProfile.js";

const result = await buildCheck4ReferenceProfile();

console.log({
  status: result.status,
  authority: result.authority,

  behaviors: result.profile?.behaviors,
});
