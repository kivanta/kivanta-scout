export function classifyInput(input) {
  const value = input.trim();

  if (!value) {
    return {
      type: "empty",
      value: "",
    };
  }

  if (value.startsWith("did:key:")) {
    return {
      type: "technocore_did",
      value: value,
    };
  }

  if (value.endsWith(".eth")) {
    return {
      type: "ens_name",
      value: value,
    };
  }
    
    if (
      value === "https://technocore.chat" ||
      value.startsWith("https://technocore.chat/")
    ) {
      return {
        type: "technocore_reference",
        value: value,
      };
    }

  if (value.startsWith("https://github.com/")) {
    return {
      type: "github_repo",
      value: value,
    };
  }

  if (value.startsWith("https://") || value.startsWith("http://")) {
    return {
      type: "website_url",
      value: value,
    };
  }

  return {
    type: "unknown",
    value: value,
  };
}
