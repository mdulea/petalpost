---
name: sweep
description: Work through open petalpost issues in dependency order, one headless session and one pull request per issue, merging up to 15 pull requests.
disable-model-invocation: true
---

# Invariants

- Coordinator = current session, in main checkout; context = plan + pull request numbers + states + session IDs; budget <100k tokens; read only command output named in Workflow; implementer transcripts, diffs, check logs forbidden; code edits forbidden
- Skill invocation == user request to label, comment on, push, open, squash-merge and close planned issues and their pull requests; overrides AGENTS.md Workflow ask-first rules for planned issues only
- Implementer = top-level headless `claude -p` session, one issue, own worktree, so `review` starts subagents; subagent implementers forbidden
- Limits: max 3 running implementers; start implementer only while merged + in progress < `max`; stop after `max` merges or per step 12
- Worktree add/remove: coordinator only, serially, from main checkout; worktree dir = branch with `/` -> `-`
- Migrations: production migrations only via coordinator, only per step 8; implementers + fix sessions: `pnpm migrate` against Neon forbidden; migration keeps deployed code working, production runs previous code until merge deploys; failure example: renaming a column the deployed code reads
- Git Bash: prefix every `claude -p` with `MSYS_NO_PATHCONV=1`; else leading `/` of prompt becomes Windows path
- Comments start with `> Written by the sweep coordinator.`

# Workflow

1. Args: `--max <n>` (default 15), issue numbers (optional). `RUN=$(pwd -W)/.sweep/$(date +%Y%m%d-%H%M)`, Windows path for implementers; `mkdir -p "${RUN}"`
2. Labels: `gh label create in-progress --force --color fbca04 --description "A sweep run works on this issue"`; `gh label create blocked --force --color b60205 --description "A sweep run gave up; remove the label to retry"`
3. `pnpm -s sweep-plan <issue numbers> > "${RUN}/plan.json"`; print one line per `order`, `resume`, `parents`, `held` item via `jq`; start without confirmation
4. Done set = closed issues; parents with empty `subIssues` -> close now per step 10
5. Per `resume` item: branch `gh pr view <pr> --json headRefName --jq .headRefName`; counts as in progress; merge per step 8; session ID unknown -> fixes per step 9 start new session in its worktree, worktree missing -> block
6. Start next `order` item with every `blockedBy` in done set, while limits allow, ascending plan position:

- `gh issue edit <n> --add-label in-progress`
- main checkout: `pnpm worktree add <type> <task>`; type per README Workflow; task = issue title in 2-4 lowercase hyphenated words
- Bash `run_in_background: true`, cwd = worktree:

```sh
MSYS_NO_PATHCONV=1 claude -p "/implement gh issue <n>. Coordinated sweep run: you are in worktree .worktrees/<type>-<task> on branch <type>/<task>; skip pnpm worktree add. Questions you would ask the user -> stop and end with BLOCKED <question>. Branch ready once pnpm fix and pnpm check pass: draft the body with the pr skill, include Closes #<n>, push, open the pull request with gh pr create. Never merge. Then run the retrospective skill on this session and write its findings, at most 300 words, to <RUN>/<n>.retro.md. Last line: PR <number> or BLOCKED <reason>." --permission-mode auto --output-format json > "<RUN>/<n>.json"
```

7. Exit notification -> `jq -r '.session_id, (.permission_denials | length), (.result | split("\n") | last)' "${RUN}/<n>.json"`; record session ID; `PR <number>` + zero denials -> step 8; else block with last line or denials
8. Per pull request: background `gh pr checks <pr> --watch --interval 30 > /dev/null; gh pr view <pr> --json mergeStateStatus --jq .mergeStateStatus` -> notification:

- checks failed: `gh pr checks <pr> --json name,state --jq '.[] | select(.state=="FAILURE") | .name'` -> step 9
- `DIRTY` -> step 9 with conflict
- else `gh pr view <pr> --json files --jq '[.files[].path | select(startswith("server/migrations/"))] | .[]'` non-empty -> cwd = worktree: `pnpm -s exec node --env-file=../../.env.local server/migrate.js > "<RUN>/<n>.migrate.txt" 2>&1; echo $?`; != 0 -> block `migration failed: <first line containing Error in <n>.migrate.txt>`; else record applied files for report
- then `gh pr merge <pr> --squash`; merge refused for conflict -> step 9; merged -> step 10

9. Fix, max 2 attempts per pull request, then block; last line `PUSHED` -> step 8, else block; background, cwd = worktree:

```sh
MSYS_NO_PATHCONV=1 claude -p --resume <session id> "Coordinated fix for pull request <pr>: <failed check names | merge conflict with main>. In this worktree: on conflict git fetch -q origin and git rebase origin/main, then resolve; fix; pnpm fix; pnpm check; git push --force-with-lease. Then add this fix's findings to <RUN>/<n>.retro.md, at most 300 words in total. Never merge. Last line: PUSHED or BLOCKED <reason>." --permission-mode auto --output-format json > "<RUN>/<n>.fix<attempt>.json"
```

10. After merge: main checkout `git pull --ff-only` + `pnpm worktree remove <worktree dir>`; `gh issue edit <n> --remove-label in-progress`; `gh issue view <n> --json state --jq .state` != `CLOSED` -> `gh issue close <n> --comment "<marker> Closed by #<pr>."`; add `<n>` to done set; record report line; per `parents` item in plan order whose `subIssues` all in done set: `gh issue close <p> --comment "<marker> Closed after its sub-issues merged: #<pr>, #<pr>."` + add `<p>` to done set; back to step 6
11. Block `<n>` with reason: `gh issue edit <n> --remove-label in-progress --add-label blocked`; `gh issue comment <n> --body "<marker> <reason>. Worktree kept: .worktrees/<dir>. Remove the blocked label to retry."`; `order` items depending on `<n>`, directly or through other items -> held `blocked by #<n>`
12. Stop: running implementers and fixes finished + (`max` merges | every remaining `order` item waits on blocked or held issues); unstarted `order` items -> held `not started, limit reached` | `blocked by #<b>`
13. Retrospectives: run `retrospective` skill on current session; read `${RUN}/*.retro.md`; merge duplicate findings, keep sources as issue numbers; order by severity
14. Write report per Output to `${RUN}/report.md`; print it

# Output

Report template:

```markdown
## Pull requests

- [#<pr>](url) <title>. Closes [#<n>](url), [#<parent>](url). <Applied migration <file>, <file>.>

## Held issues

- [#<n>](url) <title>. <blocked: reason | blocked by #<b> | not started, limit reached | plan reason>.

## Findings

1. <finding>. Sources: #<n>, #<n>.

Run files: .sweep/<run>/
```
