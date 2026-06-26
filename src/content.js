/**
 * Content script entry: fetch PR branch data, build tree, manipulate DOM.
 */

(function initPrTreeContentScript() {
  const { buildPrTree } = globalThis.PRTree;
  const {
    parseRepoFromPathname,
    findPrListContainer,
    hideOriginalList,
    showOriginalList,
    renderPrTree,
    createToggleButton,
    mountToggleNearHeader,
  } = globalThis.PRTreeDOM;

  let cachedForest = null;
  let cachedPrs = null;
  let active = false;

  async function fetchOpenPulls(owner, repo) {
    const url = `https://api.github.com/repos/${owner}/${repo}/pulls?state=open&per_page=100`;
    const res = await fetch(url, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) {
      throw new Error(`GitHub API ${res.status}: ${res.statusText}`);
    }
    const data = await res.json();
    return data.map((pr) => ({
      number: pr.number,
      title: pr.title,
      headRef: pr.head.ref,
      baseRef: pr.base.ref,
      author: pr.user?.login || '',
      draft: Boolean(pr.draft),
      htmlUrl: pr.html_url,
    }));
  }

  function applyTreeView() {
    const container = findPrListContainer(document);
    if (!container || !cachedForest) return;

    hideOriginalList(document);
    renderPrTree(document, container, cachedForest);
    active = true;
  }

  function restoreOriginalView() {
    showOriginalList(document);
    active = false;
  }

  async function bootstrap() {
    const repoInfo = parseRepoFromPathname(window.location.pathname);
    if (!repoInfo) return;

    const container = findPrListContainer(document);
    if (!container) return;

    try {
      cachedPrs = await fetchOpenPulls(repoInfo.owner, repoInfo.repo);
      cachedForest = buildPrTree(cachedPrs);
    } catch (err) {
      console.warn('[PR Tree] Failed to load PR data:', err);
      return;
    }

    if (cachedForest.length === 0 && cachedPrs.length === 0) return;

    const toggle = createToggleButton(document, {
      onShowTree: applyTreeView,
      onShowOriginal: restoreOriginalView,
      initialMode: 'tree',
    });
    mountToggleNearHeader(document, toggle);
    applyTreeView();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }

  // Re-apply on GitHub SPA navigation (basic observer)
  let lastPath = window.location.pathname;
  const observer = new MutationObserver(() => {
    if (window.location.pathname !== lastPath) {
      lastPath = window.location.pathname;
      if (lastPath.includes('/pulls')) {
        cachedForest = null;
        cachedPrs = null;
        bootstrap();
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();