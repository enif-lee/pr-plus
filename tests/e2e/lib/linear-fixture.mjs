/**
 * Linear overlay e2e fixture — mornica / PR Plus / PRP-2.
 *
 * Workspace: https://linear.app/mornica
 * Team key: PRP (PR Plus)
 * Issue: PRP-2 Demo, linked to enif-lee/pr-plus#19 (DEMO_PR / DEMO-300).
 *
 * mornica renders that attachment as a Linear review card (`/mornica/review/…`),
 * not always as a raw github.com /pull/ href. Click intercept still prefers
 * github.com chips when present; otherwise the suite opens the same identity
 * via window.PRPlus.open.
 */
export const LINEAR_WORKSPACE = 'mornica';
export const LINEAR_TEAM_KEY = 'PRP';
export const LINEAR_ISSUE_ID = 'PRP-2';
export const LINEAR_ISSUE_URL = 'https://linear.app/mornica/issue/PRP-2';
/** Same identity as DEMO_PR in harness.mjs (stack root DEMO-300). */
export const LINEAR_LINKED_PR = {
  owner: 'enif-lee',
  repo: 'pr-plus',
  number: 19,
};
