// Plans a sweep run, which the sweep skill in .claude/skills/sweep/ starts. planSweep(issues, pulls, only) takes the open
// issues as { number, title, labels, parent, subIssues, blockedBy }, where subIssues and blockedBy list { number, state },
// and the open pull requests as { number, closes }. It returns:
// - order: the issues to implement, each with the open blockers it waits for, blockers first, ties by ascending number
// - resume: in-progress issues with an open pull request that closes them, to watch and merge
// - parents: open issues with sub-issues, never implemented, each with its open sub-issues, sub-issue parents first
// - held: issues the run leaves alone, each with the reason
// An issue labelled wontfix, duplicate, invalid or question is left out. An open blocker outside order, resume and
// parents holds its dependents. Given issue numbers in only, the plan covers them, their sub-issues and blockers, and
// the parents above them.
// Run: pnpm sweep-plan [issue numbers]
import { execFileSync } from 'node:child_process';

const SKIPPED = ['wontfix', 'duplicate', 'invalid', 'question'];

const QUERY = `query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    issues(first: 100, states: OPEN) {
      pageInfo { hasNextPage }
      nodes {
        number title
        labels(first: 20) { nodes { name } }
        parent { number }
        subIssues(first: 50) { nodes { number state } }
        blockedBy(first: 50) { nodes { number state } }
      }
    }
    pullRequests(first: 100, states: OPEN) {
      pageInfo { hasNextPage }
      nodes { number closingIssuesReferences(first: 20) { nodes { number } } }
    }
  }
}`;

const openNumbers = (refs) => refs.filter((ref) => ref.state === 'OPEN').map((ref) => ref.number);

// The issues that only names, their open sub-issues and blockers, repeated, and the parents above all of them.
const scope = (byNumber, only) => {
  const covered = new Set();
  const visit = (number) => {
    const issue = byNumber.get(number);
    if (!issue || covered.has(number)) return;
    covered.add(number);
    [...openNumbers(issue.subIssues), ...openNumbers(issue.blockedBy)].forEach(visit);
  };
  only.forEach(visit);
  for (const number of [...covered]) {
    for (let parent = byNumber.get(number).parent; byNumber.has(parent); parent = byNumber.get(parent).parent) {
      covered.add(parent);
    }
  }
  return covered;
};

export const planSweep = (allIssues, pulls = [], only = []) => {
  const known = new Map(allIssues.map((issue) => [issue.number, issue]));
  const held = only
    .filter((number) => !known.has(number))
    .map((number) => ({ number, title: '', reason: 'not an open issue' }));
  const covered = only.length ? scope(known, only) : new Set(known.keys());
  const issues = allIssues
    .filter((issue) => covered.has(issue.number) && !issue.labels.some((label) => SKIPPED.includes(label)))
    .sort((a, b) => a.number - b.number);
  const byNumber = new Map(issues.map((issue) => [issue.number, issue]));
  const hold = (issue, reason) => held.push({ number: issue.number, title: issue.title, reason });

  const parentIssues = issues.filter((issue) => issue.subIssues.length);
  const height = (issue) =>
    1 +
    Math.max(
      0,
      ...openNumbers(issue.subIssues).map((n) => (byNumber.get(n)?.subIssues.length ? height(byNumber.get(n)) : 0)),
    );
  const parents = parentIssues
    .map((issue) => ({ issue, height: height(issue) }))
    .sort((a, b) => a.height - b.height || a.issue.number - b.issue.number)
    .map(({ issue }) => ({ number: issue.number, title: issue.title, subIssues: openNumbers(issue.subIssues) }));

  const resume = [];
  const candidates = new Map();
  for (const issue of issues) {
    if (issue.subIssues.length) continue;
    if (issue.labels.includes('blocked')) hold(issue, 'labelled blocked');
    else if (issue.labels.includes('in-progress')) {
      const pull = pulls.find((p) => p.closes.includes(issue.number));
      if (pull) resume.push({ number: issue.number, title: issue.title, pr: pull.number });
      else hold(issue, 'left in progress by an earlier run');
    } else candidates.set(issue.number, issue);
  }

  // A blocker the run finishes elsewhere, as a resumed pull request or a parent, waits at run time only.
  const finishedElsewhere = new Set([...resume.map((r) => r.number), ...parents.map((p) => p.number)]);
  const order = [];
  const placed = new Set();
  const unplaceable = new Map();
  for (let changed = true; changed;) {
    changed = false;
    for (const issue of candidates.values()) {
      if (placed.has(issue.number) || unplaceable.has(issue.number)) continue;
      const blockers = openNumbers(issue.blockedBy);
      const lost =
        blockers.find((b) => !candidates.has(b) && !finishedElsewhere.has(b)) ??
        blockers.find((b) => unplaceable.has(b));
      if (lost !== undefined) {
        unplaceable.set(issue.number, `blocked by #${lost}`);
        changed = true;
      } else if (blockers.every((b) => finishedElsewhere.has(b) || placed.has(b))) {
        order.push({ number: issue.number, title: issue.title, blockedBy: blockers });
        placed.add(issue.number);
        changed = true;
        break;
      }
    }
  }

  // What is left waits on itself through its blockers or on such an issue.
  const inCycle = (start) => {
    const seen = new Set();
    const walk = (number) =>
      openNumbers(candidates.get(number).blockedBy).some(
        (b) => b === start || (candidates.has(b) && !placed.has(b) && !seen.has(b) && seen.add(b) && walk(b)),
      );
    return walk(start);
  };
  for (const issue of candidates.values()) {
    if (placed.has(issue.number)) continue;
    const reason =
      unplaceable.get(issue.number) ??
      (inCycle(issue.number)
        ? 'dependency cycle'
        : `blocked by #${openNumbers(issue.blockedBy).find((b) => candidates.has(b) && !placed.has(b))}`);
    hold(issue, reason);
  }

  held.sort((a, b) => a.number - b.number);
  return { order, resume, parents, held };
};

const fetchOpen = () => {
  const output = execFileSync(
    'gh',
    ['api', 'graphql', '-f', `query=${QUERY}`, '-F', 'owner={owner}', '-F', 'name={repo}'],
    { encoding: 'utf8' },
  );
  const { issues, pullRequests } = JSON.parse(output).data.repository;
  if (issues.pageInfo.hasNextPage || pullRequests.pageInfo.hasNextPage) {
    throw new Error('More than 100 open issues or pull requests; sweep-plan reads the first 100 only.');
  }
  return {
    issues: issues.nodes.map((node) => ({
      number: node.number,
      title: node.title,
      labels: node.labels.nodes.map((label) => label.name),
      parent: node.parent?.number ?? null,
      subIssues: node.subIssues.nodes,
      blockedBy: node.blockedBy.nodes,
    })),
    pulls: pullRequests.nodes.map((node) => ({
      number: node.number,
      closes: node.closingIssuesReferences.nodes.map((ref) => ref.number),
    })),
  };
};

if (import.meta.main) {
  const args = process.argv.slice(2);
  const bad = args.find((arg) => !/^#?\d+$/.test(arg));
  if (bad) {
    console.error(`Not an issue number: ${bad}. Usage: pnpm sweep-plan [issue numbers]`);
    process.exit(1);
  }
  const { issues, pulls } = fetchOpen();
  console.log(
    JSON.stringify(
      planSweep(
        issues,
        pulls,
        args.map((arg) => Number(arg.replace('#', ''))),
      ),
    ),
  );
}
