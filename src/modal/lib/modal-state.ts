/** @module modal/lib/modal-state */
/**
 * Pure open/close + selection state for the PR modal (unit-tested without DOM).
 */

export function createInitialModalState() {
  return {
    open: false,
    owner: null as any,
    repo: null as any,
    number: null as any,
    layoutMode: 'centered',
    loading: false,
    error: null as any,
    detail: null as any,
    files: [] as any[],
    virtualRows: [] as any[],
    scrollTop: 0,
    viewportHeight: 480,
    rowHeight: 20,
    searchQuery: '',
    searchHits: [] as any[],
    searchHitIndex: -1,
    activeFilePath: null as any,
  };
}

export function openModal(state: any, { owner, repo, number }: any) {
  return {
    ...state,
    open: true,
    owner,
    repo,
    number,
    layoutMode: 'centered',
    loading: true,
    error: null,
    detail: null,
    files: [],
    virtualRows: [],
    scrollTop: 0,
    searchQuery: '',
    searchHits: [],
    searchHitIndex: -1,
    activeFilePath: null,
  };
}

export function closeModal(state: any) {
  return {
    ...createInitialModalState(),
    // keep measured geometry prefs
    viewportHeight: state.viewportHeight,
    rowHeight: state.rowHeight,
  };
}

export function setLayoutMode(state: any, layoutMode: any) {
  return { ...state, layoutMode };
}

export function setScrollTop(state: any, scrollTop: any) {
  return { ...state, scrollTop: Math.max(0, scrollTop) };
}

export function setSearchResults(state: any, query: any, hits: any, hitIndex = 0) {
  const list = Array.isArray(hits) ? hits : [];
  const idx =
    list.length === 0 ? -1 : Math.max(0, Math.min(hitIndex, list.length - 1));
  const hit = idx >= 0 ? list[idx] : null;
  return {
    ...state,
    searchQuery: query || '',
    searchHits: list,
    searchHitIndex: idx,
    activeFilePath: hit?.filePath || state.activeFilePath,
  };
}

export function selectSearchHit(state: any, hitIndex: any) {
  const list = state.searchHits || [];
  if (!list.length) return { ...state, searchHitIndex: -1 };
  const idx = ((hitIndex % list.length) + list.length) % list.length;
  const hit = list[idx];
  return {
    ...state,
    searchHitIndex: idx,
    activeFilePath: hit?.filePath || state.activeFilePath,
  };
}
