/**
 * Testable content-script bootstrap: fetch, tree build, DOM apply, toggle.
 */

function mapApiPullRequest(pr) {
  return {
    number: pr.number,
    title: pr.title,
    headRef: pr.head.ref,
    baseRef: pr.base.ref,
    author: pr.user?.login || '',
    draft: Boolean(pr.draft),
    htmlUrl: pr.html_url,
  };
}

async function fetchOpenPulls(owner, repo, fetchImpl = globalThis.fetch) {
  const url = `https://api.github.com/repos/${owner}/${repo}/pulls?state=open&per_page=100`;
  const res = await fetchImpl(url, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status}: ${res.statusText}`);
  }
  const data = await res.json();
  return data.map(mapApiPullRequest);
}

function createPrTreeApp(deps) {
  const {
    document,
    window,
    PRTree,
    PRTreeDOM,
    fetchImpl = globalThis.fetch,
  } = deps;

  const {
    parseRepoFromPathname,
    findPrListContainer,
    hideOriginalList,
    showOriginalList,
    renderPrTree,
    createToggleButton,
    mountToggleNearHeader,
  } = PRTreeDOM;

  const { buildPrTree } = PRTree;

  let cachedForest = null;
  let cachedPrs = null;
  let active = false;
  let toggleButton = null;

  function applyTreeView() {
    const container = findPrListContainer(document);
    if (!container || !cachedForest) return false;

    hideOriginalList(document);
    renderPrTree(document, container, cachedForest);
    active = true;
    return true;
  }

  function restoreOriginalView() {
    showOriginalList(document);
    active = false;
    return true;
  }

  async function bootstrap() {
    const repoInfo = parseRepoFromPathname(window.location.pathname);
    if (!repoInfo) return { ok: false, reason: 'not-pulls-page' };

    const container = findPrListContainer(document);
    if (!container) return { ok: false, reason: 'no-list-container' };

    try {
      cachedPrs = await fetchOpenPulls(repoInfo.owner, repoInfo.repo, fetchImpl);
      cachedForest = buildPrTree(cachedPrs);
    } catch (err) {
      return { ok: false, reason: 'fetch-failed', error: err };
    }

    if (cachedForest.length === 0 && cachedPrs.length === 0) {
      return { ok: false, reason: 'no-prs' };
    }

    if (!toggleButton) {
      toggleButton = createToggleButton(document, {
        onShowTree: applyTreeView,
        onShowOriginal: restoreOriginalView,
        initialMode: 'tree',
      });
      mountToggleNearHeader(document, toggleButton);
    }

    applyTreeView();
    return {
      ok: true,
      prCount: cachedPrs.length,
      rootCount: cachedForest.length,
      repo: repoInfo,
    };
  }

  return {
    bootstrap,
    applyTreeView,
    restoreOriginalView,
    getCachedForest: () => cachedForest,
    getCachedPrs: () => cachedPrs,
    isActive: () => active,
    getToggleButton: () => toggleButton,
  };
}

const bootstrapApi = { mapApiPullRequest, fetchOpenPulls, createPrTreeApp };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = bootstrapApi;
}
if (typeof globalThis !== 'undefined') {
  globalThis.PRTreeBootstrap = bootstrapApi;
}