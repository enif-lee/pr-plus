/**
 * Structural: Tags/Commits/Files not eagerly fetched on conversation mount;
 * Diff still ensures files when needed.
 */
import { describe, expect, test } from '@rstest/core';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

describe('lazy aside wiring', () => {
  test('Tags are not fetched on PrModalApp mount effect', () => {
    const impl = read('src/modal/app/PrModalApp.impl.tsx');
    // ensurePrTags is the loader; must not be in a mount useEffect without section gate
    expect(impl).toMatch(/const ensurePrTags = useCallback/);
    // Wired to ConversationView only via onEnsurePrTags (section first-open)
    expect(impl).toMatch(/onEnsurePrTags=\{ensurePrTags\}/);
    // ensurePrTags is not invoked from a bare useEffect body
    const effectCallsEnsure =
      /useEffect\(\s*\(\)\s*=>\s*\{[^}]*ensurePrTags\s*\(/.test(impl);
    expect(effectCallsEnsure).toBe(false);
  });

  test('ConversationView gates Tags/Commits/Files on onFirstOpen', () => {
    const view = read('src/modal/views/conversation/ConversationView.tsx');
    expect(view).toMatch(/onFirstOpen=\{\(\)\s*=>\s*\{[\s\S]*?onEnsurePrTags/);
    expect(view).toMatch(/onFirstOpen=\{\(\)\s*=>\s*\{[\s\S]*?onEnsureAllCommits/);
    expect(view).toMatch(/onFirstOpen=\{\(\)\s*=>\s*\{[\s\S]*?onEnsureAllFiles/);
    expect(view).toMatch(/detail\.commitsCount/);
    expect(view).toMatch(/detail\.changedFiles/);
  });

  test('AsideSection supports onFirstOpen', () => {
    const sec = read('src/modal/components/common/AsideSection.tsx');
    expect(sec).toMatch(/onFirstOpen/);
    expect(sec).toMatch(/firstOpenFired/);
  });

  test('host defers files/commits side-fetch network on open', () => {
    const side = read('src/host/modules/side-fetch-progress-assets.ts');
    // Must credit without fetchPrFiles/fetchPrCommits on the open path
    expect(side).toMatch(/Files list is deferred|files list is deferred|Deferred/i);
    expect(side).toMatch(/Commits list deferred|commits list deferred/i);
    // claim('files') block should not call api.fetchPrFiles in the deferred path
    const filesClaim = side.slice(
      side.indexOf("if (claim('files'))"),
      side.indexOf("if (claim('comments'))")
    );
    expect(filesClaim).not.toMatch(/api\.fetchPrFiles/);
    const commitsClaim = side.slice(
      side.indexOf("if (claim('commits'))"),
      side.indexOf('// checks needs headSha')
    );
    expect(commitsClaim).not.toMatch(/api\.fetchPrCommits/);
  });

  test('Diff layout still ensures files when empty', () => {
    const impl = read('src/modal/app/PrModalApp.impl.tsx');
    expect(impl).toMatch(/layoutMode !== LAYOUT_DIFF/);
    expect(impl).toMatch(/void ensureAllFiles\(\)/);
    // DiffWorkspace still calls ensureAllFiles on search focus
    const diff = read('src/modal/views/pr-modal/DiffWorkspace.tsx');
    expect(diff).toMatch(/ensureAllFiles/);
  });

  test('tags-cache pure module is present', () => {
    const cache = read('src/modal/lib/tags-cache.ts');
    expect(cache).toMatch(/export function mergeNewestFirstTagPage/);
    expect(cache).toMatch(/export function filterTagsByCommitShas/);
    expect(cache).toMatch(/export function isRepoTagsCacheFresh/);
  });
});
