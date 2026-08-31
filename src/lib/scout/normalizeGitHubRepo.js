export function normalizeGitHubRepo(url) {
    
    let parsedUrl;

    try {
      parsedUrl = new URL(url);
    } catch {
      return null;
    }
   
    if ( parsedUrl.hostname !== "github.com" ) {
      return null;
    }

    const parts = parsedUrl.pathname.split( "/" ).filter( Boolean );
    
if (parts.length < 2) {
  return null;
}


const owner = parts[0];
const repo = parts[1].replace(/\.git$/, "");
const canonicalUrl = `https://github.com/${owner}/${repo}`;

    return {
  owner: owner,
        repo: repo,
        canonicalUrl: canonicalUrl,
};
}
