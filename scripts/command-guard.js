// The Claude Code PreToolUse hook in .claude/settings.json. It reads the hook input as JSON on stdin and rejects a
// shell command that calls node or npx directly, because a global Node.js install on the PATH can run another version
// than the one package.json pins. A rejected command exits with status 2 and a stderr message naming pnpm exec, which
// Claude Code shows the agent; any other command exits with status 0.
// directNodeCall(command) reports whether node or npx starts the command or follows a separator: ;, &, |, a newline,
// ( or a backtick, after optional VAR=value assignments. pnpm exec node and node as an argument pass.
// Run: pnpm exec node scripts/command-guard.js < hook-input.json
import { readFileSync } from 'node:fs';

const DIRECT_CALL = /(?:^|[;&|\n(`])\s*(?:\w+=\S*\s+)*(?:node|npx)(?=$|[\s;&|)`])/;

export const directNodeCall = (command) => DIRECT_CALL.test(command);

const MESSAGE =
  'Run Node.js through pnpm, such as pnpm exec node tests/check-site.js, and run other tools with pnpm exec <tool> ' +
  'instead of npx. Plain node can start a global install with another version than the one package.json pins.';

if (import.meta.main) {
  const { tool_input: input } = JSON.parse(readFileSync(0, 'utf8'));
  if (directNodeCall(input?.command ?? '')) {
    console.error(MESSAGE);
    process.exit(2);
  }
}
