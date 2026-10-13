/**
 * Glue a portaled selection dock to its in-flow row.
 *
 * `.prp-vlist__window` is a stacking context (`translate3d`). The file-focus
 * outline and the unfocused dim are later siblings of that window, so they
 * paint over the dock no matter which z-index it sets inside the window.
 * The dock is portaled into `.prp-selection-float-layer` (above both).
 * This writes the shell's top/height in that layer's coordinates so the
 * dock's `top: 100%` and split-side rules still hang off the anchor row.
 *
 * `root` must be the `.prp-vlist` that owns the layer. A wider root would
 * see the sticky header clone first.
 */
export function syncSelectionFloatLayer(
  root: ParentNode | null | undefined
): void {
  if (!root || typeof root.querySelector !== 'function') return;
  let anchor: HTMLElement | null = null;
  let shell: HTMLElement | null = null;
  try {
    anchor = root.querySelector(
      '[data-prp-selection-anchor="1"]'
    ) as HTMLElement | null;
    shell = root.querySelector(
      '[data-prp-selection-float-shell="1"]'
    ) as HTMLElement | null;
  } catch {
    return;
  }
  if (!anchor || !shell) return;
  const layer = shell.parentElement;
  if (
    !layer ||
    typeof anchor.getBoundingClientRect !== 'function' ||
    typeof layer.getBoundingClientRect !== 'function'
  ) {
    return;
  }
  const a = anchor.getBoundingClientRect();
  const l = layer.getBoundingClientRect();
  const top = `${a.top - l.top}px`;
  const height = `${a.height}px`;
  if (shell.style.top !== top) shell.style.top = top;
  if (shell.style.height !== height) shell.style.height = height;
  const extra = String(anchor.className || '')
    .split(/\s+/)
    .filter((c) => c.startsWith('prp-sel-dock-host--'))
    .join(' ');
  const next = extra
    ? `prp-portal prp-sel-dock-host ${extra}`
    : 'prp-portal prp-sel-dock-host';
  if (shell.className !== next) shell.className = next;
}
