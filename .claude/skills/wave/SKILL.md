---
name: wave
description: Implement several petalpost issues in parallel headless sessions, one issue each, then merge their pull requests in order.
disable-model-invocation: true
---

# Invariants

- Coordinator = current session; context = issue list + pull request numbers + states; budget <40k tokens; read only `--json` fields named in Workflow; implementer transcripts, diffs, check logs forbidden
- One issue per implementer; implementer = top-level headless `claude -p` session, so `review` starts subagents; subagent implementers forbidden
- Skill invocation == user request to push, open + squash-merge listed issues' pull requests; overrides AGENTS.md Workflow ask-first rules for listed pull requests only
- Worktree add/remove: coordinator only, serially, from main checkout
- Max 3 concurrent implementers; browser checks share machine
- Stop, ask user: pull request adds file under `server/migrations/` (production migration precedes merge; `pnpm migrate` against Neon forbidden) | implementer ends `BLOCKED` | conflict touches behavior both pull requests change
- Git Bash: prefix `claude -p` with `MSYS_NO_PATHCONV=1`; else leading `/` of prompt becomes Windows path

# Workflow

1. Args = issue numbers or one parent issue; parent -> open sub-issues: `gh api repos/{owner}/{repo}/issues/<n>/sub_issues --jq '.[] | select(.state=="open") | .number'`
2. Per issue: `gh issue view <n> --json title,state --jq '.state + " " + .title'` + blockers `gh api repos/{owner}/{repo}/issues/<n>/dependencies/blocked_by --jq '[.[] | {number,state}]'`; frontier = open issues with every blocker closed or outside list; show title, blockers, frontier; user confirms before step 3
3. Run dir: `RUN=$(mktemp -d)`; print path
4. Per frontier issue, up to 3, serially in main checkout: `pnpm worktree add <type> <task>`; type per README Workflow; task = issue title in 2-4 lowercase hyphenated words
5. Per worktree: Bash `run_in_background: true`, cwd = worktree:

```sh
MSYS_NO_PATHCONV=1 claude -p "/implement gh issue <n>. Coordinated run: you are in worktree .worktrees/<type>-<task> on branch <type>/<task>; skip pnpm worktree add. Questions you would ask the user -> stop and end with BLOCKED <question>. Branch ready once pnpm fix and pnpm check pass: push, open the pull request with gh pr create and a body per the pr skill, Closes #<n> in the body. Never merge. Last line: PR <number> or BLOCKED <reason>." --permission-mode auto --output-format json > "$RUN/<n>.json"
```

6. Exit notification -> `jq -r '.result | split("\n") | last' "$RUN/<n>.json"` + `jq '.permission_denials' "$RUN/<n>.json"`; denials non-empty or `BLOCKED` -> report to user, keep worktree, continue others; freed slot -> next frontier issue, step 4
7. Merge serially in issue-list order, per `PR <number>`:

- `gh pr view <pr> --json files --jq '[.files[].path | select(startswith("server/migrations/"))]'` non-empty -> stop, ask user
- `gh pr checks <pr> --watch --interval 30 | tail -3`; fail -> report, skip
- `gh pr view <pr> --json mergeStateStatus --jq .mergeStateStatus` == `DIRTY` -> in its worktree `git fetch -q origin && git rebase origin/main`, resolve, `pnpm check`, `git push --force-with-lease`, watch checks again
- `gh pr merge <pr> --squash`
- main checkout: `git pull --ff-only`, `pnpm worktree remove <type>-<task>`

8. Merges unblock issues -> recompute frontier per step 2 without asking again; repeat until list done or every remaining issue blocked or stopped

# Output

Table columns: issue, pull request, state (merged | blocked | failed checks | waiting for migration), one-line reason; then kept worktrees + run dir path.
