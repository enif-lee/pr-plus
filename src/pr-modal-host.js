/**
 * Content-script host: intercept PR list clicks, mount React modal overlay.
 * Bundle + CSS are extension-local (no remote code).
 * Host updates reuse the same React root so Diff/search/scroll state survives refresh.
 */

(function initPrModalHost() {
  const HOST_ID = 'prp-modal-host';
  let reactRoot = null;
  let current = {
    open: false,
    loading: false,
    error: null,
    detail: null,
    owner: null,
    repo: null,
    number: null,
  };

  function ensureAssets() {
    if (!document.getElementById('prp-modal-css')) {
      const link = document.createElement('link');
      link.id = 'prp-modal-css';
      link.rel = 'stylesheet';
      link.href = chrome.runtime.getURL('src/modal/dist/pr-modal.css');
      (document.head || document.documentElement).appendChild(link);
    }
  }

  function ensureHost() {
    ensureAssets();
    let host = document.getElementById(HOST_ID);
    if (!host) {
      host = document.createElement('div');
      host.id = HOST_ID;
      document.documentElement.appendChild(host);
    }
    return host;
  }

  function buildProps() {
    const owner = current.owner;
    const repo = current.repo;
    const number = current.number;
    return {
      open: current.open,
      loading: current.loading,
      error: current.error,
      detail: current.detail,
      onClose: closeModal,
      onRefresh: async () => {
        if (!owner || !repo || !number) return;
        if (!globalThis.PRTreeFetch?.fetchPrDetail) return;
        try {
          const detail = await globalThis.PRTreeFetch.fetchPrDetail(
            owner,
            repo,
            number
          );
          if (
            current.open &&
            current.owner === owner &&
            current.repo === repo &&
            Number(current.number) === Number(number)
          ) {
            current.detail = detail;
            current.error = null;
            render();
          }
        } catch (err) {
          if (current.open) {
            current.error = err?.message || String(err);
            render();
          }
        }
      },
    };
  }

  function render() {
    if (typeof globalThis.mountPrModal !== 'function') {
      console.warn('[pr+] modal bundle not loaded (mountPrModal missing)');
      return;
    }
    const host = ensureHost();

    if (!current.open) {
      if (reactRoot) {
        try {
          reactRoot.unmount();
        } catch {
          /* ignore */
        }
        reactRoot = null;
        host.replaceChildren();
      }
      return;
    }

    const props = buildProps();
    if (reactRoot && typeof reactRoot.render === 'function') {
      // Reuse root — preserves Diff layout, scrollTop, and search UI state.
      reactRoot.render(props);
      return;
    }
    reactRoot = globalThis.mountPrModal(host, props);
  }

  function closeModal() {
    current = {
      open: false,
      loading: false,
      error: null,
      detail: null,
      owner: null,
      repo: null,
      number: null,
    };
    render();
  }

  async function openModal({ owner, repo, number }) {
    current = {
      open: true,
      loading: true,
      error: null,
      detail: null,
      owner,
      repo,
      number,
    };
    render();

    try {
      if (!globalThis.PRTreeFetch?.fetchPrDetail) {
        throw new Error('PR detail bridge unavailable');
      }
      const detail = await globalThis.PRTreeFetch.fetchPrDetail(
        owner,
        repo,
        number
      );
      if (
        current.open &&
        current.owner === owner &&
        current.repo === repo &&
        Number(current.number) === Number(number)
      ) {
        current.loading = false;
        current.detail = detail;
        current.error = null;
        render();
      }
    } catch (err) {
      if (current.open) {
        current.loading = false;
        current.error = err?.message || String(err);
        render();
      }
    }
  }

  function parsePrFromAnchor(anchor) {
    if (!anchor || !anchor.getAttribute) return null;
    const href = anchor.getAttribute('href') || '';
    const m = href.match(/\/?([^/]+)\/([^/]+)\/pull\/(\d+)(?:\/|$|\?|#)/);
    if (!m) return null;
    return { owner: m[1], repo: m[2], number: Number(m[3]) };
  }

  function isPullsListPage() {
    return /\/[^/]+\/[^/]+\/pulls/.test(location.pathname || '');
  }

  function onClickCapture(event) {
    if (!isPullsListPage()) return;
    if (event.defaultPrevented) return;
    if (event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const path =
      typeof event.composedPath === 'function' ? event.composedPath() : [];
    const nodes = path.length ? path : [event.target];
    let anchor = null;
    for (const n of nodes) {
      if (
        n &&
        n.tagName === 'A' &&
        n.getAttribute?.('href')?.includes('/pull/')
      ) {
        anchor = n;
        break;
      }
      if (n?.closest) {
        const a = n.closest('a[href*="/pull/"]');
        if (a) {
          anchor = a;
          break;
        }
      }
    }
    if (!anchor) return;

    const parsed = parsePrFromAnchor(anchor);
    if (!parsed) return;

    const inRow = anchor.closest(
      '.js-issue-row, [id^="issue_"], li[role="listitem"], .js-navigation-container'
    );
    const looksLikeTitle =
      anchor.classList.contains('js-navigation-open') ||
      anchor.classList.contains('markdown-title') ||
      Boolean(anchor.id?.endsWith('_link')) ||
      Boolean(inRow);

    if (!looksLikeTitle) return;

    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation();
    }
    void openModal(parsed);
  }

  function install() {
    document.addEventListener('click', onClickCapture, true);
  }

  globalThis.PRModalHost = {
    install,
    openModal,
    closeModal,
    parsePrFromAnchor,
    isPullsListPage,
    _getState: () => ({ ...current }),
  };

  install();
})();
