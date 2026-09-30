'use strict';
// git-readonly — the ONLY place in change-reviewer that executes git.
//
// The reviewer must be structurally unable to modify the worktree it judges.
// Every git call goes through `git()`, which accepts a closed table of
// read-only subcommands. `checkout`, `reset`, `pull`, `rebase`, `merge`,
// `commit`, `add`, `stash`, `push` and friends are not "avoided": they are
// absent from the table, so there is no code path that can reach them.
//
// Two extra rails, because a read-only subcommand can still write:
//   - flags that redirect output to disk or re-point git at another
//     repository (`--output`, `-o`, `--git-dir`, `--work-tree`, `-c`, `-C`)
//     are rejected;
//   - GIT_OPTIONAL_LOCKS=0 stops `status`/`diff` from refreshing the index,
//     and GIT_TERMINAL_PROMPT=0 makes any accidental network path fail fast
//     instead of hanging on a prompt.
//
// Zero deps. Node >= 18.

const { execFileSync } = require('child_process');

const ALLOWED_SUBCOMMANDS = Object.freeze([
  'diff',
  'rev-parse',
  'ls-files',
  'show',
  'log',
  'status',
  'merge-base',
  'cat-file',
  'rev-list',
]);

// Option shapes that turn a read into a write or move the target repository.
const FORBIDDEN_OPTIONS = Object.freeze([
  /^--output(=|$)/,
  /^-o$/,
  /^--git-dir(=|$)/,
  /^--work-tree(=|$)/,
  /^-c$/,
  /^-C$/,
  /^--config-env(=|$)/,
  /^--exec-path(=|$)/,
  /^--namespace(=|$)/,
  /^--super-prefix(=|$)/,
]);

const MAX_BUFFER = 256 * 1024 * 1024;

class GitReadOnlyError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GitReadOnlyError';
  }
}

class GitCommandError extends Error {
  constructor(args, cause) {
    const stderr = cause && cause.stderr ? String(cause.stderr).trim() : '';
    super(`git ${args.join(' ')} failed${stderr ? `: ${stderr}` : ''}`);
    this.name = 'GitCommandError';
    this.args = args;
    this.status = cause && typeof cause.status === 'number' ? cause.status : null;
    this.stderr = stderr;
    this.code = cause && cause.code ? cause.code : null;
  }
}

function assertReadOnly(args) {
  if (!Array.isArray(args) || args.length === 0) {
    throw new GitReadOnlyError('git call requires a subcommand');
  }
  const sub = args[0];
  if (!ALLOWED_SUBCOMMANDS.includes(sub)) {
    throw new GitReadOnlyError(`git subcommand "${sub}" is not in the read-only allowlist`);
  }
  for (const a of args.slice(1)) {
    if (typeof a !== 'string') throw new GitReadOnlyError('git arguments must be strings');
    for (const re of FORBIDDEN_OPTIONS) {
      if (re.test(a)) throw new GitReadOnlyError(`git option "${a}" is forbidden in read-only mode`);
    }
  }
}

// Runs git with read-only guarantees. Returns stdout as a string by default,
// or a Buffer when opts.buffer is true. Throws GitReadOnlyError before
// spawning when the call is not read-only, and GitCommandError when git fails.
function git(cwd, args, opts = {}) {
  assertReadOnly(args);
  try {
    const out = execFileSync('git', ['--no-pager', ...args], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: MAX_BUFFER,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
        GIT_OPTIONAL_LOCKS: '0',
        LC_ALL: 'C',
      },
    });
    return opts.buffer ? out : out.toString('utf8');
  } catch (e) {
    throw new GitCommandError(args, e);
  }
}

module.exports = {
  ALLOWED_SUBCOMMANDS,
  FORBIDDEN_OPTIONS,
  GitReadOnlyError,
  GitCommandError,
  assertReadOnly,
  git,
};
