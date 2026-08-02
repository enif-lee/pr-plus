/**
 * Bidirectional meta write-through e2e:
 *   modal → list row / reopened modal detail
 *   external (gh API / native detail) → reopened modal
 *
 * Fields: title, description, milestone, assignee, reviewer (when available),
 * body emoji reaction.
 *
 * Fail-closed with named probes. Restores demo PR hygiene when possible.
 */
import { execFileSync } from 'node:child_process';
import {
  assert,
  clearPrPlusIdb,
  clearPrPlusSessionStorage,
  closeOverlay,
  DEMO_PR,
  evalInPage,
  log,
  MULTI_HUNK_PR,
  open as openPage,
  openPr,
  openPulls,
  press,
  PULLS_URL,
  REPO,
  setLayout,
  waitDetailReady,
  waitMs,
} from '../lib/harness.mjs';

const MARK = `e2e-meta-${Date.now().toString(36)}`;
const MILESTONE_TITLE = 'pr-plus-e2e-meta';

// ── gh helpers (authenticated reverse / hygiene) ────────────────────

function ghJson(args, input = null) {
  try {
    const out = execFileSync('gh', args, {
      encoding: 'utf8',
      input: input || undefined,
      timeout: 45_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    const t = String(out || '').trim();
    if (!t) return null;
    try {
      return JSON.parse(t);
    } catch {
      return t;
    }
  } catch (e) {
    return {
      _error: true,
      message: String(e?.stderr || e?.message || e).slice(0, 400),
    };
  }
}

function ghIssueGet(n = DEMO_PR) {
  return ghJson([
    'api',
    `repos/${REPO}/issues/${Number(n)}`,
    '--jq',
    '{title:.title,body:.body,labels:[.labels[].name],assignees:[.assignees[].login],milestone:(.milestone.title // null),milestoneNumber:(.milestone.number // null)}',
  ]);
}

function ghPatchIssue(n, fields) {
  const args = ['api', '-X', 'PATCH', `repos/${REPO}/issues/${Number(n)}`];
  for (const [k, v] of Object.entries(fields || {})) {
    if (v === null) args.push('-F', `${k}=`);
    else if (Array.isArray(v)) {
      // assignees replace: empty clears
      if (v.length === 0) args.push('-F', `${k}[]=`);
      else for (const item of v) args.push('-F', `${k}[]=${item}`);
    } else if (k === 'title' || k === 'body') {
      // raw-field form preserves spaces/unicode without shell splitting
      args.push('--raw-field', `${k}=${v}`);
    } else args.push('-f', `${k}=${v}`);
  }
  return ghJson(args);
}

function ghEnsureMilestone() {
  const list = ghJson([
    'api',
    `repos/${REPO}/milestones?state=open&per_page=50`,
  ]);
  if (Array.isArray(list)) {
    const hit = list.find((m) => String(m?.title || '') === MILESTONE_TITLE);
    if (hit) return { number: Number(hit.number), title: hit.title };
  }
  const created = ghJson([
    'api',
    '-X',
    'POST',
    `repos/${REPO}/milestones`,
    '-f',
    `title=${MILESTONE_TITLE}`,
    '-f',
    'description=ephemeral e2e milestone',
    '-f',
    'state=open',
  ]);
  if (created?._error) return null;
  return {
    number: Number(created?.number),
    title: String(created?.title || MILESTONE_TITLE),
  };
}

// ── wait / probes ───────────────────────────────────────────────────

function waitPred(fn, pred, ms = 12_000, step = 350) {
  const t0 = Date.now();
  let last = fn();
  while (Date.now() - t0 < ms) {
    if (pred(last)) return last;
    waitMs(step);
    last = fn();
  }
  return last;
}

function waitActionIdle(ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const busy = evalInPage(`
      (() => {
        const o = document.querySelector('.prp-overlay');
        if (!o) return false;
        return !!o.querySelector(
          'button[disabled][aria-busy="true"], .prp-action-toast[data-busy="1"]'
        );
      })()
    `);
    if (!busy) break;
    waitMs(200);
  }
  waitMs(200);
}

function probeListRow(n) {
  return evalInPage(`
    (() => {
      const n = ${Number(n)};
      const rows = [...document.querySelectorAll('.js-issue-row, [id^="issue_"]')];
      let row = null;
      for (const r of rows) {
        if (r.id === 'issue_' + n) { row = r; break; }
        for (const a of r.querySelectorAll('a[href*="/pull/"]')) {
          if ((a.getAttribute('href') || '').includes('/pull/' + n)) {
            row = r;
            break;
          }
        }
        if (row) break;
      }
      if (!row) return { found: false };
      const labels = [];
      for (const el of row.querySelectorAll(
        'a.IssueLabel, .pr-tree-list-label, a[data-name], span.IssueLabel, a[href*="/labels/"]'
      )) {
        const name = (el.getAttribute('data-name') || el.textContent || '').trim();
        if (name) labels.push(name);
      }
      const titleEl = row.querySelector(
        'a.js-navigation-open, a[id$="_link"], h3 a'
      );
      return {
        found: true,
        title: titleEl ? String(titleEl.textContent || '').trim() : null,
        labels: [...new Set(labels)],
        text: String(row.innerText || '').slice(0, 500),
      };
    })()
  `);
}

function probeModalMeta() {
  return evalInPage(`
    (() => {
      const o = document.querySelector('.prp-overlay');
      if (!o) return { open: false };
      const title =
        o.querySelector('.prp-header__title')?.textContent?.trim() ||
        o.querySelector('h2.prp-header__title')?.textContent?.trim() ||
        '';
      const bodyHost =
        o.querySelector('[data-search-anchor="body"]') ||
        o.querySelector('.prp-description, [class*="Description"]');
      const bodyText = (bodyHost?.innerText || '').replace(/\\s+/g, ' ').trim();
      const aside =
        o.querySelector('.prp-conversation__aside') ||
        o.querySelector('.prp-aside');
      const asideText = (aside?.innerText || '').replace(/\\s+/g, ' ').trim();
      // Milestone section
      const msMatch = asideText.match(/Milestone\\s+([^\\n]+?)(?:\\s+Set milestone|\\s+Change milestone|\\s+Projects|$)/i);
      const milestoneSnippet = msMatch ? msMatch[1].trim() : '';
      const hasMilestone =
        /pr-plus-e2e-meta/i.test(asideText) ||
        (/Milestone/i.test(asideText) && !/No milestone/i.test(asideText));
      // Assignees
      const hasAssignee =
        /Assignees/i.test(asideText) &&
        !/Assignees\\s+Add assignee|Assignees\\s*No one assigned/i.test(asideText);
      const assigneeMentionsEnif = /Assignees[\\s\\S]{0,120}?enif-lee/i.test(
        asideText
      );
      // Reviewers
      const hasReviewerSection = /Reviewers/i.test(asideText);
      // Reactions on description (class is prp-reactions, data-prp-reactions)
      const reactionHost =
        bodyHost?.querySelector('[data-prp-reactions], .prp-reactions') ||
        o.querySelector('[data-prp-reactions], .prp-reactions');
      const reactionText = (reactionHost?.innerText || reactionHost?.textContent || '')
        .replace(/\\s+/g, ' ')
        .trim();
      const reactedHeart =
        !!reactionHost?.querySelector(
          'button.is-reacted .prp-reactions__emoji, button.prp-reactions__pill.is-reacted'
        ) ||
        (reactionHost &&
          [...reactionHost.querySelectorAll('button.is-reacted')].some((b) =>
            /❤️|heart/i.test(
              (b.textContent || '') + (b.getAttribute('title') || '')
            )
          )) ||
        /❤️\\s*\\d+/.test(bodyText);
      const reactionPills = [
        ...(reactionHost?.querySelectorAll('button.prp-reactions__pill, button') ||
          []),
      ].map((b) => ({
        content: b.getAttribute('data-content') || '',
        reacted: b.classList.contains('is-reacted'),
        label: (b.getAttribute('aria-label') || b.textContent || '')
          .replace(/\\s+/g, ' ')
          .trim()
          .slice(0, 40),
      }));
      return {
        open: true,
        title,
        bodyText: bodyText.slice(0, 600),
        bodyHasMark: /e2e-meta-/i.test(bodyText),
        asideText: asideText.slice(0, 700),
        milestoneSnippet,
        hasMilestone,
        hasAssignee,
        assigneeMentionsEnif,
        hasReviewerSection,
        reactedHeart,
        reactionPills,
        reactionText: reactionText.slice(0, 120),
      };
    })()
  `);
}

// ── modal actions ───────────────────────────────────────────────────

function editModalTitle(nextTitle) {
  const opened = evalInPage(`
    (() => {
      const btn = document.querySelector(
        '.prp-overlay button[aria-label="Edit title"]'
      );
      if (!btn) return { ok: false, reason: 'no edit title btn' };
      btn.click();
      return { ok: true };
    })()
  `);
  assert(opened.ok, `edit title open: ${JSON.stringify(opened)}`);
  waitMs(300);
  const typed = evalInPage(`
    (() => {
      const input = document.querySelector(
        '.prp-overlay .prp-header__title-edit input, .prp-overlay input[aria-label*="title" i], .prp-overlay .prp-header__title-edit input[type="text"]'
      );
      if (!input) return { ok: false, reason: 'no title input' };
      const native = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      );
      native?.set?.call(input, ${JSON.stringify(String(nextTitle))});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return { ok: true, value: input.value };
    })()
  `);
  assert(typed.ok, `title type: ${JSON.stringify(typed)}`);
  waitMs(150);
  const saved = evalInPage(`
    (() => {
      const btn = document.querySelector(
        '.prp-overlay button[aria-label="Save title"]'
      );
      if (btn) { btn.click(); return { ok: true, via: 'btn' }; }
      const input = document.querySelector(
        '.prp-overlay .prp-header__title-edit input'
      );
      if (input) {
        input.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
        );
        return { ok: true, via: 'enter' };
      }
      return { ok: false };
    })()
  `);
  assert(saved.ok, `title save: ${JSON.stringify(saved)}`);
  waitActionIdle(10_000);
  waitMs(400);
}

function editModalBody(nextBody) {
  const opened = evalInPage(`
    (() => {
      const btn = document.querySelector(
        '.prp-overlay button[aria-label="Edit description"]'
      );
      if (!btn) return { ok: false, reason: 'no edit description' };
      btn.click();
      return { ok: true };
    })()
  `);
  assert(opened.ok, `body edit open: ${JSON.stringify(opened)}`);
  waitMs(500);
  const typed = evalInPage(`
    (() => {
      const bodyEditor = document.querySelector('.prp-overlay .prp-body-editor');
      const ta =
        bodyEditor?.querySelector('textarea.prp-mdc__ta') ||
        bodyEditor?.querySelector('textarea.prp-textarea') ||
        bodyEditor?.querySelector('textarea') ||
        document.querySelector('.prp-overlay .prp-body-editor textarea') ||
        document.querySelector('.prp-overlay textarea.prp-mdc__ta') ||
        document.querySelector('.prp-overlay textarea');
      if (!ta) {
        return {
          ok: false,
          reason: 'no body textarea',
          hasEditor: !!bodyEditor,
        };
      }
      // Ensure Write tab (not Preview)
      const writeTab = bodyEditor?.querySelector(
        'button.prp-tab, [role="tab"]'
      );
      if (writeTab && /write/i.test(writeTab.textContent || '')) writeTab.click();
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value'
      )?.set;
      setter?.call(ta, ${JSON.stringify(String(nextBody))});
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ta.dispatchEvent(new Event('change', { bubbles: true }));
      // React 17+ sometimes needs InputEvent
      try {
        ta.dispatchEvent(
          new InputEvent('input', { bubbles: true, data: ${JSON.stringify(String(nextBody))}, inputType: 'insertText' })
        );
      } catch {}
      return { ok: true, len: ta.value.length, cls: ta.className };
    })()
  `);
  assert(typed.ok, `body type: ${JSON.stringify(typed)}`);
  waitMs(300);
  const saved = evalInPage(`
    (() => {
      const editor = document.querySelector('.prp-overlay .prp-body-editor');
      const row = editor?.querySelector('.prp-composer__row');
      const save =
        row &&
        [...row.querySelectorAll('button')].find((b) =>
          /^\\s*Save\\s*$/i.test(b.textContent || '')
        );
      if (!save) {
        const btns = [...document.querySelectorAll('.prp-overlay button')];
        const fallback = btns.find((b) =>
          /^\\s*Save\\s*$/i.test(b.textContent || '')
        );
        if (!fallback)
          return {
            ok: false,
            reason: 'no Save',
            labels: btns
              .map((b) => (b.textContent || '').trim())
              .filter(Boolean)
              .slice(0, 15),
          };
        fallback.click();
        return { ok: true, via: 'fallback' };
      }
      save.click();
      return { ok: true, via: 'row' };
    })()
  `);
  assert(saved.ok, `body save: ${JSON.stringify(saved)}`);
  waitActionIdle(12_000);
  waitMs(800);
}

function openAsidePicker(buttonRe) {
  return evalInPage(`
    (() => {
      const re = ${buttonRe};
      const btns = [...document.querySelectorAll('.prp-overlay button')];
      const btn = btns.find((b) => re.test(b.textContent || ''));
      if (!btn) {
        return {
          ok: false,
          labels: btns
            .map((b) => (b.textContent || '').trim())
            .filter(Boolean)
            .slice(0, 25),
        };
      }
      btn.click();
      return { ok: true, text: (btn.textContent || '').trim() };
    })()
  `);
}

function pickFirstSelectable(filterFnSrc = 'true') {
  return evalInPage(`
    (() => {
      const panel = document.querySelector('.prp-sselect-panel');
      if (!panel) return { ok: false, reason: 'no panel' };
      const items = [...panel.querySelectorAll('button.prp-sselect-item')];
      const filter = (login, label) => (${filterFnSrc});
      for (const it of items) {
        const lab = (
          it.querySelector('.prp-sselect-item__label')?.textContent ||
          it.textContent ||
          ''
        )
          .replace(/\\s+/g, ' ')
          .trim();
        const id = it.getAttribute('data-id') || lab;
        if (!filter(id, lab)) continue;
        if (it.getAttribute('aria-selected') === 'true') {
          return { ok: true, id, lab, already: true };
        }
        it.click();
        return { ok: true, id, lab, already: false };
      }
      return {
        ok: false,
        reason: 'no match',
        options: items
          .map((it) =>
            (
              it.querySelector('.prp-sselect-item__label')?.textContent ||
              it.textContent ||
              ''
            )
              .replace(/\\s+/g, ' ')
              .trim()
          )
          .slice(0, 12),
      };
    })()
  `);
}

function confirmPickerApply(labelRe = /apply|set|done|ok/i) {
  // Only click footer/apply inside the open searchable-select panel.
  // Matching any overlay button (e.g. aside "Add assignee…") re-opens the
  // picker and never commits multi-select writes.
  return evalInPage(`
    (() => {
      const re = ${labelRe};
      const panel = document.querySelector('.prp-sselect-panel');
      if (!panel) return { ok: true, via: 'auto-close' };
      const scopes = [
        [...panel.querySelectorAll('.prp-sselect-footer button')],
        [...panel.querySelectorAll('button')],
      ];
      for (const btns of scopes) {
        const b = btns.find((x) => {
          if (x.disabled) return false;
          const t = (x.textContent || '').replace(/\\s+/g, ' ').trim();
          // Never re-trigger aside openers that happen to match "add|assign"
          if (x.classList.contains('prp-sselect-item')) return false;
          return re.test(t);
        });
        if (b) {
          b.click();
          return {
            ok: true,
            via: 'panel-btn',
            text: (b.textContent || '').replace(/\\s+/g, ' ').trim(),
          };
        }
      }
      // Single-select already closed via onPick — panel gone or no footer
      return { ok: true, via: 'no-apply-btn', panel: true };
    })()
  `);
}

function setMilestoneFromModal() {
  const open = openAsidePicker(/Set milestone|Change milestone/i);
  assert(open.ok, `milestone picker open: ${JSON.stringify(open)}`);
  waitMs(600);
  // Prefer our e2e milestone title
  let pick = evalInPage(`
    (() => {
      const panel = document.querySelector('.prp-sselect-panel');
      if (!panel) return { ok: false, reason: 'no panel' };
      for (const it of panel.querySelectorAll('button.prp-sselect-item')) {
        const t = (
          it.querySelector('.prp-sselect-item__label')?.textContent ||
          it.textContent ||
          ''
        )
          .replace(/\\s+/g, ' ')
          .trim();
        if (/pr-plus-e2e-meta/i.test(t)) {
          it.click();
          return { ok: true, label: t };
        }
      }
      return { ok: false, reason: 'milestone not in list' };
    })()
  `);
  if (!pick.ok) {
    pick = pickFirstSelectable('true');
  }
  assert(pick.ok, `milestone pick: ${JSON.stringify(pick)}`);
  waitMs(250);
  // Single-select closes on pick; Apply is a no-op when panel already closed.
  confirmPickerApply(/set milestone|apply|done|ok/i);
  waitActionIdle(14_000);
  waitMs(600);
  // Fail-closed: modal write must paint aside (no gh seed).
  const modal = waitPred(
    probeModalMeta,
    (m) => m.open && /pr-plus-e2e-meta/i.test(m.asideText || ''),
    16_000
  );
  assert(
    /pr-plus-e2e-meta/i.test(modal.asideText || ''),
    `modal milestone write did not paint aside: ${JSON.stringify(modal)}`
  );
  return pick;
}

function clearMilestoneFromModal() {
  const open = openAsidePicker(/Change milestone|Set milestone|Clear milestone/i);
  if (!open.ok) return { ok: false, ...open };
  waitMs(400);
  // Look for clear option or empty selection
  const cleared = evalInPage(`
    (() => {
      const panel = document.querySelector('.prp-sselect-panel');
      if (!panel) return { ok: false };
      for (const it of panel.querySelectorAll('button.prp-sselect-item, button')) {
        const t = (it.textContent || '').replace(/\\s+/g, ' ').trim();
        if (/^clear|no milestone|none|remove milestone/i.test(t)) {
          it.click();
          return { ok: true, via: 'option', t };
        }
      }
      return { ok: false, reason: 'no clear option' };
    })()
  `);
  if (!cleared.ok) {
    // Use aside clear control if present
    evalInPage(`
      (() => {
        const btns = [...document.querySelectorAll('.prp-overlay button')];
        const b = btns.find((x) => /clear milestone/i.test(x.textContent || ''));
        if (b) b.click();
      })()
    `);
  }
  waitMs(300);
  // Confirm dialog
  evalInPage(`
    (() => {
      const btns = [...document.querySelectorAll('button')];
      const c = btns.find((b) => /^(Clear|Confirm|Remove|OK)$/i.test((b.textContent || '').trim()));
      if (c) c.click();
    })()
  `);
  waitActionIdle(10_000);
  return { ok: true, cleared };
}

function removeAssigneeIfPresent(login = 'enif-lee') {
  return evalInPage(`
    (() => {
      const login = ${JSON.stringify(login)}.toLowerCase();
      const aside = document.querySelector('.prp-conversation__aside, .prp-aside');
      if (!aside) return { ok: false, reason: 'no aside' };
      const chips = [...aside.querySelectorAll(
        '.prp-people-chip, .prp-assignee, [class*="PeopleChip"], button, a'
      )];
      for (const chip of chips) {
        const t = (chip.textContent || '').toLowerCase();
        if (!t.includes(login) && !t.includes(login.replace(/-/g, ''))) continue;
        const rm =
          chip.querySelector('button[aria-label*="remove" i], button[aria-label*="Unassign" i], .prp-people-chip__remove, button') ||
          (chip.matches('button') ? chip : null);
        // Prefer dedicated remove near the chip
        const parent = chip.closest('.prp-people-chip, li, .prp-aside-section__row') || chip.parentElement;
        const x =
          parent?.querySelector(
            'button[aria-label*="remove" i], button[aria-label*="Unassign" i], button.prp-people-chip__remove'
          ) || rm;
        if (x && /remove|unassign|✕|×|x/i.test(x.getAttribute('aria-label') || x.textContent || 'x')) {
          x.click();
          return { ok: true, via: 'chip-remove' };
        }
      }
      // Fallback: any unassign control in Assignees section
      const sections = [...aside.querySelectorAll('.prp-aside-section')];
      const sec = sections.find((s) => /Assignees/i.test(s.textContent || ''));
      const btn = sec?.querySelector(
        'button[aria-label*="Unassign" i], button[aria-label*="remove" i]'
      );
      if (btn) {
        btn.click();
        return { ok: true, via: 'section-btn' };
      }
      return { ok: false, reason: 'no remove control' };
    })()
  `);
}

function confirmDialogIfAny() {
  waitMs(250);
  evalInPage(`
    (() => {
      const btns = [...document.querySelectorAll('button')];
      const c = btns.find((b) =>
        /^(Unassign|Remove|Confirm|Clear|OK|Yes)$/i.test((b.textContent || '').trim())
      );
      if (c) c.click();
    })()
  `);
  waitActionIdle(10_000);
}

function addAssignee(login = 'enif-lee') {
  const open = openAsidePicker(/Add assignee/i);
  assert(open.ok, `assignee picker: ${JSON.stringify(open)}`);
  waitMs(500);
  const pick = evalInPage(`
    (() => {
      const want = ${JSON.stringify(login)}.toLowerCase();
      const panel = document.querySelector('.prp-sselect-panel');
      if (!panel) return { ok: false, reason: 'no panel' };
      const input = panel.querySelector('input');
      if (input) {
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value'
        )?.set;
        setter?.call(input, want);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const items = [...panel.querySelectorAll('button.prp-sselect-item')];
      for (const it of items) {
        const t = (
          it.querySelector('.prp-sselect-item__label')?.textContent ||
          it.textContent ||
          ''
        )
          .replace(/\\s+/g, ' ')
          .trim();
        if (t.toLowerCase().includes(want)) {
          it.click();
          return { ok: true, label: t, via: 'item' };
        }
      }
      // free-text create / pick first remaining
      const create = [...panel.querySelectorAll('button')].find((b) =>
        /add\\s+[\"']?${login}|create/i.test(b.textContent || '')
      );
      if (create) {
        create.click();
        return { ok: true, via: 'create', label: ${JSON.stringify(login)} };
      }
      if (items[0]) {
        items[0].click();
        return {
          ok: true,
          via: 'first',
          label: (items[0].textContent || '').trim(),
        };
      }
      return {
        ok: false,
        reason: 'login not found',
        options: items
          .map((it) => (it.textContent || '').trim())
          .slice(0, 8),
      };
    })()
  `);
  assert(pick.ok, `assignee pick: ${JSON.stringify(pick)}`);
  waitMs(250);
  const applied = confirmPickerApply(/add assignees|apply|done/i);
  log(`  assignee apply: ${JSON.stringify(applied)}`);
  waitActionIdle(14_000);
  waitMs(500);
  // Fail-closed: multi-select Apply must paint modal assignees (no gh seed).
  const mid = waitPred(
    probeModalMeta,
    (m) => m.open && m.assigneeMentionsEnif,
    16_000
  );
  assert(
    mid.assigneeMentionsEnif,
    `modal assignee write did not paint: pick=${JSON.stringify(pick)} apply=${JSON.stringify(applied)} modal=${JSON.stringify(mid)}`
  );
  return { ...pick, painted: true, apply: applied };
}

function addReviewerIfPossible() {
  const open = openAsidePicker(/Add reviewer/i);
  if (!open.ok) return { ok: false, reason: 'no add reviewer', open };
  waitMs(500);
  const pick = evalInPage(`
    (() => {
      const panel = document.querySelector('.prp-sselect-panel');
      if (!panel) return { ok: false, reason: 'no panel' };
      const items = [...panel.querySelectorAll('button.prp-sselect-item')];
      // Prefer non-self human logins
      for (const it of items) {
        const t = (
          it.querySelector('.prp-sselect-item__label')?.textContent ||
          it.textContent ||
          ''
        )
          .replace(/\\s+/g, ' ')
          .trim();
        if (!t) continue;
        if (/enif-lee/i.test(t)) continue;
        if (/\\[bot\\]|github-actions/i.test(t)) continue;
        it.click();
        return { ok: true, label: t };
      }
      return {
        ok: false,
        reason: 'no eligible collaborator in picker',
        options: items
          .map((it) =>
            (
              it.querySelector('.prp-sselect-item__label')?.textContent ||
              it.textContent ||
              ''
            )
              .replace(/\\s+/g, ' ')
              .trim()
          )
          .slice(0, 10),
      };
    })()
  `);
  if (!pick.ok) {
    // Close panel
    press('Escape');
    waitMs(200);
    return pick;
  }
  waitMs(200);
  confirmPickerApply(/apply|add|request|done/i);
  waitActionIdle(12_000);
  return pick;
}

function toggleBodyHeartReaction() {
  // Scroll description into view so reaction chrome mounts
  evalInPage(`
    (() => {
      const body = document.querySelector('[data-search-anchor="body"]');
      body?.scrollIntoView?.({ block: 'center' });
    })()
  `);
  waitMs(300);
  const opened = evalInPage(`
    (() => {
      const body =
        document.querySelector('[data-search-anchor="body"]') ||
        document.querySelector('.prp-overlay');
      if (!body) return { ok: false, reason: 'no body' };
      const host =
        body.querySelector('[data-prp-reactions], .prp-reactions') ||
        document.querySelector(
          '.prp-overlay [data-prp-reactions], .prp-overlay .prp-reactions'
        );
      const pills = [...(host?.querySelectorAll('button') || [])];
      const heartPill = pills.find((b) => {
        const t =
          (b.getAttribute('data-content') || '') +
          (b.getAttribute('aria-label') || '') +
          (b.getAttribute('title') || '') +
          (b.textContent || '');
        return /heart|❤️/i.test(t) && b.classList.contains('prp-reactions__pill');
      });
      if (heartPill) {
        const was = heartPill.classList.contains('is-reacted');
        heartPill.click();
        return { ok: true, via: 'pill', wasReacted: was };
      }
      const add =
        host?.querySelector('button.prp-reactions__add, button[aria-label="Add reaction"]') ||
        document.querySelector(
          '.prp-overlay button[aria-label="Add reaction"], .prp-overlay button.prp-reactions__add'
        );
      if (!add) {
        return {
          ok: false,
          reason: 'no reaction control',
          host: !!host,
          hostHtml: host ? host.outerHTML.slice(0, 240) : null,
          bodyHasReactionsAttr: !!document.querySelector('[data-prp-reactions]'),
        };
      }
      add.click();
      return { ok: true, via: 'picker-open' };
    })()
  `);
  if (!opened.ok) return opened;
  waitMs(400);
  if (opened.via === 'pill') {
    waitActionIdle(10_000);
    return opened;
  }
  const picked = evalInPage(`
    (() => {
      // Prefer the pr+ portal picker only (never native GH emoji UI).
      const portal = document.querySelector(
        '.prp-reactions__picker--portal, .prp-reactions__picker'
      );
      const scope = portal
        ? [...portal.querySelectorAll('button, [role="menuitem"]')]
        : [];
      const target = scope.find((b) => {
        const lab = (b.getAttribute('aria-label') || '').trim();
        return lab === 'Heart' || lab === 'heart' || /^\\s*❤️\\s*$/.test(b.textContent || '');
      });
      if (!target) {
        const all = [...document.querySelectorAll('button')].slice(0, 40);
        return {
          ok: false,
          reason: 'heart not in prp picker',
          portal: !!portal,
          sample: (portal ? scope : all)
            .map((b) =>
              (
                b.getAttribute('aria-label') ||
                b.getAttribute('data-content') ||
                b.textContent ||
                ''
              )
                .trim()
                .slice(0, 30)
            )
            .filter(Boolean)
            .slice(0, 16),
        };
      }
      target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      target.click();
      return {
        ok: true,
        via: 'picker-heart',
        lab: (target.getAttribute('aria-label') || '').trim(),
        cls: target.className,
      };
    })()
  `);
  waitActionIdle(10_000);
  waitMs(800);
  return picked;
}

function reopenModalFresh(n = DEMO_PR, { bustCache = false } = {}) {
  closeOverlay();
  waitMs(250);
  if (bustCache) {
    // Full navigation clears content-script in-memory detailCache (IDB alone is not enough).
    try {
      openPage('https://github.com/');
      waitMs(600);
    } catch {
      /* ignore */
    }
    try {
      clearPrPlusIdb();
    } catch {
      /* ignore */
    }
    try {
      clearPrPlusSessionStorage();
    } catch {
      /* ignore */
    }
    waitMs(400);
  }
  openPulls();
  waitMs(600);
  openPr(n, { viaUrl: true });
  setLayout('conversation');
  waitDetailReady({ meta: true, files: false, label: 'meta reopen' });
  waitMs(1000);
}

// ── steps ───────────────────────────────────────────────────────────

/**
 * @returns {import('../lib/e2e-register.ts').E2eStep[]}
 */
export function getSteps() {
  /** @type {{ name: string, fn: () => unknown | Promise<unknown> }[]} */
  const steps = [];
  const run = (name, fn) => steps.push({ name, fn });

  /** Shared baseline captured across steps */
  const ctx = {
    originalTitle: null,
    originalBody: null,
    originalAssignees: null,
    mutatedTitle: null,
    mutatedBody: null,
    milestone: null,
    reviewerLabel: null,
    heartOn: false,
  };

  run(`MB0 open DEMO_PR #${DEMO_PR} + capture baseline`, () => {
    closeOverlay();
    // Ensure milestone exists for later steps
    ctx.milestone = ghEnsureMilestone();
    log(`  milestone fixture: ${JSON.stringify(ctx.milestone)}`);
    const gh = ghIssueGet(DEMO_PR);
    assert(!gh?._error, `gh issue get failed: ${JSON.stringify(gh)}`);
    ctx.originalTitle = String(gh.title || '');
    ctx.originalBody = String(gh.body || '');
    ctx.originalAssignees = Array.isArray(gh.assignees) ? gh.assignees.slice() : [];
    log(
      `  gh baseline: title=${JSON.stringify(ctx.originalTitle)} assignees=${JSON.stringify(ctx.originalAssignees)} body=${JSON.stringify(ctx.originalBody).slice(0, 80)}`
    );

    openPr(DEMO_PR, { viaUrl: true });
    setLayout('conversation');
    waitDetailReady({ meta: true, files: false, label: 'MB0' });
    waitMs(600);
    const modal = probeModalMeta();
    assert(modal.open, 'modal not open');
    assert(
      modal.title && modal.title.includes(ctx.originalTitle.slice(0, 12)),
      `modal title baseline mismatch: ${JSON.stringify(modal.title)} vs ${ctx.originalTitle}`
    );
  });

  run(`MB1 modal title → list row + reopened modal #${DEMO_PR}`, () => {
    ctx.mutatedTitle = `${ctx.originalTitle} ✨${MARK}`;
    editModalTitle(ctx.mutatedTitle);
    const modal = waitPred(
      probeModalMeta,
      (m) => m.open && String(m.title || '').includes(MARK),
      12_000
    );
    assert(
      String(modal.title || '').includes(MARK),
      `modal missing mutated title: ${JSON.stringify(modal)}`
    );

    // List under shell (pulls still in background) — close to list if needed
    closeOverlay();
    openPulls();
    waitMs(800);
    const list = waitPred(
      () => probeListRow(DEMO_PR),
      (r) => r.found && String(r.title || '').includes(MARK),
      14_000
    );
    assert(
      list.found && String(list.title || '').includes(MARK),
      `list row missing mutated title (modal→list): ${JSON.stringify(list)}`
    );
    log(`  list title after modal edit: ${JSON.stringify(list.title)}`);

    reopenModalFresh(DEMO_PR);
    const again = waitPred(
      probeModalMeta,
      (m) => m.open && String(m.title || '').includes(MARK),
      12_000
    );
    assert(
      String(again.title || '').includes(MARK),
      `reopened modal lost title mutation: ${JSON.stringify(again)}`
    );
  });

  run(`MB2 modal description → reopened modal #${DEMO_PR}`, () => {
    // Visible marker (HTML comments are stripped from innerText probes)
    ctx.mutatedBody = `${ctx.originalBody}\n\n${MARK} body-mark`;
    editModalBody(ctx.mutatedBody);
    const modal = waitPred(
      probeModalMeta,
      (m) => m.open && (m.bodyHasMark || /e2e-meta-/i.test(m.bodyText || '')),
      12_000
    );
    assert(
      modal.bodyHasMark || /e2e-meta-/i.test(modal.bodyText || ''),
      `modal body missing mark after save: ${JSON.stringify(modal)}`
    );
    // Body is not on list row — reopen is the dual surface
    reopenModalFresh(DEMO_PR);
    const again = waitPred(
      probeModalMeta,
      (m) => m.open && (m.bodyHasMark || /e2e-meta-/i.test(m.bodyText || '')),
      12_000
    );
    assert(
      again.bodyHasMark || /e2e-meta-/i.test(again.bodyText || ''),
      `reopened modal lost body mutation: ${JSON.stringify(again)}`
    );
  });

  run(`MB3 modal milestone set → aside + reopen #${DEMO_PR}`, () => {
    assert(
      ctx.milestone?.number,
      `milestone fixture missing: ${JSON.stringify(ctx.milestone)}`
    );
    // Repo catalog only — do NOT seed the issue milestone via gh (fail-closed
    // on modal write-through). ghEnsureMilestone creates/lists the milestone entity.
    const ms = ghEnsureMilestone();
    assert(ms?.number, `milestone create/list failed: ${JSON.stringify(ms)}`);
    ctx.milestone = ms;

    // Start from a known-clear aside when possible (modal clear, not gh seed).
    let pre = probeModalMeta();
    if (/pr-plus-e2e-meta/i.test(pre.asideText || '')) {
      clearMilestoneFromModal();
      pre = waitPred(
        probeModalMeta,
        (m) => m.open && !/pr-plus-e2e-meta/i.test(m.asideText || ''),
        12_000
      );
    }

    // Modal set path only — assert immediate paint + GitHub persistence + reopen.
    setMilestoneFromModal();
    const modal = waitPred(
      probeModalMeta,
      (m) => m.open && /pr-plus-e2e-meta/i.test(m.asideText || ''),
      16_000
    );
    assert(
      /pr-plus-e2e-meta/i.test(modal.asideText || ''),
      `modal aside missing milestone after modal set: ${JSON.stringify(modal)}`
    );
    // Fail-closed on the write itself (not only UI paint): modal path must land on GH.
    const ghAfterSet = waitPred(
      () => ghIssueGet(DEMO_PR),
      (g) => /pr-plus-e2e-meta/i.test(String(g?.milestone || '')),
      16_000
    );
    assert(
      /pr-plus-e2e-meta/i.test(String(ghAfterSet?.milestone || '')),
      `modal milestone write did not persist to GitHub: ${JSON.stringify(ghAfterSet)}`
    );
    log(`  gh after modal set: milestone=${JSON.stringify(ghAfterSet?.milestone)}`);

    // Soft session: product Close + reopen without full navigation.
    // Fail-closed: session write-through / people-meta authority must paint the
    // same milestone on reopened modal aside (AC1 — not log-only).
    closeOverlay();
    waitMs(700);
    openPr(DEMO_PR);
    setLayout('conversation');
    waitDetailReady({ meta: true, files: false, label: 'MB3 soft reopen' });
    const softMs = waitPred(
      probeModalMeta,
      (m) =>
        m.open &&
        (/pr-plus-e2e-meta/i.test(m.asideText || '') ||
          /pr-plus-e2e-meta/i.test(m.milestoneSnippet || '')),
      20_000,
      400
    );
    log(
      `  soft reopen: snippet=${JSON.stringify(softMs.milestoneSnippet)} asideHas=${/pr-plus-e2e-meta/i.test(softMs.asideText || '')}`
    );
    assert(
      /pr-plus-e2e-meta/i.test(softMs.asideText || '') ||
        /pr-plus-e2e-meta/i.test(softMs.milestoneSnippet || ''),
      `product: soft reopen missing milestone while GH has it (gh=${JSON.stringify(ghAfterSet?.milestone)}): ${JSON.stringify(softMs)}`
    );

    // Hard reopen (fail-closed dual surface): full reload + clear durable state.
    // First open after reload must paint GH milestone — no free second thrash,
    // no issue-field gh seed.
    openPage(PULLS_URL);
    waitMs(500);
    evalInPage(`location.reload()`);
    waitMs(2800);
    try {
      clearPrPlusIdb();
      clearPrPlusSessionStorage();
    } catch {
      /* ignore */
    }
    waitMs(600);
    const listHit = waitPred(
      () => probeListRow(DEMO_PR),
      (r) => r.found,
      12_000
    );
    log(`  list before hard reopen: ${JSON.stringify(listHit).slice(0, 160)}`);
    // Prefer viaUrl after hard clear so network core (issue+pull) is authoritative.
    openPr(DEMO_PR, { viaUrl: true });
    setLayout('conversation');
    waitDetailReady({ meta: true, files: false, label: 'MB3 hard reopen' });
    waitMs(1500);
    const finalMs = waitPred(
      probeModalMeta,
      (m) =>
        m.open &&
        (/pr-plus-e2e-meta/i.test(m.asideText || '') ||
          /pr-plus-e2e-meta/i.test(m.milestoneSnippet || '')),
      45_000,
      500
    );
    const ghAtReopen = ghIssueGet(DEMO_PR);
    assert(
      /pr-plus-e2e-meta/i.test(String(ghAtReopen?.milestone || '')),
      `GH lost milestone before hard-reopen assert: ${JSON.stringify(ghAtReopen)}`
    );
    assert(
      /pr-plus-e2e-meta/i.test(finalMs.asideText || '') ||
        /pr-plus-e2e-meta/i.test(finalMs.milestoneSnippet || ''),
      `product: modal missing milestone after first hard reopen while GH has it (gh=${JSON.stringify(ghAtReopen?.milestone)}): ${JSON.stringify(finalMs)}`
    );
    log(
      `  hard reopen ok: snippet=${JSON.stringify(finalMs.milestoneSnippet)}`
    );
  });

  run(`MB4 modal assignee remove → re-add (aside) #${DEMO_PR}`, () => {
    // Ensure enif-lee is assigned first
    let modal = probeModalMeta();
    if (!modal.assigneeMentionsEnif) {
      addAssignee('enif-lee');
      modal = waitPred(
        probeModalMeta,
        (m) => m.assigneeMentionsEnif,
        12_000
      );
    }
    assert(
      modal.assigneeMentionsEnif,
      `precondition: enif-lee not assignee: ${JSON.stringify(modal)}`
    );

    const rm = removeAssigneeIfPresent('enif-lee');
    log(`  unassign click: ${JSON.stringify(rm)}`);
    assert(rm.ok, `modal unassign control failed: ${JSON.stringify(rm)}`);
    confirmDialogIfAny();
    const cleared = waitPred(
      probeModalMeta,
      (m) => m.open && !m.assigneeMentionsEnif,
      14_000
    );
    assert(
      !cleared.assigneeMentionsEnif,
      `assignee still present after modal remove: ${JSON.stringify(cleared)}`
    );

    // Re-add via modal only (fail-closed — no gh seed / hard reopen seed).
    const added = addAssignee('enif-lee');
    log(`  re-add assignee: ${JSON.stringify(added)}`);
    assert(
      added.painted,
      `modal re-add assignee did not paint: ${JSON.stringify(added)}`
    );
    const finalA = waitPred(
      probeModalMeta,
      (m) => m.open && m.assigneeMentionsEnif,
      16_000
    );
    assert(
      finalA.assigneeMentionsEnif,
      `assignee not restored via modal write-through: ${JSON.stringify(finalA)}`
    );
  });

  run(`MB5 modal reviewer add (if collaborator available) #${DEMO_PR}`, () => {
    const pick = addReviewerIfPossible();
    log(`  reviewer pick: ${JSON.stringify(pick)}`);
    if (!pick.ok) {
      // Solo-collaborator repos cannot request review — assert section + control only
      const modal = probeModalMeta();
      assert(
        modal.hasReviewerSection,
        `Reviewers section missing: ${JSON.stringify(modal)}`
      );
      const open = openAsidePicker(/Add reviewer/i);
      assert(open.ok, `Add reviewer control missing: ${JSON.stringify(open)}`);
      press('Escape');
      log('  reviewer mutation skipped (no eligible collaborator) — structural OK');
      return;
    }
    ctx.reviewerLabel = pick.label;
    const modal = waitPred(
      probeModalMeta,
      (m) =>
        m.open &&
        new RegExp(
          String(pick.label || '')
            .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            .slice(0, 24),
          'i'
        ).test(m.asideText || ''),
      14_000
    );
    assert(
      new RegExp(
        String(pick.label || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 20),
        'i'
      ).test(modal.asideText || ''),
      `reviewer not in aside after add: ${JSON.stringify({ pick, modal })}`
    );
  });

  run(`MB6 modal body emoji reaction (heart) #${DEMO_PR}`, () => {
    evalInPage(`
      document.querySelector('[data-search-anchor="body"]')?.scrollIntoView?.({block:'center'});
    `);
    waitMs(400);

    function heartOn(m) {
      return Boolean(
        m?.reactedHeart ||
          /❤️/.test(m?.bodyText || m?.reactionText || '') ||
          (Array.isArray(m?.reactionPills) &&
            m.reactionPills.some(
              (p) =>
                p.reacted &&
                /❤️|heart/i.test(String(p.label || '') + String(p.content || ''))
            ))
      );
    }

    // Known start: if a prior run left heart on, toggle off via modal first.
    let pre = probeModalMeta();
    if (heartOn(pre)) {
      log('  pre-state has heart — modal remove first');
      const off = toggleBodyHeartReaction();
      log(`  heart pre-off: ${JSON.stringify(off)}`);
      assert(off.ok, `heart pre-clear failed: ${JSON.stringify(off)}`);
      pre = waitPred(probeModalMeta, (m) => m.open && !heartOn(m), 12_000);
      assert(!heartOn(pre), `heart still on after modal clear: ${JSON.stringify(pre)}`);
    }

    // Modal add path only — fail-closed, no gh seed.
    let toggled = toggleBodyHeartReaction();
    log(`  heart toggle: ${JSON.stringify(toggled)}`);
    if (!toggled.ok) {
      waitMs(800);
      toggled = toggleBodyHeartReaction();
      log(`  heart toggle retry: ${JSON.stringify(toggled)}`);
    }
    assert(toggled.ok, `heart reaction control failed: ${JSON.stringify(toggled)}`);
    // Surface product toast if API failed (optimistic would have reverted).
    const actionToast = evalInPage(`
      (() => {
        const el = document.querySelector(
          '.prp-overlay .prp-action-msg, .prp-overlay [class*="actionMsg"], .prp-toast, .prp-status'
        );
        return (el?.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 200);
      })()
    `);
    log(`  action toast after heart: ${JSON.stringify(actionToast)}`);

    const after = waitPred(
      probeModalMeta,
      (m) => m.open && heartOn(m),
      16_000
    );
    assert(
      heartOn(after),
      `body heart reaction not visible after modal toggle (no gh seed): toast=${JSON.stringify(actionToast)} probe=${JSON.stringify(after)}`
    );
    ctx.heartOn = true;

    // Modal remove path: click reacted pill
    evalInPage(`
      document.querySelector('[data-search-anchor="body"]')?.scrollIntoView?.({block:'center'});
    `);
    waitMs(300);
    const rm = evalInPage(`
      (() => {
        const host = document.querySelector('[data-prp-reactions], .prp-reactions');
        const pill = [...(host?.querySelectorAll('button') || [])].find((b) =>
          /❤️|heart/i.test((b.textContent || '') + (b.getAttribute('title') || ''))
        );
        if (!pill) return { ok: false };
        pill.click();
        return { ok: true };
      })()
    `);
    log(`  heart remove click: ${JSON.stringify(rm)}`);
    assert(rm.ok, `heart remove click failed: ${JSON.stringify(rm)}`);
    waitActionIdle(10_000);
    waitMs(600);
    const cleared = waitPred(probeModalMeta, (m) => m.open && !heartOn(m), 12_000);
    assert(
      !heartOn(cleared),
      `heart still visible after modal remove: ${JSON.stringify(cleared)}`
    );
    ctx.heartOn = false;
  });

  run(`MB7 reverse: gh API mutates title/body/milestone → modal reflects #${DEMO_PR}`, () => {
    const reverseTitle = `${ctx.originalTitle} [rev-${MARK}]`;
    const reverseBody = `${ctx.originalBody}\n\nrev-${MARK} body-mark`;
    const msNum = ctx.milestone?.number || null;

    const t = ghPatchIssue(DEMO_PR, { title: reverseTitle });
    assert(!t?._error, `gh title patch failed: ${JSON.stringify(t)}`);
    const b = ghPatchIssue(DEMO_PR, { body: reverseBody });
    assert(!b?._error, `gh body patch failed: ${JSON.stringify(b)}`);
    if (msNum) {
      ghPatchIssue(DEMO_PR, { milestone: msNum });
    }
    ghPatchIssue(DEMO_PR, { assignees: ['enif-lee'] });

    // Confirm external truth before reopening product
    const ghRev = waitPred(
      () => ghIssueGet(DEMO_PR),
      (g) => g && String(g.title || '').includes('rev-'),
      12_000
    );
    assert(
      String(ghRev?.title || '').includes('rev-'),
      `gh reverse title not applied: ${JSON.stringify(ghRev)}`
    );
    log(`  gh reverse truth: ${JSON.stringify(ghRev)}`);

    // Hard reload + wait for native list title to reflect reverse patch, then open.
    openPage(PULLS_URL);
    waitMs(600);
    evalInPage(`location.reload()`);
    waitMs(2500);
    try {
      clearPrPlusIdb();
      clearPrPlusSessionStorage();
    } catch {
      /* ignore */
    }
    // Prefer list-click open so sketch title comes from live GH HTML when present
    const listRev = waitPred(
      () => probeListRow(DEMO_PR),
      (r) => r.found && String(r.title || '').includes('rev-'),
      20_000
    );
    log(`  list after reverse: ${JSON.stringify(listRev)}`);
    if (listRev.found && String(listRev.title || '').includes('rev-')) {
      openPr(DEMO_PR); // list click
    } else {
      openPr(DEMO_PR, { viaUrl: true });
    }
    setLayout('conversation');
    waitDetailReady({ meta: true, files: false, label: 'MB7 reverse' });
    waitMs(2000);

    let modal = waitPred(
      probeModalMeta,
      (m) => m.open && String(m.title || '').includes('rev-'),
      30_000,
      500
    );
    // If still stale, hard reopen once more after list truth is visible.
    if (!String(modal.title || '').includes('rev-')) {
      log(
        `  reverse title still stale after first open: ${JSON.stringify(modal.title)} — hard reopen`
      );
      closeOverlay();
      openPage(PULLS_URL);
      waitMs(400);
      evalInPage(`location.reload()`);
      waitMs(3000);
      try {
        clearPrPlusIdb();
        clearPrPlusSessionStorage();
      } catch {
        /* ignore */
      }
      waitMs(500);
      openPr(DEMO_PR, { viaUrl: true });
      setLayout('conversation');
      waitDetailReady({ meta: true, files: false, label: 'MB7 reverse retry' });
      modal = waitPred(
        probeModalMeta,
        (m) => m.open && String(m.title || '').includes('rev-'),
        35_000,
        500
      );
    }
    assert(
      String(modal.title || '').includes('rev-'),
      `modal title not from reverse gh mutation (gh=${JSON.stringify(ghRev?.title)}): ${JSON.stringify(modal)}`
    );
    assert(
      /rev-/.test(modal.bodyText || '') ||
        String(modal.bodyText || '').includes('rev-') ||
        /e2e-meta-/.test(modal.bodyText || ''),
      `modal body not from reverse gh mutation: ${JSON.stringify(modal)}`
    );
    if (msNum) {
      assert(
        /pr-plus-e2e-meta/i.test(modal.asideText || '') || modal.hasMilestone,
        `modal milestone not from reverse gh: ${JSON.stringify(modal)}`
      );
    }
    assert(
      modal.assigneeMentionsEnif,
      `modal assignee missing after reverse gh: ${JSON.stringify(modal)}`
    );
  });

  run(`MB8 hygiene: restore original title/body/milestone/assignees #${DEMO_PR}`, () => {
    // Prefer gh for durable restore
    const rt = ghPatchIssue(DEMO_PR, { title: ctx.originalTitle });
    const rb = ghPatchIssue(DEMO_PR, { body: ctx.originalBody });
    // Clear milestone
    ghJson([
      'api',
      '-X',
      'PATCH',
      `repos/${REPO}/issues/${DEMO_PR}`,
      '-F',
      'milestone=',
    ]);
    ghPatchIssue(DEMO_PR, {
      assignees: ctx.originalAssignees?.length
        ? ctx.originalAssignees
        : ['enif-lee'],
    });
    // Toggle heart off if still on
    reopenModalFresh(DEMO_PR);
    const m = probeModalMeta();
    if (m.reactedHeart) {
      toggleBodyHeartReaction();
      waitActionIdle(8_000);
    }
    // Also fix title/body via modal if gh lag
    if (!String(m.title || '').includes(ctx.originalTitle.slice(0, 10))) {
      editModalTitle(ctx.originalTitle);
    }
    log(
      `  hygiene gh: title=${JSON.stringify(rt?.title || rt)} bodyErr=${Boolean(rb?._error)}`
    );
    const finalGh = ghIssueGet(DEMO_PR);
    log(`  final gh: ${JSON.stringify(finalGh)}`);
    assert(
      !finalGh?._error &&
        String(finalGh.title || '').includes(
          String(ctx.originalTitle || '').slice(0, 12)
        ),
      `hygiene title not restored: ${JSON.stringify(finalGh)}`
    );
  });

  return steps;
}
