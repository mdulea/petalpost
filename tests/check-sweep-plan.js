// Fails when the sweep plan starts an issue before an open blocker, breaks a tie other than by ascending issue number,
// implements a parent or an issue labelled wontfix, duplicate, invalid, question or blocked, does not resume an issue
// that is not labelled blocked and has an open pull request that closes it, leaves that pull request out of a blocked
// issue's reason, starts an issue whose blocker the run cannot finish, drops a dependency cycle, lists a parent before
// its sub-issue parent, or, given issue numbers, leaves out their sub-issues, blockers or parents or takes in another
// issue.
// Run: pnpm exec node tests/check-sweep-plan.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planSweep } from '../scripts/sweep-plan.js';

const issue = (number, fields = {}) => ({
  number,
  title: `Issue ${number}`,
  labels: [],
  parent: null,
  subIssues: [],
  blockedBy: [],
  ...fields,
});
const open = (number) => ({ number, state: 'OPEN' });
const closed = (number) => ({ number, state: 'CLOSED' });
const numbers = (items) => items.map((item) => item.number);

test('blockers come first, and ties go to the lower issue number', () => {
  const plan = planSweep([
    issue(5),
    issue(3, { blockedBy: [open(7)] }),
    issue(7),
    issue(4, { blockedBy: [closed(1)] }),
  ]);
  assert.deepEqual(numbers(plan.order), [4, 5, 7, 3]);
  assert.deepEqual(plan.order[3], { number: 3, title: 'Issue 3', blockedBy: [7] });
});

test('parents and skipped labels are not implemented, and blocked issues are held', () => {
  const plan = planSweep([
    issue(1, { subIssues: [open(2), closed(9)] }),
    issue(2, { parent: 1 }),
    issue(3, { labels: ['wontfix'] }),
    issue(4, { labels: ['question', 'bug'] }),
    issue(5, { labels: ['blocked'] }),
    issue(6, { subIssues: [closed(8)] }),
  ]);
  assert.deepEqual(numbers(plan.order), [2]);
  assert.deepEqual(plan.parents, [
    { number: 1, title: 'Issue 1', subIssues: [2] },
    { number: 6, title: 'Issue 6', subIssues: [] },
  ]);
  assert.deepEqual(plan.held, [{ number: 5, title: 'Issue 5', reason: 'labelled blocked' }]);
});

test('in-progress issues rejoin with their open pull request or are held without one', () => {
  const plan = planSweep(
    [issue(1, { labels: ['in-progress'] }), issue(2, { labels: ['in-progress'] }), issue(3, { blockedBy: [open(1)] })],
    [{ number: 40, closes: [1] }],
  );
  assert.deepEqual(plan.resume, [{ number: 1, title: 'Issue 1', pr: 40 }]);
  assert.deepEqual(numbers(plan.order), [3]);
  assert.deepEqual(plan.held, [{ number: 2, title: 'Issue 2', reason: 'left in progress by an earlier run' }]);
});

test('an issue with an open pull request that closes it resumes whatever its labels, unless labelled blocked', () => {
  const plan = planSweep(
    [issue(1), issue(2, { labels: ['blocked'] }), issue(3, { labels: ['bug'] })],
    [
      { number: 40, closes: [1] },
      { number: 41, closes: [2, 3] },
    ],
  );
  assert.deepEqual(plan.resume, [
    { number: 1, title: 'Issue 1', pr: 40 },
    { number: 3, title: 'Issue 3', pr: 41 },
  ]);
  assert.deepEqual(plan.order, []);
  assert.deepEqual(plan.held, [{ number: 2, title: 'Issue 2', reason: 'labelled blocked, pull request #41 open' }]);
});

test('an issue whose blocker the run cannot finish is held, and so are its dependents', () => {
  const plan = planSweep([
    issue(1, { labels: ['blocked'] }),
    issue(2, { blockedBy: [open(1)] }),
    issue(3, { blockedBy: [open(2)] }),
    issue(4, { blockedBy: [open(99)] }),
  ]);
  assert.deepEqual(plan.order, []);
  assert.deepEqual(
    plan.held.map(({ number, reason }) => `${number} ${reason}`),
    ['1 labelled blocked', '2 blocked by #1', '3 blocked by #2', '4 blocked by #99'],
  );
});

test('issues in a dependency cycle are held', () => {
  const plan = planSweep([issue(1, { blockedBy: [open(2)] }), issue(2, { blockedBy: [open(1)] }), issue(3)]);
  assert.deepEqual(numbers(plan.order), [3]);
  assert.deepEqual(
    plan.held.map(({ number, reason }) => `${number} ${reason}`),
    ['1 dependency cycle', '2 dependency cycle'],
  );
});

test('a parent comes after the parents among its sub-issues', () => {
  const plan = planSweep([
    issue(1, { subIssues: [open(2)] }),
    issue(2, { parent: 1, subIssues: [open(3)] }),
    issue(3, { parent: 2 }),
  ]);
  assert.deepEqual(numbers(plan.parents), [2, 1]);
  assert.deepEqual(numbers(plan.order), [3]);
});

test('given issue numbers, the plan takes their sub-issues, blockers and parents and nothing else', () => {
  const issues = [
    issue(1, { subIssues: [open(2), open(3)] }),
    issue(2, { parent: 1, subIssues: [open(4)] }),
    issue(3, { parent: 1 }),
    issue(4, { parent: 2, blockedBy: [open(5)] }),
    issue(5),
    issue(6),
  ];
  const plan = planSweep(issues, [], [2]);
  assert.deepEqual(numbers(plan.order), [5, 4]);
  assert.deepEqual(numbers(plan.parents), [2, 1]);
  assert.deepEqual(plan.held, []);
  assert.deepEqual(planSweep(issues, [], [8]).held, [{ number: 8, title: '', reason: 'not an open issue' }]);
});
