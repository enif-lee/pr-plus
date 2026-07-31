/**
 * GH ⌘K dialog can remain :modal after close — recover must reparent out of top layer.
 */
import { describe, expect, test } from '@rstest/core';
import {
  isGithubCommandPaletteOpen,
  isGithubCommandPaletteStuck,
  recoverGithubCommandPaletteTopLayer,
} from '../src/pr-list-focus';

function makeDialogDoc(opts: { open?: boolean; modal?: boolean } = {}) {
  const open = Boolean(opts.open);
  let modal = opts.modal !== undefined ? Boolean(opts.modal) : open;
  const d: any = {
    id: 'command-palette-pjax-container',
    open,
    className: 'js-command-palette-dialog',
    hasAttribute(name: string) {
      return name === 'open' && this.open;
    },
    removeAttribute(name: string) {
      if (name === 'open') this.open = false;
    },
    close() {
      this.open = false;
      // GitHub bug simulation: close() does not leave top layer
    },
    matches(sel: string) {
      if (sel === ':modal') return modal;
      return false;
    },
    // set after parent attach
    parentNode: null as any,
    nextSibling: null as any,
  };
  const kids: any[] = [d];
  const parent = {
    childNodes: kids,
    removeChild(node: any) {
      const i = kids.indexOf(node);
      if (i >= 0) kids.splice(i, 1);
      node.parentNode = null;
      // Leaving the tree drops top-layer membership
      modal = false;
      return node;
    },
    insertBefore(node: any, _ref: any) {
      kids.unshift(node);
      node.parentNode = parent;
      return node;
    },
    appendChild(node: any) {
      kids.push(node);
      node.parentNode = parent;
      return node;
    },
  };
  d.parentNode = parent;

  const doc: any = {
    getElementById(id: string) {
      return id === 'command-palette-pjax-container' ? d : null;
    },
    querySelector() {
      return null;
    },
  };
  return { doc, d, getModal: () => modal, setModal: (v: boolean) => { modal = v; } };
}

describe('recoverGithubCommandPaletteTopLayer', () => {
  test('no-ops when dialog is legitimately open', () => {
    const { doc, d } = makeDialogDoc({ open: true, modal: true });
    expect(isGithubCommandPaletteOpen(doc)).toBe(true);
    expect(recoverGithubCommandPaletteTopLayer(doc)).toBe(false);
    expect(d.open).toBe(true);
  });

  test('reparents stuck :modal after close (open=false)', () => {
    const { doc, d, getModal } = makeDialogDoc({ open: false, modal: true });
    expect(isGithubCommandPaletteStuck(doc)).toBe(true);
    expect(isGithubCommandPaletteOpen(doc)).toBe(false);
    const recovered = recoverGithubCommandPaletteTopLayer(doc);
    expect(recovered).toBe(true);
    expect(getModal()).toBe(false);
    expect(isGithubCommandPaletteStuck(doc)).toBe(false);
    expect(d.open).toBe(false);
  });

  test('no-ops when not in top layer', () => {
    const { doc } = makeDialogDoc({ open: false, modal: false });
    expect(isGithubCommandPaletteStuck(doc)).toBe(false);
    expect(recoverGithubCommandPaletteTopLayer(doc)).toBe(false);
  });
});
