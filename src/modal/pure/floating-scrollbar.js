/**
 * Pure floating (overlay) scrollbar metrics + DOM attach helper.
 * Mirrors src/modal/lib/floating-scrollbar.ts for content-script / host use.
 */
(function (root) {
  const MIN_THUMB = 28;
  const FLOATING_SCROLLBAR_IDLE_MS = 1000;

  function floatingScrollbarMetrics(scrollPos, clientSize, scrollSize) {
    const st = Number(scrollPos) || 0;
    const ch = Number(clientSize) || 0;
    const sh = Number(scrollSize) || 0;
    if (!(ch > 0) || !(sh > ch + 1)) {
      return {
        needed: false,
        thumbSize: 0,
        thumbOffset: 0,
        trackSize: Math.max(0, ch),
        thumbHeight: 0,
        thumbTop: 0,
        trackHeight: Math.max(0, ch),
      };
    }
    const thumbSize = Math.max(MIN_THUMB, Math.round((ch / sh) * ch));
    const maxScroll = sh - ch;
    const maxOffset = ch - thumbSize;
    const thumbOffset =
      maxScroll <= 0
        ? 0
        : Math.round((Math.min(st, maxScroll) / maxScroll) * maxOffset);
    const clamped = Math.max(0, Math.min(maxOffset, thumbOffset));
    return {
      needed: true,
      thumbSize,
      thumbOffset: clamped,
      trackSize: ch,
      thumbHeight: thumbSize,
      thumbTop: clamped,
      trackHeight: ch,
    };
  }

  function scrollTopFromThumbDrag(pointerInTrack, thumbSize, clientSize, scrollSize) {
    const y = Number(pointerInTrack);
    const th = Number(thumbSize);
    const ch = Number(clientSize);
    const sh = Number(scrollSize);
    if (!Number.isFinite(y) || !(ch > 0) || !(sh > ch)) return 0;
    const maxTop = Math.max(1, ch - Math.max(MIN_THUMB, th || MIN_THUMB));
    const maxScroll = sh - ch;
    const top = Math.max(0, Math.min(maxTop, y - (th || MIN_THUMB) / 2));
    return Math.round((top / maxTop) * maxScroll);
  }

  /**
   * Attach overlay scrollbar to a scroller inside a `.prp-scroll-float-host`.
   * @param {HTMLElement} scroller
   * @param {{ host?: HTMLElement|null, idleMs?: number }} [opts]
   * @returns {() => void} destroy
   */
  function attachFloatingScrollbar(scroller, opts) {
    if (!scroller || typeof scroller.addEventListener !== 'function') {
      return function noop() {};
    }
    const host =
      (opts && opts.host) ||
      scroller.closest?.('.prp-scroll-float-host') ||
      scroller.parentElement;
    if (!host) return function noop() {};

    scroller.classList.add('prp-scroll-float');
    host.classList.add('prp-scroll-float-host');

    let track = host.querySelector(':scope > .prp-float-sb');
    if (!track) {
      track = document.createElement('div');
      track.className = 'prp-float-sb';
      track.setAttribute('aria-hidden', 'true');
      const thumb = document.createElement('div');
      thumb.className = 'prp-float-sb__thumb';
      track.appendChild(thumb);
      host.appendChild(track);
    }
    const thumb = track.querySelector('.prp-float-sb__thumb');
    if (!thumb) return function noop() {};

    const idleMs =
      Number.isFinite(opts?.idleMs) && opts.idleMs >= 0
        ? Number(opts.idleMs)
        : FLOATING_SCROLLBAR_IDLE_MS;

    let hideTimer = null;
    let dragging = false;
    let drag = null;
    let metrics = floatingScrollbarMetrics(0, 0, 0);

    function clearHide() {
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
    }

    function scheduleHide() {
      clearHide();
      if (dragging) return;
      hideTimer = setTimeout(() => {
        track.classList.remove('prp-float-sb--active');
        hideTimer = null;
      }, idleMs);
    }

    function markMoving() {
      track.classList.add('prp-float-sb--active');
      scheduleHide();
    }

    function recompute() {
      metrics = floatingScrollbarMetrics(
        scroller.scrollTop,
        scroller.clientHeight,
        scroller.scrollHeight
      );
      if (!metrics.needed) {
        track.style.display = 'none';
        track.classList.remove('prp-float-sb--active');
        return;
      }
      track.style.display = '';
      thumb.style.height = `${metrics.thumbSize}px`;
      thumb.style.transform = `translateY(${metrics.thumbOffset}px)`;
    }

    function onScroll() {
      recompute();
      markMoving();
    }

    function onThumbDown(e) {
      if (!metrics.needed) return;
      e.preventDefault();
      e.stopPropagation();
      try {
        thumb.setPointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }
      dragging = true;
      clearHide();
      track.classList.add('prp-float-sb--active');
      drag = {
        pointerId: e.pointerId,
        startY: e.clientY,
        startScroll: scroller.scrollTop,
      };
    }

    function onThumbMove(e) {
      if (!drag || drag.pointerId !== e.pointerId) return;
      const maxScroll = scroller.scrollHeight - scroller.clientHeight;
      if (maxScroll <= 0) return;
      const maxOffset = Math.max(1, scroller.clientHeight - metrics.thumbSize);
      const d = e.clientY - drag.startY;
      const next = drag.startScroll + (d / maxOffset) * maxScroll;
      scroller.scrollTop = Math.max(0, Math.min(maxScroll, next));
      track.classList.add('prp-float-sb--active');
    }

    function onThumbUp(e) {
      if (!drag || drag.pointerId !== e.pointerId) return;
      drag = null;
      dragging = false;
      markMoving();
    }

    function onTrackDown(e) {
      if (!metrics.needed) return;
      if (e.target && e.target.closest && e.target.closest('.prp-float-sb__thumb')) {
        return;
      }
      const rect = track.getBoundingClientRect();
      const y = e.clientY - rect.top;
      scroller.scrollTop = scrollTopFromThumbDrag(
        y,
        metrics.thumbSize,
        scroller.clientHeight,
        scroller.scrollHeight
      );
      markMoving();
    }

    scroller.addEventListener('scroll', onScroll, { passive: true });
    thumb.addEventListener('pointerdown', onThumbDown);
    thumb.addEventListener('pointermove', onThumbMove);
    thumb.addEventListener('pointerup', onThumbUp);
    thumb.addEventListener('pointercancel', onThumbUp);
    track.addEventListener('pointerdown', onTrackDown);

    let ro = null;
    if (typeof ResizeObserver === 'function') {
      ro = new ResizeObserver(() => recompute());
      ro.observe(scroller);
      ro.observe(host);
    }
    let mo = null;
    if (typeof MutationObserver === 'function') {
      mo = new MutationObserver(() => recompute());
      mo.observe(scroller, { childList: true, subtree: true, characterData: true });
    }

    const raf = requestAnimationFrame(() => recompute());
    recompute();

    return function destroy() {
      cancelAnimationFrame(raf);
      clearHide();
      scroller.removeEventListener('scroll', onScroll);
      thumb.removeEventListener('pointerdown', onThumbDown);
      thumb.removeEventListener('pointermove', onThumbMove);
      thumb.removeEventListener('pointerup', onThumbUp);
      thumb.removeEventListener('pointercancel', onThumbUp);
      track.removeEventListener('pointerdown', onTrackDown);
      ro?.disconnect();
      mo?.disconnect();
      try {
        track.remove();
      } catch {
        /* ignore */
      }
    };
  }

  const api = {
    FLOATING_SCROLLBAR_IDLE_MS,
    floatingScrollbarMetrics,
    scrollTopFromThumbDrag,
    scrollPosFromThumbDrag: scrollTopFromThumbDrag,
    attachFloatingScrollbar,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.PRModalFloatingScrollbar = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
