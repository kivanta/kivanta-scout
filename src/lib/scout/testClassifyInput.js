import { classifyInput } from "./classifyInput.js";

console.log(classifyInput(""));
console.log( classifyInput( "https://github.com/kivanta/example" ) );
console.log( classifyInput( "did:key:z6Mk123456789" ) );
console.log( classifyInput( "kivanta.eth" ) );
console.log(classifyInput("https://technocore.chat/kv/did-be/91c469722bbfd3"));
console.log(classifyInput("https://example.com"));
