/**
 * Lazy-load Mermaid (ESM chunk at dist/mermaid.esm.js).
 * Content-script safe: dynamic import(chrome.runtime.getURL(...)).
 * Keeps the main modal IIFE free of the multi-MB diagram engine.
 */

let loadPromise: Promise<any | null> | null = null;
let initializedForTheme: string | null = null;

/** Extension URL for the Mermaid ESM chunk, or null outside Chrome. */
export function mermaidChunkUrl(): string | null {
  try {
    const chromeApi = (globalThis as any).chrome;
    if (chromeApi?.runtime?.getURL) {
      return chromeApi.runtime.getURL('src/modal/dist/mermaid.esm.js');
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * esbuild may wrap default exports multiple times (`{ default: { default: api } }`).
 * Walk until we find a real mermaid surface with render().
 */
export function unwrapMermaidModule(mod: unknown): any | null {
  let cur: any = mod;
  for (let i = 0; i < 6 && cur; i++) {
    if (typeof cur.render === 'function' && typeof cur.initialize === 'function') {
      return cur;
    }
    if (cur && typeof cur === 'object' && 'default' in cur) {
      cur = cur.default;
      continue;
    }
    break;
  }
  return typeof cur?.render === 'function' ? cur : null;
}

function isUsableMermaid(api: any): boolean {
  return Boolean(api && typeof api.render === 'function');
}

/** Light vs dark from open modal shell (for gray palette only). */
export function resolveMermaidColorMode(): 'light' | 'dark' {
  try {
    const el =
      typeof document !== 'undefined'
        ? document.querySelector('.prp-overlay[data-color-mode]')
        : null;
    const mode = el?.getAttribute('data-color-mode') || '';
    if (mode === 'dark') return 'dark';
  } catch {
    /* ignore */
  }
  return 'light';
}

/**
 * Mermaid theme name follows shell light/dark:
 * - light → neutral (gray)
 * - dark  → dark
 */
export function resolveMermaidTheme(): 'neutral' | 'dark' {
  return resolveMermaidColorMode() === 'dark' ? 'dark' : 'neutral';
}

/**
 * Grayscale themeVariables for a quiet, monochrome diagram (not bright multi-color).
 * `look: 'handDrawn'` is set in initMermaid for sketch-style strokes.
 */
export function grayMermaidThemeVariables(mode: 'light' | 'dark' = 'light'): Record<string, string> {
  if (mode === 'dark') {
    return {
      darkMode: 'true',
      background: '#0d1117',
      mainBkg: '#21262d',
      primaryColor: '#30363d',
      primaryTextColor: '#e6edf3',
      primaryBorderColor: '#8b949e',
      secondaryColor: '#161b22',
      secondaryTextColor: '#c9d1d9',
      secondaryBorderColor: '#6e7681',
      tertiaryColor: '#21262d',
      tertiaryTextColor: '#c9d1d9',
      tertiaryBorderColor: '#484f58',
      lineColor: '#8b949e',
      textColor: '#e6edf3',
      nodeBorder: '#8b949e',
      clusterBkg: '#161b22',
      clusterBorder: '#484f58',
      titleColor: '#e6edf3',
      edgeLabelBackground: '#0d1117',
      actorBkg: '#21262d',
      actorBorder: '#8b949e',
      actorTextColor: '#e6edf3',
      actorLineColor: '#8b949e',
      signalColor: '#c9d1d9',
      signalTextColor: '#e6edf3',
      labelBoxBkgColor: '#21262d',
      labelBoxBorderColor: '#8b949e',
      labelTextColor: '#e6edf3',
      loopTextColor: '#c9d1d9',
      noteBkgColor: '#30363d',
      noteTextColor: '#e6edf3',
      noteBorderColor: '#8b949e',
      activationBkgColor: '#30363d',
      activationBorderColor: '#8b949e',
      sequenceNumberColor: '#0d1117',
      sectionBkgColor: '#21262d',
      altSectionBkgColor: '#161b22',
      sectionBkgColor2: '#30363d',
      taskBkgColor: '#30363d',
      taskBorderColor: '#8b949e',
      taskTextColor: '#e6edf3',
      taskTextDarkColor: '#e6edf3',
      taskTextLightColor: '#0d1117',
      taskTextOutsideColor: '#c9d1d9',
      activeTaskBkgColor: '#484f58',
      activeTaskBorderColor: '#8b949e',
      gridColor: '#30363d',
      doneTaskBkgColor: '#21262d',
      doneTaskBorderColor: '#6e7681',
      critBkgColor: '#3d2a2a',
      critBorderColor: '#8b949e',
      todayLineColor: '#8b949e',
      cScale0: '#21262d',
      cScale1: '#30363d',
      cScale2: '#484f58',
      cScale3: '#6e7681',
      cScale4: '#8b949e',
      cScale5: '#a1a7ad',
      cScale6: '#b1bac4',
      cScale7: '#c9d1d9',
      cScale8: '#d0d7de',
      cScale9: '#e6edf3',
      cScale10: '#f0f6fc',
      cScale11: '#ffffff',
      pie1: '#21262d',
      pie2: '#30363d',
      pie3: '#484f58',
      pie4: '#6e7681',
      pie5: '#8b949e',
      pie6: '#a1a7ad',
      pie7: '#b1bac4',
      pie8: '#c9d1d9',
      pie9: '#d0d7de',
      pie10: '#e6edf3',
      pie11: '#f0f6fc',
      pie12: '#ffffff',
      pieTitleTextColor: '#e6edf3',
      pieSectionTextColor: '#e6edf3',
      pieLegendTextColor: '#c9d1d9',
      pieStrokeColor: '#8b949e',
      pieOuterStrokeColor: '#8b949e',
    };
  }
  // Light gray monochrome (GitHub-ish neutrals)
  return {
    darkMode: 'false',
    background: '#ffffff',
    mainBkg: '#f6f8fa',
    primaryColor: '#eaeef2',
    primaryTextColor: '#1f2328',
    primaryBorderColor: '#8c959f',
    secondaryColor: '#f6f8fa',
    secondaryTextColor: '#424a53',
    secondaryBorderColor: '#afb8c1',
    tertiaryColor: '#ffffff',
    tertiaryTextColor: '#1f2328',
    tertiaryBorderColor: '#d0d7de',
    lineColor: '#656d76',
    textColor: '#1f2328',
    nodeBorder: '#8c959f',
    clusterBkg: '#f6f8fa',
    clusterBorder: '#d0d7de',
    titleColor: '#1f2328',
    edgeLabelBackground: '#ffffff',
    actorBkg: '#f6f8fa',
    actorBorder: '#8c959f',
    actorTextColor: '#1f2328',
    actorLineColor: '#656d76',
    signalColor: '#424a53',
    signalTextColor: '#1f2328',
    labelBoxBkgColor: '#f6f8fa',
    labelBoxBorderColor: '#8c959f',
    labelTextColor: '#1f2328',
    loopTextColor: '#424a53',
    noteBkgColor: '#eaeef2',
    noteTextColor: '#1f2328',
    noteBorderColor: '#8c959f',
    activationBkgColor: '#eaeef2',
    activationBorderColor: '#8c959f',
    sequenceNumberColor: '#ffffff',
    sectionBkgColor: '#f6f8fa',
    altSectionBkgColor: '#ffffff',
    sectionBkgColor2: '#eaeef2',
    taskBkgColor: '#eaeef2',
    taskBorderColor: '#8c959f',
    taskTextColor: '#1f2328',
    taskTextDarkColor: '#1f2328',
    taskTextLightColor: '#ffffff',
    taskTextOutsideColor: '#424a53',
    activeTaskBkgColor: '#d0d7de',
    activeTaskBorderColor: '#656d76',
    gridColor: '#d0d7de',
    doneTaskBkgColor: '#f6f8fa',
    doneTaskBorderColor: '#afb8c1',
    critBkgColor: '#f0e6e6',
    critBorderColor: '#8c959f',
    todayLineColor: '#656d76',
    cScale0: '#f6f8fa',
    cScale1: '#eaeef2',
    cScale2: '#d0d7de',
    cScale3: '#afb8c1',
    cScale4: '#8c959f',
    cScale5: '#6e7781',
    cScale6: '#656d76',
    cScale7: '#424a53',
    cScale8: '#32383f',
    cScale9: '#24292f',
    cScale10: '#1f2328',
    cScale11: '#0d1117',
    pie1: '#f6f8fa',
    pie2: '#eaeef2',
    pie3: '#d0d7de',
    pie4: '#afb8c1',
    pie5: '#8c959f',
    pie6: '#6e7781',
    pie7: '#656d76',
    pie8: '#424a53',
    pie9: '#32383f',
    pie10: '#24292f',
    pie11: '#1f2328',
    pie12: '#0d1117',
    pieTitleTextColor: '#1f2328',
    pieSectionTextColor: '#1f2328',
    pieLegendTextColor: '#424a53',
    pieStrokeColor: '#8c959f',
    pieOuterStrokeColor: '#8c959f',
  };
}

/**
 * Ensure globalThis.mermaid is a real engine.
 * @returns mermaid API or null if unavailable
 */
export async function ensureMermaid(): Promise<any | null> {
  const existing = unwrapMermaidModule((globalThis as any).mermaid);
  if (isUsableMermaid(existing)) {
    (globalThis as any).mermaid = existing;
    return existing;
  }

  if (!loadPromise) {
    loadPromise = (async () => {
      const url = mermaidChunkUrl();
      if (!url) {
        try {
          console.warn('[pr+] mermaid chunk URL unavailable (not in extension context)');
        } catch {
          /* ignore */
        }
        return null;
      }
      try {
        const mod = await import(
          /* @vite-ignore */ /* webpackIgnore: true */ url
        );
        const api = unwrapMermaidModule(mod);
        if (!isUsableMermaid(api)) {
          try {
            console.warn('[pr+] mermaid chunk loaded but render() missing', mod);
          } catch {
            /* ignore */
          }
          return null;
        }
        (globalThis as any).mermaid = api;
        return api;
      } catch (err) {
        try {
          console.warn('[pr+] failed to load mermaid chunk', err);
        } catch {
          /* ignore */
        }
        // Allow retry on next fence
        loadPromise = null;
        return null;
      }
    })();
  }

  return loadPromise;
}

/** Sketch stroke style (always). */
export const MERMAID_LOOK = 'handDrawn' as const;
/** @deprecated use resolveMermaidTheme() — light shell uses neutral */
export const MERMAID_THEME = 'neutral' as const;

/**
 * Initialize mermaid (idempotent per theme+look).
 * look: handDrawn always; theme: neutral (light) | dark (dark shell).
 */
export function initMermaid(api: any, themeOverride?: string): void {
  if (!api || typeof api.initialize !== 'function') return;
  const theme =
    themeOverride === 'dark' || themeOverride === 'neutral'
      ? themeOverride
      : resolveMermaidTheme();
  const key = `${theme}:${MERMAID_LOOK}`;
  if (initializedForTheme === key) return;
  try {
    api.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme,
      look: MERMAID_LOOK,
      fontFamily: 'inherit',
      flowchart: { htmlLabels: true, useMaxWidth: true },
      sequence: { useMaxWidth: true },
      gantt: { useMaxWidth: true },
    });
    initializedForTheme = key;
  } catch (err) {
    try {
      console.warn('[pr+] mermaid.initialize failed', err);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Read back theme/look from a mermaid instance after initialize (for tests / debug).
 */
export function readMermaidInitConfig(api: any): { theme: string | null; look: string | null } {
  try {
    const cfg =
      (typeof api?.mermaidAPI?.getConfig === 'function' && api.mermaidAPI.getConfig()) ||
      (typeof api?.getConfig === 'function' && api.getConfig()) ||
      null;
    if (!cfg || typeof cfg !== 'object') return { theme: null, look: null };
    return {
      theme: cfg.theme != null ? String(cfg.theme) : null,
      look: cfg.look != null ? String(cfg.look) : null,
    };
  } catch {
    return { theme: null, look: null };
  }
}

export function mermaidWasInitialized(): boolean {
  return initializedForTheme != null;
}

/** Test helper: reset load state */
export function __resetMermaidLazyForTests(): void {
  loadPromise = null;
  initializedForTheme = null;
}
