const KEY = 'demo-pr1-prefs';

export type DemoPrefs = { treeView: boolean; singleFile: boolean };

export function loadPrefs(): DemoPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { treeView: true, singleFile: false };
    return { treeView: true, singleFile: false, ...JSON.parse(raw) };
  } catch {
    return { treeView: true, singleFile: false };
  }
}

export function savePrefs(p: DemoPrefs): void {
  localStorage.setItem(KEY, JSON.stringify(p));
}
