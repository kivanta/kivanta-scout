import { compareCheck4BehaviorProfiles } from "./compareCheck4BehaviorProfiles.js";

const referenceProfile = {
  status: "behavior_profile_ready",

  behaviors: {
    technocore: {
      observed: true,
      labels: ["technocore_host", "room_endpoint", "kv_endpoint"],
    },

    identity: {
      observed: true,
      labels: ["did_key"],
    },

    signing: {
      observed: true,
      labels: ["ed25519"],
    },

    configuration: {
      observed: true,
      labels: ["environment_variable"],
    },
  },
};

const matchingTarget = {
  status: "behavior_profile_ready",

  behaviors: {
    technocore: {
      observed: true,
      labels: ["technocore_host", "room_endpoint"],
    },

    identity: {
      observed: true,
      labels: ["did_key"],
    },

    signing: {
      observed: true,
      labels: ["ed25519"],
    },
  },
};

const differentTarget = {
  status: "behavior_profile_ready",

  behaviors: {
    technocore: {
      observed: true,
      labels: ["technocore_host", "room_endpoint"],
    },

    identity: {
      observed: true,
      labels: ["did_key"],
    },

    signing: {
      observed: true,
      labels: ["rsa_signing"],
    },
  },
};

console.log("MATCHING:");
console.dir(compareCheck4BehaviorProfiles(matchingTarget, referenceProfile), {
  depth: null,
});

console.log("\nDIFFERENT:");
console.dir(compareCheck4BehaviorProfiles(differentTarget, referenceProfile), {
  depth: null,
});
