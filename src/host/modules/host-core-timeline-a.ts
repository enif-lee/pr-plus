  // continued host module segment
  function nowMs() {
    return typeof performance !== 'undefined' && performance.now
      ? performance.now()
      : Date.now();
  }

  function publishFetchTimeline(tl) {
    if (!tl) return;
    try {
      globalThis.__PRP_FETCH_TIMELINE__ = {
        label: tl.label,
        t0: tl.t0,
        elapsedMs: Math.round(nowMs() - tl.t0),
        events: tl.events.slice(),
      };
    } catch {
      /* ignore */
    }
    try {
      const host = document.getElementById(HOST_ID);
      if (host) {
        // Cap payload size for attribute
        const slim = tl.events.map((e) => ({
          t: e.t,
          p: e.phase,
          n: e.name,
          d: e.dur,
          ok: e.ok,
        }));
        host.setAttribute(
          'data-prp-tl',
          JSON.stringify({
            label: tl.label,
            elapsedMs: Math.round(nowMs() - tl.t0),
            events: slim,
          })
        );
      }
    } catch {
      /* ignore */
    }
  }

  function beginFetchTimeline(label) {
    const t0 = nowMs();
    const events = [];
    const tl = {
      label: String(label || 'open'),
      t0,
      events,
      now() {
        return Math.round(nowMs() - t0);
      },
      mark(name, phase, extra = null) {
        const e = {
          t: Math.round(nowMs() - t0),
          name: String(name || ''),
          phase: String(phase || 'mark'),
          ...(extra && typeof extra === 'object' ? extra : {}),
        };
        events.push(e);
        const dur =
          e.dur != null ? ` ${e.dur}ms` : e.phase === 'end' && e.dur != null ? ` ${e.dur}ms` : '';
        const ok =
          e.ok === false ? ' FAIL' : e.ok === true && e.phase === 'end' ? ' ok' : '';
        console.log(
          `[pr-plus][tl +${e.t}ms] ${e.phase} ${e.name}${dur}${ok}` +
            (e.err ? ` err=${e.err}` : '') +
            (e.note ? ` ${e.note}` : '')
        );
        publishFetchTimeline(tl);
        return e;
      },
      /**
       * Wrap a promise: logs start immediately, end/error when settled.
       * @template T
       * @param {string} name
       * @param {Promise<T>|T} promise
       * @param {object} [meta]
       * @returns {Promise<T>}
       */
      span(name, promise, meta = null) {
        const tStart = nowMs();
        tl.mark(name, 'start', meta || undefined);
        return Promise.resolve(promise).then(
          (value) => {
            const dur = Math.round(nowMs() - tStart);
            tl.mark(name, 'end', {
              ...(meta || {}),
              ok: true,
              dur,
            });
            return value;
          },
          (err) => {
            const dur = Math.round(nowMs() - tStart);
            tl.mark(name, 'error', {
              ...(meta || {}),
              ok: false,
              dur,
              err: String(err?.message || err || 'error').slice(0, 160),
            });
            throw err;
          }
        );
      },
      dump() {
        publishFetchTimeline(tl);
        return {
          label: tl.label,
          elapsedMs: Math.round(nowMs() - t0),
          events: events.slice(),
        };
      },
    };
    activeFetchTimeline = tl;
    tl.mark('session', 'begin', { note: label });
    return tl;
  }

  function getFetchTimeline() {
    return activeFetchTimeline;
  }

  function isEmbedPresentation(value) {
    const api = pageEmbedApi();
    if (api?.isEmbedPresentation) return api.isEmbedPresentation(value);
    return String(value || '').toLowerCase() === 'embed';
  }

  function parsePrPagePath(pathname) {
    const api = pageEmbedApi();
    if (typeof api?.parsePrPagePath === 'function') {
      return api.parsePrPagePath(pathname);
    }
    // Fallback if pure module missing (files|changes|sha|a..b)
    const path = String(pathname || '')
      .split('?')[0]
      .split('#')[0];
    const m = path.match(
      /^\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:\/(files|changes)(?:\/([^/]+))?)?\/?$/i
    );
    if (!m) return null;
    const tab = String(m[4] || '')
      .trim()
      .toLowerCase();
    if (tab && tab !== 'files' && tab !== 'changes') return null;
    const rest = String(m[5] || '').trim();
    let commitSha = null;
    let commitEndSha = null;
    if (rest) {
      const range = rest.match(/^([0-9a-f]{7,40})\.\.([0-9a-f]{7,40})$/i);
      if (range) {
        commitSha = range[1].toLowerCase();
        commitEndSha = range[2].toLowerCase();
      } else if (/^[0-9a-f]{7,40}$/i.test(rest)) {
        commitSha = rest.toLowerCase();
      }
    }
    return {
      owner: m[1],
      repo: m[2],
      number: Number(m[3]),
      page: tab === 'files' || tab === 'changes' ? 'diff' : 'conversation',
      tab: tab || 'conversation',
      commitSha,
      commitEndSha,
    };
  }

  /** Path + search + hash for embed soft-nav (includes prp_position deep-links). */
  function embedLocationKey() {
    if (typeof location === 'undefined') return '';
    return `${location.pathname || ''}${location.search || ''}${location.hash || ''}`;
  }

  /**
   * Merge pathname PR target with location.search/hash prp_* deep-link.
   * Pure helper when available (PRModalUriRoute.mergePathTargetWithUriRoute).
   */
  function withUriRouteFromLocation(pathTarget) {
    if (!pathTarget) return null;
    const loc =
      typeof location !== 'undefined'
        ? { search: location.search || '', hash: location.hash || '' }
        : { search: '', hash: '' };
    const uri = uriApi();
    if (typeof uri?.mergePathTargetWithUriRoute === 'function') {
      return uri.mergePathTargetWithUriRoute(pathTarget, loc);
    }
    // Fallback: parseLocationRoute only
    if (typeof uri?.parseLocationRoute === 'function') {
      const r = uri.parseLocationRoute(loc) || {};
      const page =
        r.page === 'diff' || r.page === 'conversation'
          ? r.page
          : pathTarget.page || null;
      const position =
        r.position != null && String(r.position).trim()
          ? String(r.position).trim()
          : null;
      return { ...pathTarget, page, position };
    }
    return { ...pathTarget, position: pathTarget.position || null };
  }

  /**
   * Parse full GH PR location (path + #diff- + prp_* query) when APIs available.
   */
  function parseGithubLocation() {
    const gh = githubRouteApi();
    let pathTarget = null;
    if (typeof gh?.parseGithubPrLocation === 'function' && typeof location !== 'undefined') {
      pathTarget = gh.parseGithubPrLocation({
        pathname: location.pathname,
        hash: location.hash,
      });
    }
    if (!pathTarget) {
      pathTarget = parsePrPagePath(
        typeof location !== 'undefined' ? location.pathname : ''
      );
    }
    return withUriRouteFromLocation(pathTarget);
  }

  /**
   * Apply path/hash route fields onto current. Always assign selection + commit
   * fields (null when absent) so soft-nav to /pull/N or /changes without #diff-
   * clears stale fileKey/startLine from a prior deep link.
   */
  function applyRouteFieldsFromTarget(target) {
    if (!target) return;
    if (target.page === 'diff' || target.page === 'conversation') {
      current.routePage = target.page;
    }
    if (target.position !== undefined) {
      current.routePosition = target.position || null;
    }
    current.routeCommitSha = target.commitSha || null;
    current.routeCommitEndSha = target.commitEndSha || null;
    current.routeFilePath = target.filePath || null;
    current.routeFileKey = target.fileKey || null;
    current.routeStartLine =
      target.startLine != null && Number.isFinite(Number(target.startLine))
        ? Number(target.startLine)
        : null;
    current.routeEndLine =
      target.endLine != null && Number.isFinite(Number(target.endLine))
        ? Number(target.endLine)
        : null;
    current.routeSide = target.side || null;
  }

  function embedHostId() {
    return pageEmbedApi()?.PAGE_EMBED_HOST_ID || 'prp-page-embed';
  }

  function embedActiveClass() {
    return pageEmbedApi()?.PAGE_EMBED_ACTIVE_CLASS || 'prp-embed-active';
  }

  /** Resilient selectors for GitHub main content under the global header. */
  function findGithubMainRegion(doc = document) {
    const selectors = [
      '.application-main',
      'main#js-repo-pjax-container',
      '#js-repo-pjax-container',
      '[data-turbo-body] main',
      'main[data-pjax-container]',
      'main',
    ];
    for (const sel of selectors) {
      try {
        const el = doc.querySelector(sel);
        if (el) return el;
      } catch {
        /* ignore */
      }
    }
    return null;
  }

  /**
   * Isolate keyboard from the buried GH PR SPA while embed is open.
   * Window capture + stopPropagation: document/body GH listeners never see the
   * event. Other window-capture listeners (pr+ hotkeys) still run.
   */
  let embedKeyShieldBound = false;
  function onEmbedKeyShield(e) {
    try {
      if (!current.open || !isEmbedPresentation(current.presentation)) return;
      // Only shield when embed host is actually mounted
      if (!document.getElementById(embedHostId())) return;
      e.stopPropagation();
    } catch {
      /* ignore */
    }
  }
  function ensureEmbedKeyShield() {
    if (embedKeyShieldBound) return;
    embedKeyShieldBound = true;
    const pe = pageEmbedApi();
    const events =
      (Array.isArray(pe?.PAGE_EMBED_KEY_SHIELD_EVENTS) &&
        pe.PAGE_EMBED_KEY_SHIELD_EVENTS) ||
      ['keydown', 'keyup', 'keypress'];
    for (const type of events) {
      try {
        window.addEventListener(type, onEmbedKeyShield, true);
      } catch {
        /* ignore */
      }
    }
  }

  function hideNativeMainChildren(main, embedEl) {
    if (!main) return;
    const api = pageEmbedApi();
    const mark =
      typeof api?.markNativeHidden === 'function'
        ? api.markNativeHidden
        : null;
    for (const child of [...main.children]) {
      if (child === embedEl) continue;
      if (mark) {
        mark(child);
        continue;
      }
      // Fallback if pure module missing
      if (child.getAttribute('data-prp-native-hidden') === '1') continue;
      child.setAttribute('data-prp-native-hidden', '1');
      child.style.setProperty('display', 'none', 'important');
      try {
        child.inert = true;
        child.setAttribute('data-prp-native-inert', '1');
      } catch {
        /* ignore */
      }
    }
    main.classList.add('prp-embed-main');
  }

  /**
   * Strong residual suppress: body-level GH SPA + chrome outside main + footers.
   * Cuts paint/layout and focus theft under full-window embed (modal is overlay-only).
   */
  function suppressGithubResidual(embedEl) {
    const api = pageEmbedApi();
    if (typeof api?.applyNativeResidualHide === 'function') {
      try {
        return api.applyNativeResidualHide(document, embedEl);
      } catch {
        /* fall through */
      }
    }
    // Fallback: body children + main children + footer
    try {
      const body = document.body;
      if (body) {
        for (const child of [...body.children]) {
          if (child === embedEl) continue;
          const id = child.id || '';
          if (id === embedHostId() || id === 'prp-modal-host') continue;
          const tag = String(child.tagName || '').toUpperCase();
          if (
            tag === 'SCRIPT' ||
            tag === 'STYLE' ||
            tag === 'LINK' ||
            tag === 'TEMPLATE' ||
            tag === 'META' ||
            tag === 'NOSCRIPT'
          ) {
            continue;
          }
          if (child.getAttribute('data-prp-native-hidden') === '1') continue;
          child.setAttribute('data-prp-native-hidden', '1');
          child.style.setProperty('display', 'none', 'important');
          try {
            (child as HTMLElement).inert = true;
            child.setAttribute('data-prp-native-inert', '1');
          } catch {
            /* ignore */
          }
        }
      }
    } catch {
      /* ignore */
    }
    hideGithubFooter();
    return null;
  }

  function hideGithubFooter() {
    const api = pageEmbedApi();
    if (typeof api?.applyFooterHide === 'function') {
      try {
        return api.applyFooterHide(document);
      } catch {
        /* ignore */
      }
    }
    return 0;
  }

  function restoreGithubFooter() {
    const api = pageEmbedApi();
    if (typeof api?.restoreFooters === 'function') {
      try {
        return api.restoreFooters(document);
      } catch {
        /* ignore */
      }
    }
    // Fallback if pure module missing
    try {
      document
        .querySelectorAll('[data-prp-footer-hidden="1"]')
        .forEach((el) => {
          el.removeAttribute('data-prp-footer-hidden');
          el.style?.removeProperty?.('display');
        });
    } catch {
      /* ignore */
    }
    return 0;
  }

  function restoreNativeMain() {
    try {
      document.documentElement.classList.remove(embedActiveClass());
      document.body?.classList?.remove(embedActiveClass());
    } catch {
      /* ignore */
    }
    try {
      const api = pageEmbedApi();
      if (typeof api?.restoreNativeHiddenNodes === 'function') {
        api.restoreNativeHiddenNodes(document);
      } else {
        document
          .querySelectorAll('[data-prp-native-hidden="1"]')
          .forEach((el) => {
            el.removeAttribute('data-prp-native-hidden');
            el.style.removeProperty('display');
            el.style.removeProperty('content-visibility');
            if (el.getAttribute('data-prp-native-inert') === '1') {
              try {
                (el as HTMLElement).inert = false;
              } catch {
                /* ignore */
              }
              el.removeAttribute('data-prp-native-inert');
            }
          });
      }
      document.querySelectorAll('.prp-embed-main').forEach((el) => {
        el.classList.remove('prp-embed-main');
      });
    } catch {
      /* ignore */
    }
    restoreGithubFooter();
    try {
      const host = document.getElementById(embedHostId());
      if (host) host.remove();
    } catch {
      /* ignore */
    }
  }

  /**
   * Full-window embed host.
   * Mount on document.body (NOT inside .application-main): GH ancestors often
   * use transform/filter which make position:fixed relative to a zero-height
   * box and the panel disappears. Still hide native main + footer.
   */
  function ensureEmbedHost() {
    void ensureAssets();
    const id = embedHostId();
    const mountParent = document.body || document.documentElement;
    let host = document.getElementById(id);
    if (!host) {
      host = document.createElement('div');
      host.id = id;
      host.className = 'prp-page-embed';
      host.setAttribute('data-prp-embed', '1');
      mountParent.appendChild(host);
    } else if (host.parentElement !== mountParent) {
      // Soft-nav / old code may have left host under main — reparent to body
      try {
        mountParent.appendChild(host);
      } catch {
        /* ignore */
      }
    }
    stampHostCssReady(host);
    const main = findGithubMainRegion();
    if (main) hideNativeMainChildren(main, host);
    // Body-level residual + header/flash chrome (stronger than main-only hide)
    suppressGithubResidual(host);
    // Block GH SPA shortcuts under the fixed cover (pr+ uses window listeners)
    ensureEmbedKeyShield();
    document.documentElement.classList.add(embedActiveClass());
    try {
      document.body?.classList?.add(embedActiveClass());
    } catch {
      /* ignore */
    }
    // Footer also covered by residual, but keep explicit call for pure API path
    hideGithubFooter();
    return host;
  }

  /** Tear down embed and show original GitHub PR UI (same tab). */
  function restoreNativeView() {
    if (!isEmbedPresentation(current.presentation) && !document.getElementById(embedHostId())) {
      return { ok: false, reason: 'not-embed' };
    }
    closeModal();
    // Native GH PR chrome is visible again — offer pr+ re-entry toggle
    try {
      ensureGithubPrToggle();
    } catch {
      /* ignore */
    }
    return { ok: true };
  }

  const GH_PR_TOGGLE_ID = 'prp-gh-open-toggle';

  /**
   * Find a mount point next to the native GitHub PR header actions / title row.
   */
  function findGithubPrHeaderMount(doc = document) {
    const selectors = [
      '.gh-header-actions',
      '.gh-header .gh-header-actions',
      '[data-testid="pull-request-header"] .gh-header-actions',
      '.js-pull-header-details .gh-header-actions',
      // React PR header action clusters
      '[data-component="PH_Actions"]',
      '.gh-header-meta',
      '.gh-header-show .gh-header-actions',
      // Fallback: conversation tab nav row
      'nav.js-repo-nav, nav[aria-label="Pull request tabs"]',
      '.UnderlineNav-body',
    ];
    for (const sel of selectors) {
      try {
        const el = doc.querySelector(sel);
        if (el) return el;
      } catch {
        /* ignore */
      }
    }
    // Last resort: PR title heading parent
    try {
      const h1 =
        doc.querySelector('.js-issue-title') ||
        doc.querySelector('h1.gh-header-title') ||
        doc.querySelector('[data-testid="issue-title"]');
      if (h1?.parentElement) return h1.parentElement;
    } catch {
      /* ignore */
    }
    return null;
  }
