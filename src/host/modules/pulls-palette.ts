// TypeScript SoT — assembled by build scripts (classic runtime JS emit)

  const PULLS_PALETTE_ROOT_ID = 'prp-pulls-palette';
  let pullsPaletteOpen = false;
  let pullsPaletteQuery = '';
  let pullsPaletteFocusIndex = 0;
  /** @type {Array|null} */
  let pullsPaletteItems = null;
  /** Snapshot of list-row focus number so Esc can restore it */
  let pullsPaletteSavedListFocus = null;
  let pullsPaletteRoot = null;
  /** @type {null|(() => void)} */
  let pullsPaletteScrollbarDestroy = null;
  /** Async PR-search (`#…`) state */
  let pullsPalettePrSearchAsyncHits = [];
  let pullsPalettePrSearchLoading = false;
  let pullsPalettePrSearchError = null;
  /** @type {AbortController|null} */
  let pullsPalettePrSearchAbort = null;
  let pullsPalettePrSearchSeq = 0;
  let pullsPalettePrSearchTimer = null;

  function pullsPaletteApi() {
    return globalThis.PRPullsPalette || null;
  }

  function isPullsPaletteOpen() {
    return Boolean(pullsPaletteOpen);
  }

  function getViewerLoginForPalette() {
    const api = pullsPaletteApi();
    if (typeof api?.readViewerLoginFromDocument === 'function') {
      try {
        const v = api.readViewerLoginFromDocument(document);
        if (v) return v;
      } catch {
        /* ignore */
      }
    }
    try {
      return (
        document
          .querySelector('meta[name="user-login"]')
          ?.getAttribute('content') || ''
      );
    } catch {
      return '';
    }
  }

  function getRepoForPalette() {
    const dom = listDomApi();
    if (typeof dom?.parseRepoFromPathname === 'function') {
      try {
        const r = dom.parseRepoFromPathname(location.pathname || '');
        if (r?.owner && r?.repo) return r;
      } catch {
        /* ignore */
      }
    }
    const m = String(location.pathname || '').match(
      /^\/([^/]+)\/([^/]+)\/pulls(?:\/|$)/
    );
    if (!m) return { owner: '', repo: '' };
    return { owner: m[1], repo: m[2] };
  }

  function getWebOrigin() {
    try {
      return location.origin || 'https://github.com';
    } catch {
      return 'https://github.com';
    }
  }

  function rebuildPullsPaletteItems() {
    const api = pullsPaletteApi();
    const prs = resolveOpenPulls();
    const repo = getRepoForPalette();
    const viewer = getViewerLoginForPalette();
    if (typeof api?.buildPullsPaletteItems === 'function') {
      pullsPaletteItems = api.buildPullsPaletteItems(prs, {
        query: pullsPaletteQuery,
        viewerLogin: viewer,
        owner: repo.owner,
        repo: repo.repo,
        webOrigin: getWebOrigin(),
        asyncHits: pullsPalettePrSearchAsyncHits,
        prSearchLoading: pullsPalettePrSearchLoading,
        prSearchError: pullsPalettePrSearchError,
      });
    } else {
      pullsPaletteItems = [];
    }
    const n = pullsPaletteItems.length;
    if (n === 0) {
      pullsPaletteFocusIndex = -1;
    } else if (
      pullsPaletteFocusIndex < 0 ||
      pullsPaletteFocusIndex >= n
    ) {
      pullsPaletteFocusIndex = 0;
    }
    return pullsPaletteItems;
  }

  function resetPullsPalettePrSearch() {
    pullsPalettePrSearchAsyncHits = [];
    pullsPalettePrSearchLoading = false;
    pullsPalettePrSearchError = null;
    pullsPalettePrSearchSeq += 1;
    try {
      pullsPalettePrSearchAbort?.abort?.();
    } catch {
      /* ignore */
    }
    pullsPalettePrSearchAbort = null;
    if (pullsPalettePrSearchTimer != null) {
      try {
        clearTimeout(pullsPalettePrSearchTimer);
      } catch {
        /* ignore */
      }
      pullsPalettePrSearchTimer = null;
    }
  }

  /**
   * Cache-first PR search already applied via buildPullsPaletteItems; kick a
   * debounced network re-fetch of open pulls and merge extra matches.
   * Bare `#` / `#$` (empty term) stays cache-only — no network until the user
   * types a non-empty term after the prefix (still debounced).
   */
  function schedulePullsPalettePrSearch() {
    const api = pullsPaletteApi();
    const parsed =
      typeof api?.parsePalettePrSearchQuery === 'function'
        ? api.parsePalettePrSearchQuery(pullsPaletteQuery)
        : { isPrSearch: false, term: '' };
    if (!parsed.isPrSearch) {
      resetPullsPalettePrSearch();
      return;
    }
    // Drop prior async hits (stale term) immediately
    pullsPalettePrSearchAsyncHits = [];
    pullsPalettePrSearchError = null;
    if (pullsPalettePrSearchTimer != null) {
      try {
        clearTimeout(pullsPalettePrSearchTimer);
      } catch {
        /* ignore */
      }
      pullsPalettePrSearchTimer = null;
    }
    try {
      pullsPalettePrSearchAbort?.abort?.();
    } catch {
      /* ignore */
    }
    pullsPalettePrSearchAbort = null;
    const term = String(parsed.term || '');
    const kickAsync =
      typeof api?.shouldKickPrSearchAsync === 'function'
        ? api.shouldKickPrSearchAsync(term)
        : term.trim().length > 0;
    if (!kickAsync) {
      // Bare prefix: cache-only, no loading spinner / network
      pullsPalettePrSearchLoading = false;
      pullsPalettePrSearchSeq += 1;
      return;
    }
    pullsPalettePrSearchLoading = true;
    const seq = ++pullsPalettePrSearchSeq;
    pullsPalettePrSearchTimer = setTimeout(() => {
      pullsPalettePrSearchTimer = null;
      void runPullsPalettePrSearchAsync(term, seq);
    }, 180);
  }

  async function runPullsPalettePrSearchAsync(term, seq) {
    if (seq !== pullsPalettePrSearchSeq) return;
    const repo = getRepoForPalette();
    if (!repo.owner || !repo.repo) {
      if (seq === pullsPalettePrSearchSeq) {
        pullsPalettePrSearchLoading = false;
        paintPullsPalette();
      }
      return;
    }
    try {
      pullsPalettePrSearchAbort?.abort?.();
    } catch {
      /* ignore */
    }
    const ac =
      typeof AbortController !== 'undefined' ? new AbortController() : null;
    pullsPalettePrSearchAbort = ac;
    try {
      let remote = [];
      if (typeof globalThis.PRTreeFetch?.fetchOpenPulls === 'function') {
        const prs = await globalThis.PRTreeFetch.fetchOpenPulls(
          repo.owner,
          repo.repo,
          null,
          { signal: ac?.signal || null }
        );
        if (seq !== pullsPalettePrSearchSeq) return;
        const api = pullsPaletteApi();
        remote =
          typeof api?.matchCachedPrsForSearch === 'function'
            ? api.matchCachedPrsForSearch(prs || [], term)
            : Array.isArray(prs)
              ? prs
              : [];
      }
      if (seq !== pullsPalettePrSearchSeq) return;
      pullsPalettePrSearchAsyncHits = remote;
      pullsPalettePrSearchLoading = false;
      pullsPalettePrSearchError = null;
      paintPullsPalette();
    } catch (err) {
      if (seq !== pullsPalettePrSearchSeq) return;
      if (err?.name === 'AbortError' || ac?.signal?.aborted) return;
      pullsPalettePrSearchLoading = false;
      pullsPalettePrSearchError =
        err?.message || String(err || 'Search failed');
      paintPullsPalette();
    }
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** Author avatar or initials fallback for palette PR rows. */
  function renderPullsPaletteAvatar(item) {
    const login = String(item?.author || '').trim();
    const url = String(item?.authorAvatarUrl || '').trim();
    const initials = login
      ? login
          .slice(0, 2)
          .toUpperCase()
      : '?';
    if (url) {
      return `<img class="prp-pp-avatar" src="${escapeHtml(
        url
      )}" alt="" width="28" height="28" loading="lazy" decoding="async" />`;
    }
    return `<span class="prp-pp-avatar prp-pp-avatar--fallback" aria-hidden="true">${escapeHtml(
      initials
    )}</span>`;
  }

  /** Rich meta row: #num · avatar @author · branch chips */
  function renderPullsPalettePrBody(item) {
    const num = item?.number != null ? Number(item.number) : NaN;
    const numHtml = Number.isFinite(num)
      ? `<span class="prp-pp-pr-num">#${num}</span>`
      : '';
    const author = String(item?.author || '').trim();
    const authorHtml = author
      ? `<span class="prp-pp-author">${renderPullsPaletteAvatar(
          item
        )}<span class="prp-pp-author__login">@${escapeHtml(author)}</span></span>`
      : '';
    const head = String(item?.headRef || '').trim();
    const base = String(item?.baseRef || '').trim();
    let branchHtml = '';
    if (head || base) {
      const headChip = head
        ? `<span class="prp-pp-branch" title="${escapeHtml(head)}">${escapeHtml(
            head
          )}</span>`
        : '';
      const baseChip = base
        ? `<span class="prp-pp-branch prp-pp-branch--base" title="${escapeHtml(
            base
          )}">${escapeHtml(base)}</span>`
        : '';
      const arrow =
        head && base ? `<span class="prp-pp-branch-arrow" aria-hidden="true">→</span>` : '';
      branchHtml = `<span class="prp-pp-branches">${headChip}${arrow}${baseChip}</span>`;
    }
    const draftHtml = item?.draft
      ? `<span class="prp-pp-draft">Draft</span>`
      : '';
    return `
      <span class="prp-pp-item__main">
        <span class="prp-pp-item__title">${escapeHtml(item.title || '')}</span>
        <span class="prp-pp-item__meta">
          ${numHtml}
          ${authorHtml}
          ${draftHtml}
          ${branchHtml}
        </span>
      </span>`;
  }

  /**
   * Action row body: title + aliases/description under it.
   * Must wrap in __main so the digit kbd stays a single right-column badge
   * (bare title/sub children auto-place into col2 / row2).
   */
  function renderPullsPaletteActionBody(item) {
    const aliases = Array.isArray(item?.aliases)
      ? item.aliases.map((a) => String(a || '').trim()).filter(Boolean)
      : [];
    const aliasHtml = aliases.length
      ? `<span class="prp-pp-aliases">${aliases
          .map(
            (a) =>
              `<kbd class="prp-pp-alias">${escapeHtml(a)}</kbd>`
          )
          .join('')}</span>`
      : '';
    const rawDesc = String(item?.description || item?.subtitle || '').trim();
    const aliasJoined = aliases.join(' · ');
    // Avoid repeating pure alias text under the chips
    const desc =
      rawDesc &&
      rawDesc !== aliasJoined &&
      !(aliases.length === 1 && rawDesc === aliases[0])
        ? rawDesc
        : '';
    // If description still starts with "cm · …", drop the alias prefix
    let descShow = desc;
    if (descShow && aliases.length) {
      for (const a of aliases) {
        const prefix = `${a} · `;
        if (descShow.startsWith(prefix)) {
          descShow = descShow.slice(prefix.length);
          break;
        }
      }
    }
    const descHtml = descShow
      ? `<span class="prp-pp-action-desc">${escapeHtml(descShow)}</span>`
      : '';
    const meta =
      aliasHtml || descHtml
        ? `<span class="prp-pp-item__meta prp-pp-item__meta--action">${aliasHtml}${descHtml}</span>`
        : '';
    return `
      <span class="prp-pp-item__main">
        <span class="prp-pp-item__title">${escapeHtml(item?.title || '')}</span>
        ${meta}
      </span>`;
  }

  function fillPullsPaletteHelp(root) {
    const host = root || pullsPaletteRoot;
    const list = host?.querySelector?.('[data-prp-pp-help-list]');
    if (!list) return;
    const api = pullsPaletteApi();
    const entries =
      typeof api?.buildPullsPaletteHelpEntries === 'function'
        ? api.buildPullsPaletteHelpEntries()
        : [];
    if (!entries.length) {
      list.innerHTML =
        '<div class="prp-pp-help__empty prp-muted">No actions configured</div>';
      return;
    }
    list.innerHTML = entries
      .map((e) => {
        const codes = (e.aliases || [])
          .map(
            (a) =>
              `<kbd class="prp-pp-help__alias">${escapeHtml(String(a))}</kbd>`
          )
          .join('');
        const fid = e.filterId
          ? ` data-prp-pp-help-filter="${escapeHtml(String(e.filterId))}"`
          : '';
        return `<button type="button" class="prp-pp-help__row" data-prp-pp-help-run="1"
          data-prp-pp-help-id="${escapeHtml(String(e.id || ''))}"
          data-prp-pp-help-action="${escapeHtml(String(e.action || ''))}"${fid}
          title="Run: ${escapeHtml(e.title)}">
          <span class="prp-pp-help__action">${escapeHtml(e.title)}</span>
          <span class="prp-pp-help__aliases">${codes}</span>
        </button>`;
      })
      .join('');
  }

  /** Run a configured palette action (from help sidebar or list). */
  function executePullsPaletteCommand(item) {
    if (!item || typeof item !== 'object') return false;
    const api = pullsPaletteApi();

    if (item.action === 'toggleFiltersMenu') {
      closePullsPalette();
      queueMicrotask(() => toggleFiltersMenu());
      return true;
    }

    // Toggle right-side help panel (keep palette open)
    if (item.action === 'toggleHelp') {
      togglePullsPaletteHelp();
      return true;
    }

    if (item.action === 'applyFilter' && item.filterId) {
      const repo = getRepoForPalette();
      const fid = String(item.filterId).toLowerCase();
      const href =
        typeof api?.buildPullsListFilterUrl === 'function'
          ? api.buildPullsListFilterUrl(
              repo.owner,
              repo.repo,
              fid,
              getWebOrigin()
            )
          : `${getWebOrigin()}/${repo.owner}/${repo.repo}/pulls`;
      const isExternal = /^https?:\/\//i.test(href);
      if (!isExternal && (!repo.owner || !repo.repo)) {
        console.warn('[pr+] pulls palette filter: missing owner/repo', repo);
        return false;
      }
      closePullsPalette();
      return navigatePage(href);
    }

    if (item.action === 'createPullRequest') {
      const repo = getRepoForPalette();
      const href =
        item.href ||
        (typeof api?.buildCreatePullRequestUrl === 'function'
          ? api.buildCreatePullRequestUrl(
              repo.owner,
              repo.repo,
              getWebOrigin()
            )
          : `${getWebOrigin()}/${repo.owner}/${repo.repo}/compare`);
      closePullsPalette();
      return navigatePage(href);
    }

    if (item.kind === 'pr' || item.action === 'openPullRequest') {
      const repo = getRepoForPalette();
      const owner = item.owner || repo.owner;
      const r = item.repo || repo.repo;
      const number = Number(item.number);
      if (!owner || !r || !Number.isFinite(number)) return false;
      closePullsPalette();
      void openModal({
        owner,
        repo: r,
        number,
        page: 'conversation',
      });
      return true;
    }
    return false;
  }

  function runPullsPaletteHelpAction(el) {
    if (!el) return false;
    const action = el.getAttribute('data-prp-pp-help-action') || '';
    const filterId = el.getAttribute('data-prp-pp-help-filter') || '';
    const id = el.getAttribute('data-prp-pp-help-id') || '';
    return executePullsPaletteCommand({
      id,
      kind: 'action',
      action,
      filterId: filterId || undefined,
    });
  }

  function togglePullsPaletteHelp(force: any = undefined) {
    if (!pullsPaletteRoot) return;
    const panel = pullsPaletteRoot.querySelector('[data-prp-pp-help]');
    const toggle = pullsPaletteRoot.querySelector('[data-prp-pp-help-toggle]');
    if (!panel) return;
    const open =
      typeof force === 'boolean' ? force : panel.hasAttribute('hidden');
    if (open) {
      panel.removeAttribute('hidden');
      fillPullsPaletteHelp(pullsPaletteRoot);
      toggle?.setAttribute('aria-expanded', 'true');
      pullsPaletteRoot
        .querySelector('.prp-pp-panel')
        ?.classList.add('prp-pp-panel--help');
    } else {
      panel.setAttribute('hidden', '');
      toggle?.setAttribute('aria-expanded', 'false');
      pullsPaletteRoot
        .querySelector('.prp-pp-panel')
        ?.classList.remove('prp-pp-panel--help');
    }
  }

  /**
   * Move focus highlight without rebuilding list DOM (avoids re-animation / re-render).
   */
  function updatePullsPaletteFocus() {
    if (!pullsPaletteRoot) return;
    const listEl = pullsPaletteRoot.querySelector('[data-prp-pp-list]');
    if (!listEl) return;
    const rows = listEl.querySelectorAll('.prp-pp-item[data-prp-pp-index]');
    if (!rows.length) return;
    let focusedEl = null;
    for (const row of rows) {
      const i = Number(row.getAttribute('data-prp-pp-index'));
      const on = i === pullsPaletteFocusIndex;
      row.classList.toggle('is-focused', on);
      row.setAttribute('aria-selected', on ? 'true' : 'false');
      if (on) focusedEl = row;
    }
    try {
      // Instant — never smooth-scroll on focus step
      focusedEl?.scrollIntoView?.({ block: 'nearest', behavior: 'auto' });
    } catch {
      /* ignore */
    }
  }

  /** Full list rebuild (query / open). Prefer updatePullsPaletteFocus for ↑↓. */
  function paintPullsPalette() {
    if (!pullsPaletteRoot) return;
    const items = rebuildPullsPaletteItems() || [];
    const listEl = pullsPaletteRoot.querySelector('[data-prp-pp-list]');
    const input = pullsPaletteRoot.querySelector('[data-prp-pp-input]');
    const meta = pullsPaletteRoot.querySelector('[data-prp-pp-meta]');
    if (input && input.value !== pullsPaletteQuery) {
      input.value = pullsPaletteQuery;
    }
    if (meta) {
      const viewer = getViewerLoginForPalette();
      const api = pullsPaletteApi();
      const prSearch =
        typeof api?.parsePalettePrSearchQuery === 'function'
          ? api.parsePalettePrSearchQuery(pullsPaletteQuery)
          : { isPrSearch: false };
      if (prSearch.isPrSearch) {
        meta.textContent = pullsPalettePrSearchLoading
          ? `PR search · loading…${viewer ? `  ·  @${viewer}` : ''}`
          : `PR search · #number or #name${viewer ? `  ·  @${viewer}` : ''}`;
      } else {
        meta.textContent = viewer
          ? `Type to filter · #PR search · open help  ·  @${viewer}`
          : 'Type to filter · #PR search · open help for actions';
      }
    }
    if (!listEl) return;
    if (items.length === 0) {
      listEl.removeAttribute('data-prp-pp-animate');
      listEl.innerHTML =
        '<li class="prp-pp-empty prp-muted">No matching results</li>';
      return;
    }
    // One-shot enter animation on full rebuild only (not focus moves)
    listEl.setAttribute('data-prp-pp-animate', '1');
    listEl.innerHTML = items
      .map((item, i) => {
        const focused = i === pullsPaletteFocusIndex ? ' is-focused' : '';
        const digit =
          item.digit != null
            ? `<kbd class="prp-pp-digit">⌥${item.digit}</kbd>`
            : '';
        const isStatus = item.kind === 'status' || item.loading || item.empty;
        const isPr = item.kind === 'pr';
        const body = isStatus
          ? `<span class="prp-pp-item__main"><span class="prp-pp-item__title">${escapeHtml(
              item?.title || ''
            )}</span><span class="prp-pp-item__meta prp-pp-item__meta--action"><span class="prp-pp-action-desc">${escapeHtml(
              item?.description || item?.subtitle || ''
            )}</span></span></span>`
          : isPr
            ? renderPullsPalettePrBody(item)
            : renderPullsPaletteActionBody(item);
        const kindClass = isStatus
          ? item.loading
            ? ' prp-pp-item--status prp-pp-item--loading'
            : ' prp-pp-item--status'
          : item.kind === 'action'
            ? ' prp-pp-item--action'
            : ' prp-pp-item--pr';
        const disabled = item.disabled || item.loading || item.empty;
        return `<li class="prp-pp-item${focused}${kindClass}" data-prp-pp-index="${i}" role="option" aria-selected="${
          i === pullsPaletteFocusIndex ? 'true' : 'false'
        }"${disabled ? ' aria-disabled="true"' : ''}${
          item.loading ? ' data-prp-pp-loading="1"' : ''
        }>
          <button type="button" class="prp-pp-item__btn prp-pp-item__btn--row" data-prp-pp-index="${i}"${
            disabled ? ' disabled' : ''
          }>
            ${body}
            ${digit}
          </button>
        </li>`;
      })
      .join('');
    updatePullsPaletteFocus();
    // Drop animate flag after paint so later DOM ops don't re-trigger
    requestAnimationFrame(() => {
      try {
        listEl.removeAttribute('data-prp-pp-animate');
      } catch {
        /* ignore */
      }
    });
  }

  function closePullsPalette() {
    if (!pullsPaletteOpen && !pullsPaletteRoot) return;
    pullsPaletteOpen = false;
    pullsPaletteQuery = '';
    pullsPaletteItems = null;
    pullsPaletteFocusIndex = 0;
    resetPullsPalettePrSearch();
    try {
      pullsPaletteScrollbarDestroy?.();
    } catch {
      /* ignore */
    }
    pullsPaletteScrollbarDestroy = null;
    try {
      pullsPaletteRoot?.remove?.();
    } catch {
      /* ignore */
    }
    pullsPaletteRoot = null;
    // Restore prior list-row keyboard focus when we had one
    if (
      pullsPaletteSavedListFocus != null &&
      Number.isFinite(Number(pullsPaletteSavedListFocus))
    ) {
      const want = Number(pullsPaletteSavedListFocus);
      const rows = getPullsListRows();
      const idx = rows.findIndex((r) => getRowPrNumber(r) === want);
      if (idx >= 0) applyPullsListFocus(idx);
    }
    pullsPaletteSavedListFocus = null;
  }

  function openPullsPalette() {
    if (!hostEnabled || !isPullsListPage() || current.open) return false;
    if (githubPaletteOpenNow()) return false;
    recoverGithubPaletteIfStuck();

    pullsPaletteSavedListFocus = listFocusNumber;
    pullsPaletteOpen = true;
    pullsPaletteQuery = '';
    pullsPaletteFocusIndex = 0;
    resetPullsPalettePrSearch();

    let root = document.getElementById(PULLS_PALETTE_ROOT_ID);
    if (!root) {
      root = document.createElement('div');
      root.id = PULLS_PALETTE_ROOT_ID;
      root.className = 'prp-pp-layer prp-pp-layer--enter';
      root.setAttribute('role', 'presentation');
      root.innerHTML = `
        <div class="prp-pp-backdrop" data-prp-pp-close="1"></div>
        <div class="prp-pp-panel" role="dialog" aria-label="pr+ pulls command palette" aria-modal="true">
          <div class="prp-pp-main">
            <div class="prp-pp-head">
              <input class="prp-pp-input" data-prp-pp-input type="search" autocomplete="off" spellcheck="false"
                placeholder="Search PRs · #123 · #name · np  am  df  help" />
              <div class="prp-pp-meta prp-muted" data-prp-pp-meta></div>
            </div>
            <div class="prp-scroll-float-host prp-edge-fade prp-pp-list-host" data-prp-pp-list-host>
              <ul class="prp-pp-list prp-scroll-float" data-prp-pp-list role="listbox"></ul>
            </div>
            <div class="prp-pp-foot">
              <span class="prp-pp-foot__keys prp-muted">⌥⇧K · ↑↓ · ⌥J ⌥K · Enter · Esc</span>
              <button type="button" class="prp-pp-help-btn" data-prp-pp-help-toggle
                aria-expanded="false" aria-controls="prp-pp-help-panel" title="Help">
                <svg class="prp-pp-help-icon" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
                  <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm9 3a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM6.92 6.085c.081-.16.19-.299.34-.398.145-.097.346-.178.62-.178.26 0 .44.07.55.16.12.095.17.22.17.37 0 .17-.06.3-.19.42-.12.12-.33.26-.66.42-.4.19-.7.4-.92.64a1.7 1.7 0 0 0-.36.75 1 1 0 0 0 1.95.4c.02-.08.06-.15.12-.22.08-.09.2-.19.38-.28.4-.2.76-.45 1.02-.74.27-.3.4-.66.4-1.1 0-.47-.16-.88-.48-1.2-.32-.33-.8-.5-1.4-.5-.52 0-.96.13-1.32.39-.36.25-.6.61-.71 1.06a1 1 0 0 0 1.9.4Z"/>
                </svg>
                <span class="prp-pp-help-btn__label prp-muted">help</span>
              </button>
            </div>
          </div>
          <aside class="prp-pp-help" id="prp-pp-help-panel" data-prp-pp-help hidden>
            <div class="prp-pp-help__head">
              <div class="prp-pp-help__title">Actions</div>
              <button type="button" class="prp-pp-help-close" data-prp-pp-help-toggle aria-label="Close help">×</button>
            </div>
            <div class="prp-pp-help__list" data-prp-pp-help-list></div>
            <div class="prp-pp-help__hint prp-muted">Click a row to run · or type alias + Enter</div>
          </aside>
        </div>`;
      document.documentElement.appendChild(root);
      root.addEventListener('click', (e) => {
        const t = e.target;
        if (t?.closest?.('[data-prp-pp-close]')) {
          e.preventDefault();
          closePullsPalette();
          return;
        }
        const helpToggle = t?.closest?.('[data-prp-pp-help-toggle]');
        if (helpToggle) {
          e.preventDefault();
          e.stopPropagation();
          togglePullsPaletteHelp();
          return;
        }
        const helpRun = t?.closest?.('[data-prp-pp-help-run]');
        if (helpRun) {
          e.preventDefault();
          e.stopPropagation();
          runPullsPaletteHelpAction(helpRun);
          return;
        }
        const btn = t?.closest?.('[data-prp-pp-index]');
        if (btn) {
          const idx = Number(btn.getAttribute('data-prp-pp-index'));
          if (Number.isFinite(idx)) {
            pullsPaletteFocusIndex = idx;
            activatePullsPaletteItem(idx);
          }
        }
      });
      const input = root.querySelector('[data-prp-pp-input]');
      input?.addEventListener('input', (e) => {
        pullsPaletteQuery = String(e.target?.value || '');
        pullsPaletteFocusIndex = 0;
        const api = pullsPaletteApi();
        const prSearch =
          typeof api?.parsePalettePrSearchQuery === 'function'
            ? api.parsePalettePrSearchQuery(pullsPaletteQuery)
            : { isPrSearch: false };
        if (prSearch.isPrSearch) {
          schedulePullsPalettePrSearch();
        } else {
          resetPullsPalettePrSearch();
        }
        paintPullsPalette();
      });
      fillPullsPaletteHelp(root);
    }
    pullsPaletteRoot = root;
    // Shared floating scrollbar (same system as modal lists)
    try {
      pullsPaletteScrollbarDestroy?.();
    } catch {
      /* ignore */
    }
    pullsPaletteScrollbarDestroy = null;
    try {
      const attach =
        globalThis.PRModalFloatingScrollbar?.attachFloatingScrollbar;
      const listEl = root.querySelector('[data-prp-pp-list]');
      const listHost = root.querySelector('[data-prp-pp-list-host]');
      if (typeof attach === 'function' && listEl) {
        pullsPaletteScrollbarDestroy = attach(listEl, { host: listHost });
      }
    } catch {
      /* ignore */
    }
    // Restart enter animation on reopen
    try {
      root.classList.remove('prp-pp-layer--enter');
      void root.offsetWidth;
      root.classList.add('prp-pp-layer--enter');
    } catch {
      /* ignore */
    }
    paintPullsPalette();
    queueMicrotask(() => {
      try {
        const input = root.querySelector('[data-prp-pp-input]');
        input?.focus?.();
        input?.select?.();
      } catch {
        /* ignore */
      }
    });
    return true;
  }

  /** Navigate the real tab (filters / create) so the pulls list page changes. */

  function navigatePage(href) {
    const raw = String(href || '').trim();
    if (!raw) return false;
    let abs = raw;
    try {
      abs = new URL(raw, location.href).href;
    } catch {
      /* keep raw */
    }
    // GitHub Turbo soft-nav when available (keeps SPA shell, still updates list)
    try {
      const turbo = globalThis.Turbo || globalThis.turbo;
      if (turbo && typeof turbo.visit === 'function') {
        turbo.visit(abs);
        return true;
      }
    } catch {
      /* fall through */
    }
    try {
      location.href = abs;
      return true;
    } catch {
      try {
        location.assign(abs);
        return true;
      } catch {
        try {
          const a = document.createElement('a');
          a.href = abs;
          a.setAttribute('data-turbo', 'true');
          document.body.appendChild(a);
          a.click();
          a.remove();
          return true;
        } catch {
          return false;
        }
      }
    }
  }

  function activatePullsPaletteItem(index) {
    const api = pullsPaletteApi();
    const items = pullsPaletteItems || rebuildPullsPaletteItems() || [];
    // Prefer exact alias (am/my/np) over stale focus index
    const resolvedIdx =
      typeof api?.resolveActivateIndex === 'function'
        ? api.resolveActivateIndex(items, index, pullsPaletteQuery)
        : index;
    const item = items[resolvedIdx];
    if (!item) return false;
    // Loading / empty status rows are not activatable
    if (item.disabled || item.loading || item.empty || item.kind === 'status') {
      return false;
    }
    pullsPaletteFocusIndex = resolvedIdx;
    return executePullsPaletteCommand(item);
  }

  function stepPullsPaletteFocus(delta) {
    const api = pullsPaletteApi();
    const items = pullsPaletteItems || rebuildPullsPaletteItems() || [];
    const next =
      typeof api?.nextPaletteFocusIndex === 'function'
        ? api.nextPaletteFocusIndex(
            pullsPaletteFocusIndex,
            delta,
            items.length
          )
        : items.length
          ? (pullsPaletteFocusIndex + delta + items.length) % items.length
          : -1;
    pullsPaletteFocusIndex = next;
    updatePullsPaletteFocus();
    return next;
  }

  function onPullsListKeydown(event) {
    // Escape / any key while GH palette is closing: heal stuck top-layer first
    if (!current.open) {
      recoverGithubPaletteIfStuck();
    }

    // Never steal keys while GitHub's command palette is open
    if (githubPaletteOpenNow()) return;
    // Same Escape that just closed GH palette — do not treat as our action
    if (event.key === 'Escape' && githubPaletteOwnsEscape(event)) return;

    if (!hostEnabled) return;
    if (current.open) return;

    const pp = pullsPaletteApi();
    const listApi = listFocusApi();
    const mod = event.metaKey || event.ctrlKey;
    const shift = event.shiftKey;
    const alt = event.altKey;

    // Option held → show ⌥1–9a–e / ⌥N hints on the list (not inside palette)
    if (
      !isPullsPaletteOpen() &&
      isPullsListPage() &&
      alt &&
      !mod &&
      !shift &&
      (event.code === 'AltLeft' ||
        event.code === 'AltRight' ||
        event.key === 'Alt')
    ) {
      showPullsListHotkeyHints();
    } else if (alt && !mod && !shift && !isPullsPaletteOpen() && isPullsListPage()) {
      // Any other Option+chord while held: keep hints visible
      showPullsListHotkeyHints();
    }

    // --- Pulls command palette shortcuts ---
    if (typeof pp?.resolvePullsPaletteShortcutAction === 'function') {
      const raw = pp.resolvePullsPaletteShortcutAction({
        mod,
        shift,
        alt,
        key: event.key,
        code: event.code,
        paletteOpen: isPullsPaletteOpen(),
        isPullsList: isPullsListPage(),
        hostEnabled,
        githubPaletteOpen: false,
        modalOpen: false,
        editableTarget: isEditableKeyTarget(event.target),
      });
      const { action, digitIndex } =
        typeof pp.unwrapPullsPaletteAction === 'function'
          ? pp.unwrapPullsPaletteAction(raw)
          : { action: typeof raw === 'string' ? raw : raw?.action, digitIndex: raw?.digitIndex ?? -1 };

      if (action) {
        // Allow typing in the palette search for normal keys; only handle resolved actions
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === 'function') {
          event.stopImmediatePropagation();
        }
        if (action === 'openPalette') {
          openPullsPalette();
          return;
        }
        if (action === 'closePalette') {
          closePullsPalette();
          return;
        }
        if (action === 'focusNext') {
          stepPullsPaletteFocus(1);
          return;
        }
        if (action === 'focusPrev') {
          stepPullsPaletteFocus(-1);
          return;
        }
        if (action === 'activate') {
          activatePullsPaletteItem(
            pullsPaletteFocusIndex >= 0 ? pullsPaletteFocusIndex : 0
          );
          return;
        }
        // (selectDigit handled below)
        if (action === 'selectDigit') {
          const items = pullsPaletteItems || rebuildPullsPaletteItems() || [];
          if (digitIndex >= 0 && digitIndex < items.length) {
            pullsPaletteFocusIndex = digitIndex;
            activatePullsPaletteItem(digitIndex);
          }
          return;
        }
      }
    }

    // When palette is open, do not run list-row shortcuts
    if (isPullsPaletteOpen()) return;

    if (!isPullsListPage()) return;

    // Peer filter actions (⌥⇧G Assigned, ⌥⇧C Created, …) — floating dock
    if (alt && shift && !mod && typeof pp?.resolvePullsPeerOptAction === 'function') {
      const peer = pp.resolvePullsPeerOptAction({
        alt: true,
        shift: true,
        mod: false,
        key: event.key,
        code: event.code,
      });
      if (peer?.filterId || peer?.action) {
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === 'function') {
          event.stopImmediatePropagation();
        }
        executePullsPaletteCommand({
          action: peer.action || 'applyFilter',
          filterId: peer.filterId,
          id: peer.id,
        });
        return;
      }
    }

    const resolve =
      listApi?.resolvePrListShortcutAction ||
      (typeof globalThis !== 'undefined' &&
        globalThis.PRListFocus?.resolvePrListShortcutAction);
    if (typeof resolve !== 'function') return;

    const rawList = resolve({
      mod,
      shift,
      alt,
      key: event.key,
      code: event.code,
      editableTarget: isEditableKeyTarget(event.target),
      modalOpen: Boolean(current.open),
      isPullsList: true,
      hostEnabled,
      hasFocusedRow: resolvePullsListFocusIndex() >= 0,
      githubPaletteOpen: false,
      pullsPaletteOpen: false,
    });
    const unwrapped =
      typeof listApi?.unwrapPrListAction === 'function'
        ? listApi.unwrapPrListAction(rawList)
        : typeof rawList === 'string'
          ? { action: rawList, index: -1, filterId: null }
          : {
              action: rawList?.action || null,
              index: rawList?.index ?? -1,
              filterId: rawList?.filterId || null,
            };
    const { action, index: hotIndex, filterId } = unwrapped;
    if (!action) return;

    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation();
    }

    if (action === 'focusNext') {
      stepPullsListFocus(1);
      return;
    }
    if (action === 'focusPrev') {
      stepPullsListFocus(-1);
      return;
    }
    if (action === 'openFocused') {
      openFocusedPullsListRow();
      return;
    }
    if (action === 'openByHotkey') {
      hidePullsListHotkeyHints();
      openPullsListRowAt(hotIndex);
      return;
    }
    if (action === 'openFilterBar') {
      hidePullsListHotkeyHints();
      activateFilterBar(filterId);
      return;
    }
    if (action === 'newPullRequest') {
      hidePullsListHotkeyHints();
      openNewPullRequestFromList();
    }
  }

  function onPullsListKeyup(event) {
    if (event.key === 'Alt' || event.code === 'AltLeft' || event.code === 'AltRight') {
      hidePullsListHotkeyHints();
    }
    // If Option released mid-chord (browser may not fire Alt keyup alone)
    if (!event.altKey) {
      hidePullsListHotkeyHints();
    }
  }

  /**
   * ⌥J/K list navigator is ephemeral: any pointer/click or focus leaving
   * the list clears the highlight so it does not stick after mouse use.
   */
  function dismissPullsListFocusIfAny() {
    if (listFocusNumber == null && resolvePullsListFocusIndex() < 0) return;
    clearPullsListFocus();
  }

  function onPointerDownCapture(event) {
    if (current.open) return;
    recoverGithubPaletteIfStuck();
    // Pulls palette owns its own focus chrome
    if (isPullsPaletteOpen()) return;
    if (!isPullsListPage()) return;
    // Any click/tap dismisses keyboard list focus (including on a PR row)
    if (listFocusNumber != null || resolvePullsListFocusIndex() >= 0) {
      dismissPullsListFocusIfAny();
    }
  }

  function onDocumentFocusIn(event) {
    if (current.open) return;
    if (isPullsPaletteOpen()) return;
    if (!isPullsListPage()) return;
    if (listFocusNumber == null && resolvePullsListFocusIndex() < 0) return;

    const t = event?.target;
    // Focus moved into an editable / chrome control → drop list navigator
    if (isEditableKeyTarget(t)) {
      dismissPullsListFocusIfAny();
      return;
    }
    // Focus outside any PR row → drop
    try {
      const rows = getPullsListRows();
      const inside = rows.some((r) => r && (r === t || r.contains?.(t)));
      if (!inside) dismissPullsListFocusIfAny();
    } catch {
      dismissPullsListFocusIfAny();
    }
  }

  function onWindowBlur() {
    if (current.open) return;
    dismissPullsListFocusIfAny();
    hidePullsListHotkeyHints();
  }

  function ensurePullsListKeyboard() {
    if (listFocusKeyBound) return;
    listFocusKeyBound = true;
    document.addEventListener('keydown', onPullsListKeydown, true);
    document.addEventListener('keyup', onPullsListKeyup, true);
    // pointerdown: recover stuck GH palette top-layer + dismiss list focus
    document.addEventListener('pointerdown', onPointerDownCapture, true);
    document.addEventListener('focusin', onDocumentFocusIn, true);
    window.addEventListener('blur', onWindowBlur);
  }

