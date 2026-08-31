/**
 * Assignee/reviewer picker: GitHub permission directory (login + display name),
 * not only people already seen on this PR / open PRs.
 * Drives shipped option builder + filterSelectOptions + searchRepoPeople.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from '@rstest/core';
import {
  buildPeopleOptions,
  filterSelectOptions,
  peopleDirectoryKindForPicker,
  peoplePickerOptionsFromDirectory,
  peoplePickerShouldSearchDirectory,
  pickFilteredOptionByIndex,
  reviewerPickerExcludeLogins,
  isPullRequestAuthor,
} from '../src/modal/lib/searchable-select';
import { runPaletteCommand } from '../src/modal/app/pr-modal-run-palette';
import { installPrModalMutations } from '../src/modal/commands/domain-mutations';
import {
  ASSIGNABLE_USERS_QUERY,
  COLLABORATORS_QUERY,
  MENTIONABLE_USERS_QUERY,
  mapDirectoryPeopleNodes,
  searchRepoPeople,
} from '../src/fetch/people-directory';

const root = path.resolve(__dirname, '..');

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const localSeenLogins = ['alice', 'bob', 'enif-lee'];
const directoryUsers = [
  { login: 'alice', name: 'Alice Example', avatarUrl: 'https://a' },
  { login: 'org-ghost', name: 'Ada Lovelace', avatarUrl: 'https://g' },
  { login: 'octocat', name: 'The Octocat', avatarUrl: 'https://o' },
];

describe('peoplePickerOptionsFromDirectory (shipped)', () => {
  test('includes assignable login absent from local already-seen actors', () => {
    const localOnly = buildPeopleOptions(localSeenLogins);
    expect(localOnly.map((o) => o.id)).not.toContain('org-ghost');
    expect(filterSelectOptions(localOnly, 'Ada')).toEqual([]);

    const opts = peoplePickerOptionsFromDirectory(directoryUsers, '', {
      extraOptions: localOnly,
    });
    expect(opts.some((o) => o.id === 'org-ghost')).toBe(true);
  });

  test('query matches display name and login; neither → empty', () => {
    const extra = buildPeopleOptions(localSeenLogins);
    const byName = peoplePickerOptionsFromDirectory(directoryUsers, 'Ada', {
      extraOptions: extra,
    });
    expect(byName.map((o) => o.id)).toEqual(['org-ghost']);

    const byLogin = peoplePickerOptionsFromDirectory(directoryUsers, 'org-ghost', {
      extraOptions: extra,
    });
    expect(byLogin.map((o) => o.id)).toEqual(['org-ghost']);

    const miss = peoplePickerOptionsFromDirectory(directoryUsers, 'zzzz-nope', {
      extraOptions: extra,
    });
    expect(miss).toEqual([]);
  });

  test('excludes already-assigned / already-requested logins', () => {
    const opts = peoplePickerOptionsFromDirectory(directoryUsers, '', {
      exclude: ['org-ghost', 'alice'],
    });
    expect(opts.map((o) => o.id)).toEqual(['octocat']);
  });

  test('Enter-first-hit and ⌥1 still resolve against filtered directory hits', () => {
    const filtered = peoplePickerOptionsFromDirectory(directoryUsers, 'octo');
    expect(filtered[0]?.id).toBe('octocat');
    expect(pickFilteredOptionByIndex(filtered, 0)?.id).toBe('octocat');
  });
});

describe('reviewer picker excludes PR author (GitHub 422)', () => {
  const detail = {
    author: 'enif-lee',
    requestedReviewers: ['octocat'],
  };

  test('reviewerPickerExcludeLogins includes author + already requested', () => {
    expect(reviewerPickerExcludeLogins(detail)).toEqual(['enif-lee', 'octocat']);
    expect(isPullRequestAuthor('enif-lee', detail)).toBe(true);
    expect(isPullRequestAuthor('ENIF-LEE', detail)).toBe(true);
    expect(isPullRequestAuthor('cursor', detail)).toBe(false);
  });

  test('directory options drop the author even when GitHub returns them', () => {
    const opts = peoplePickerOptionsFromDirectory(
      [
        { login: 'enif-lee', name: 'Author' },
        { login: 'cursor', name: 'Cursor Agent' },
      ],
      '',
      { exclude: reviewerPickerExcludeLogins(detail) }
    );
    expect(opts.map((o) => o.id)).toEqual(['cursor']);
  });

  test('applyAddReviewer does not call API for the PR author', async () => {
    const calls: unknown[] = [];
    (globalThis as any).PRTreeFetch = {
      requestReviewers: async (...args: unknown[]) => {
        calls.push(args);
        return { users: [] };
      },
    };
    const msgs: string[] = [];
    const d: Record<string, any> = {
      detail: {
        owner: 'enif-lee',
        repo: 'pr-plus',
        number: 19,
        author: 'enif-lee',
        requestedReviewers: [],
      },
      detailRef: { current: null },
      setActionBusy: () => {},
      setActionMsg: (m: string) => {
        msgs.push(m);
      },
    };
    d.detailRef.current = d.detail;
    const mut = installPrModalMutations(d);
    await mut.applyAddReviewer('enif-lee');
    expect(calls).toEqual([]);
    expect(msgs).toEqual([]);
    delete (globalThis as any).PRTreeFetch;
  });
});

describe('people directory kind + GraphQL mapper (shipped)', () => {
  test('assignee → assignable, reviewer → collaborator', () => {
    expect(peopleDirectoryKindForPicker('assignee')).toBe('assignable');
    expect(peopleDirectoryKindForPicker('reviewer')).toBe('collaborator');
  });

  test('mapDirectoryPeopleNodes keeps login + name', () => {
    const rows = mapDirectoryPeopleNodes([
      { login: 'org-ghost', name: 'Ada Lovelace', avatarUrl: 'https://g' },
      { login: '', name: 'skip' },
      { login: 'org-ghost', name: 'dup' },
    ]);
    expect(rows).toEqual([
      { login: 'org-ghost', name: 'Ada Lovelace', avatarUrl: 'https://g' },
    ]);
  });
});

describe('searchRepoPeople GraphQL query-scoped fetch (shipped)', () => {
  test('AssignableUsers query includes login+name and passes query variable', async () => {
    expect(ASSIGNABLE_USERS_QUERY).toMatch(/query AssignableUsers/);
    expect(ASSIGNABLE_USERS_QUERY).toMatch(/assignableUsers\(first:\$n,query:\$query\)/);
    expect(ASSIGNABLE_USERS_QUERY).toMatch(/nodes\{\s*login name avatarUrl\s*\}/);
    expect(ASSIGNABLE_USERS_QUERY).not.toMatch(/\bmutation\b/);
    expect(MENTIONABLE_USERS_QUERY).toMatch(/mentionableUsers\(first:\$n,query:\$query\)/);
    expect(COLLABORATORS_QUERY).toMatch(/query RepoCollaborators/);
    expect(COLLABORATORS_QUERY).toMatch(/collaborators\(first:\$n,query:\$query\)/);

    const calls: Array<{ url: string; body?: any }> = [];
    const fetchImpl = async (url: string, init: any = {}) => {
      const body = init?.body ? JSON.parse(init.body) : null;
      calls.push({ url: String(url), body });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            repository: {
              assignableUsers: {
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
      { query: 'Ada', kind: 'assignable' },
      fetchImpl,
      'token'
    );
    expect(calls.length).toBe(1);
    expect(calls[0].url).toMatch(/graphql/i);
    expect(String(calls[0].body?.query || '')).toMatch(/AssignableUsers/);
    expect(calls[0].body?.variables).toMatchObject({
      owner: 'enif-lee',
      name: 'pr-plus',
      query: 'Ada',
    });
    expect(users).toEqual([
      { login: 'org-ghost', name: 'Ada Lovelace', avatarUrl: 'https://g' },
    ]);
  });

  test('collaborator kind queries repository.collaborators', async () => {
    const calls: Array<{ url: string; body?: any }> = [];
    const fetchImpl = async (url: string, init: any = {}) => {
      const body = init?.body ? JSON.parse(init.body) : null;
      calls.push({ url: String(url), body });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            repository: {
              collaborators: {
                nodes: [{ login: 'collab-only', name: 'Collab', avatarUrl: '' }],
              },
            },
          },
        }),
      };
    };
    const users = await searchRepoPeople(
      'enif-lee',
      'pr-plus',
      { query: 'col', kind: 'collaborator' },
      fetchImpl,
      'token'
    );
    expect(String(calls[0].body?.query || '')).toMatch(/RepoCollaborators/);
    expect(calls[0].body?.variables.query).toBe('col');
    expect(users.map((u) => u.login)).toEqual(['collab-only']);
  });
});

describe('peoplePickerShouldSearchDirectory (add vs remove)', () => {
  function paletteCtx(extra: Record<string, unknown> = {}) {
    let picker: any = null;
    const ctx: Record<string, any> = {
      setPaletteOpen: () => {},
      setPaletteQuery: () => {},
      setPaletteHelpOpen: () => {},
      closePicker: () => {
        picker = null;
      },
      setActionMsg: () => {},
      setPicker: (p: any) => {
        picker = typeof p === 'function' ? p(picker) : p;
      },
      onRemoveReviewer: () => {},
      onRemoveAssignee: () => {},
      openReviewerPicker: () => {},
      openAssigneePicker: () => {},
      detail: {
        requestedReviewers: ['alice'],
        assignees: ['bob'],
      },
      ...extra,
    };
    return {
      ctx,
      getPicker: () => picker,
    };
  }

  test('palette Unassign / Remove reviewer must not search directory', () => {
    const { ctx, getPicker } = paletteCtx();
    runPaletteCommand(ctx, { action: 'promptRemoveReviewer' });
    const removeRev = getPicker();
    expect(removeRev?.type).toBe('reviewer');
    expect(removeRev?.options?.map((o: any) => o.id)).toEqual(['alice']);
    expect(peoplePickerShouldSearchDirectory(removeRev)).toBe(false);

    runPaletteCommand(ctx, { action: 'promptRemoveAssignee' });
    const unassign = getPicker();
    expect(unassign?.type).toBe('assignee');
    expect(unassign?.options?.map((o: any) => o.id)).toEqual(['bob']);
    expect(peoplePickerShouldSearchDirectory(unassign)).toBe(false);
  });

  test('add assignee/reviewer pickers from open* search the directory', () => {
    let picker: any = null;
    const d: Record<string, any> = {
      detail: {
        owner: 'enif-lee',
        repo: 'pr-plus',
        assignees: [],
        requestedReviewers: [],
        avatarUrls: {},
      },
      collectPeopleLogins: () => ['alice'],
      pickerAnchorRef: { current: null },
      assigneeAddRef: { current: null },
      reviewerAddRef: { current: null },
      setPicker: (p: any) => {
        picker = typeof p === 'function' ? p(picker) : p;
      },
      closePicker: () => {
        picker = null;
      },
    };
    const mut = installPrModalMutations(d);
    mut.openAssigneePicker();
    expect(peoplePickerShouldSearchDirectory(picker)).toBe(true);
    mut.openReviewerPicker();
    expect(peoplePickerShouldSearchDirectory(picker)).toBe(true);
  });
});

describe('picker open/search path no longer solely collectPeopleLogins', () => {
  test('openAssigneePicker / openReviewerPicker fetch directory', () => {
    const mut = read('src/modal/commands/domain-mutations.ts');
    const assigneeBlock = mut.slice(
      mut.indexOf('function openAssigneePicker'),
      mut.indexOf('function openAssigneePicker') + 1600
    );
    expect(assigneeBlock).toMatch(/peoplePickerOptionsFromDirectory/);
    expect(assigneeBlock).toMatch(/refreshPeopleDirectoryPicker\('assignee'/);
    expect(mut).toMatch(/api\?\.searchRepoPeople/);
    expect(assigneeBlock).toMatch(/multi:\s*false/);
    expect(assigneeBlock).toMatch(/allowFreeText:\s*true/);

    const revBlock = mut.slice(
      mut.indexOf('function openReviewerPicker'),
      mut.indexOf('function openReviewerPicker') + 1200
    );
    expect(revBlock).toMatch(/peoplePickerOptionsFromDirectory/);
    expect(revBlock).toMatch(/refreshPeopleDirectoryPicker\('reviewer'/);
    expect(mut).toMatch(/type === 'reviewer' \? \[\]/);
    expect(revBlock).toMatch(/multi:\s*false/);
    expect(revBlock).toMatch(/allowFreeText:\s*true/);
  });

  test('typed query schedules directory search; SearchableSelect still submits free-text', () => {
    const mut = read('src/modal/commands/domain-mutations.ts');
    expect(mut).toMatch(/function onPeoplePickerQuery/);
    expect(mut).toMatch(/peopleDirectoryKindForPicker/);
    const shell = read('src/modal/app/PrModalShell.tsx');
    expect(shell).toMatch(/onPeoplePickerQuery/);
    const ui = read('src/modal/components/common/SearchableSelect.tsx');
    expect(ui).toMatch(/allowFreeText && free/);
    expect(ui).toMatch(/id: free, label: free/);
  });

  test('bridge + SW expose SEARCH_REPO_PEOPLE', () => {
    const swMsg = read('src/sw-messages.ts');
    expect(swMsg).toMatch(/SEARCH_REPO_PEOPLE:\s*'PR_TREE_SEARCH_REPO_PEOPLE'/);
    const handle = read('src/background/sw-handle-b.ts');
    expect(handle).toMatch(/MSG\.SEARCH_REPO_PEOPLE/);
    expect(handle).toMatch(/searchRepoPeople/);
    const bridge = read('src/content-bridge/bridge-fetch-part-b.ts');
    expect(bridge).toMatch(/async searchRepoPeople/);
    expect(bridge).toMatch(/MSG\.SEARCH_REPO_PEOPLE/);
    const fetchApi = read('src/fetch/fetch-api.ts');
    expect(fetchApi).toMatch(/searchRepoPeople/);
  });
});
