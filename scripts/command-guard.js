// The Claude Code PreToolUse hook in .claude/settings.json. It reads the hook input as JSON on stdin and rejects a
// shell command that calls node or npx directly, because a global Node.js install on the PATH can run another version
// than the one package.json pins. It also rejects a check command whose exit status the rest of the command hides. A
// rejected command exits with status 2 and a stderr message for its rule, which Claude Code shows the agent; any
// other command exits with status 0. The hook command in .claude/settings.json turns a pnpm that fails to start into
// status 2 too, so a broken pnpm blocks every command instead of turning the guard off.
// directNodeCall(command) reports whether node or npx starts the command or follows a separator: ;, &, |, a newline,
// ( or a backtick, after optional VAR=value assignments. pnpm exec node and node as an argument pass.
// hiddenCheckStatus(command) reports whether pnpm check, pnpm check:fast or pnpm test:browser pipes into tail, head or
// grep in a command that names neither pipefail nor PIPESTATUS, or is followed by ; and a final echo of $?. Node
// checks run by file take seconds, so they pass.
// Run: pnpm exec node scripts/command-guard.js < hook-input.json
import { readFileSync } from 'node:fs';

const DIRECT_CALL = /(?:^|[;&|\n(`])\s*(?:\w+=\S*\s+)*(?:node|npx)(?=$|[\s;&|)`])/;

export const directNodeCall = (command) => DIRECT_CALL.test(command);

const CHECK = /\bpnpm(?:\s+-[-\w]+)*\s+(?:check(?::fast)?|test:browser)(?![-\w:])/.source;
const PIPED_CHECK = new RegExp(CHECK + /[^;\n]*?(?<!\|)\|(?!\|)\s*(?:tail|head|grep)\b/.source);
const ECHOED_CHECK = new RegExp(CHECK + /[^\n]*;\s*echo\b[^;&|\n]*\$\?\W*$/.source);

export const hiddenCheckStatus = (command) =>
  (PIPED_CHECK.test(command) && !/\b(?:pipefail|PIPESTATUS)\b/.test(command)) || ECHOED_CHECK.test(command);

const NODE_MESSAGE =
  'Run Node.js through pnpm, such as pnpm exec node tests/check-site.js, and run other tools with pnpm exec <tool> ' +
  'instead of npx. Plain node can start a global install with another version than the one package.json pins.';

const CHECK_MESSAGE =
  'This command exits with the status of tail, head, grep or echo, so a failed check looks like a passed one. ' +
  'Keep the shortened output and the real status with set -o pipefail; pnpm check 2>&1 | tail -20, and drop a ' +
  'trailing ; echo exit $?, because the shell already reports the exit status.';

if (import.meta.main) {
  const { tool_input: input } = JSON.parse(readFileSync(0, 'utf8'));
  const command = input?.command ?? '';
  const message = directNodeCall(command) ? NODE_MESSAGE : hiddenCheckStatus(command) ? CHECK_MESSAGE : '';
  if (message) {
    console.error(message);
    process.exit(2);
  }
}
