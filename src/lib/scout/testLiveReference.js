import { referenceRegistry } from "./referenceRegistry.js";
import { checkLiveReference } from "./checkLiveReference.js";

const reference = referenceRegistry.technocore.liveReference;

const result = await checkLiveReference(reference.origin, reference.surfaces);

console.log(result);
