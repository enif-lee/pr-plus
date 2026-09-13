/**
 * Comment/description @ typeahead: mentionableUsers directory (login + name +
 * avatar), not the collaborator-only reviewer picker. Insert remains @login.
 * Drives shipped markdown-composer + composer markup wiring.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from '@rstest/core';
import {
  applyMentionInsertion,
  detectMentionTrigger,
  filterMentions,
  mergeMentionCandidates,
  mentionInsertLogin,
  mentionSuggestionView,
} from '../src/modal/lib/markdown-composer';
import { peopleDirectoryKindForPicker } from '../src/modal/lib/searchable-select';
import {
  MENTIONABLE_USERS_QUERY,
  mapDirectoryPeopleNodes,
  searchRepoPeople,
} from '../src/fetch/people-directory';

const root = path.resolve(__dirname, '..');

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const localSeenLogins = ['alice', 'bob', 'enif-lee'];
const mentionableDirectory = [
  { login: 'alice', name: 'Alice Example', avatarUrl: 'https://a' },
  {
    login: 'org-ghost',
    name: 'Ada Lovelace',
    avatarUrl: 'https://avatars.example/ghost',
  },
  { login: 'octocat', name: 'The Octocat', avatarUrl: 'https://o' },
];

describe('filterMentions / mentionSuggestionView (shipped)', () => {
  test('includes mentionable login absent from local already-seen actors', () => {
    const localOnly = filterMentions('', localSeenLogins);
    expect(localOnly.map((r) => r.login)).not.toContain('org-ghost');

    const merged = mergeMentionCandidates(mentionableDirectory, localSeenLogins);
    const hits = filterMentions('', merged);
    expect(hits.some((r) => r.login === 'org-ghost')).toBe(true);
  });

  test('query matches display name and login; each hit keeps avatar + name', () => {
    const merged = mergeMentionCandidates(mentionableDirectory, localSeenLogins);
    const byName = filterMentions('Ada', merged);
    expect(byName.map((r) => r.login)).toEqual(['org-ghost']);
    expect(byName[0]).toMatchObject({
      login: 'org-ghost',
      name: 'Ada Lovelace',
      avatarUrl: 'https://avatars.example/ghost',
    });

    const byLogin = filterMentions('org-ghost', merged);
    expect(byLogin.map((r) => r.login)).toEqual(['org-ghost']);
    expect(byLogin[0].name).toBe('Ada Lovelace');
    expect(byLogin[0].avatarUrl).toBe('https://avatars.example/ghost');

    const miss = filterMentions('zzzz-nope', merged);
    expect(miss).toEqual([]);
  });

  test('insert still uses @login (not display name)', () => {
    const row = mentionableDirectory[1];
    expect(mentionInsertLogin(row)).toBe('org-ghost');
    const trig = detectMentionTrigger('Hi @Ada', 7);
    expect(trig?.query).toBe('Ada');
    const next = applyMentionInsertion('Hi @Ada', trig, row);
    expect(next.text).toBe('Hi @org-ghost ');
    expect(next.text).not.toMatch(/Ada Lovelace/);
  });

  test('suggestion view exposes avatar + name + @login', () => {
    const view = mentionSuggestionView(mentionableDirectory[1]);
    expect(view.login).toBe('org-ghost');
    expect(view.name).toBe('Ada Lovelace');
    expect(view.avatarUrl).toBe('https://avatars.example/ghost');
    expect(view.primary).toBe('Ada Lovelace');
    expect(view.secondary).toBe('@org-ghost');
  });
});

describe('mentionable GraphQL mapper (shipped)', () => {
  test('mapDirectoryPeopleNodes keeps login + name + avatarUrl', () => {
    const rows = mapDirectoryPeopleNodes([
      {
        login: 'org-ghost',
        name: 'Ada Lovelace',
        avatarUrl: 'https://avatars.example/ghost',
      },
      { login: '', name: 'skip' },
    ]);
    expect(rows).toEqual([
      {
        login: 'org-ghost',
        name: 'Ada Lovelace',
        avatarUrl: 'https://avatars.example/ghost',
      },
    ]);
  });

  test('searchRepoPeople mentionable kind hits mentionableUsers', async () => {
    expect(MENTIONABLE_USERS_QUERY).toMatch(/mentionableUsers\(first:\$n,query:\$query\)/);
    expect(MENTIONABLE_USERS_QUERY).not.toMatch(/\bmutation\b/);
    const calls: Array<{ body?: any }> = [];
    const fetchImpl = async (_url: string, init: any = {}) => {
      const body = init?.body ? JSON.parse(init.body) : null;
      calls.push({ body });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            repository: {
              mentionableUsers: {
                nodes: [
                  {
                    login: 'org-ghost',
                    name: 'Ada Lovelace',
                    avatarUrl: 'https://g',
                  },
                ],
              },
            },
          },
        }),
      };
    };
    const users = await searchRepoPeople(
      'enif-lee',
      'pr-plus',
      { query: 'Ada', kind: 'mentionable' },
      fetchImpl,
      'token'
    );
    expect(String(calls[0].body?.query || '')).toMatch(/MentionableUsers/);
    expect(calls[0].body?.variables.query).toBe('Ada');
    expect(users).toEqual([
      { login: 'org-ghost', name: 'Ada Lovelace', avatarUrl: 'https://g' },
    ]);
  });
});

describe('composer mention-menu markup + reviewer kind (wiring)', () => {
  test('MarkdownComposer mention rows render avatar + user name, insert @login', () => {
    const src = read('src/modal/components/common/MarkdownComposer.tsx');
    const css = read('src/modal/components/common/MarkdownComposer.css');
    const hook = read('src/modal/hooks/useMentionableDirectory.ts');
    expect(src).toMatch(/useMentionableDirectory/);
    expect(src).toMatch(/<Avatar/);
    expect(src).toMatch(/prp-composer-menu__mention-name/);
    expect(src).toMatch(/prp-composer-menu__mention-login/);
    expect(src).toMatch(/data-prp-mention-login/);
    expect(src).toMatch(/mentionSuggestionView/);
    expect(src).toMatch(/applyMentionInsertion\(text, menu\.trigger, item\)/);
    expect(src).not.toMatch(/@\$\{item\}/);
    expect(css).toMatch(/prp-composer-menu__item--mention/);
    expect(css).toMatch(/prp-composer-menu__mention-name/);
    expect(hook).toMatch(/kind:\s*'mentionable'/);
    expect(hook).not.toMatch(/kind:\s*'collaborator'/);
  });

  test('Add-reviewer directory kind stays collaborator (not mentionable)', () => {
    expect(peopleDirectoryKindForPicker('reviewer')).toBe('collaborator');
    expect(peopleDirectoryKindForPicker('assignee')).toBe('assignable');
    const mut = read('src/modal/commands/domain-mutations.ts');
    expect(mut).toMatch(/peopleDirectoryKindForPicker/);
    expect(mut).toMatch(/type === 'reviewer' \? \[\]/);
    const hook = read('src/modal/hooks/useMentionableDirectory.ts');
    expect(hook).toMatch(/kind:\s*'mentionable'/);
    expect(mut).not.toMatch(/kind:\s*'mentionable'/);
  });
});
