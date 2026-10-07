'use strict';
// glob — minimal path glob matcher (`**`, `*`, `?`), forward-slash paths only.
// Enough for CLAUDE.md scope exceptions, sensitive areas and ownership
// manifests without pulling a dependency.

function toRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        // `**/` matches zero or more directories; a trailing `**` matches the rest.
        if (glob[i + 2] === '/') { re += '(?:.*/)?'; i += 2; }
        else { re += '.*'; i += 1; }
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else if ('.+^$(){}|[]\\'.includes(c)) {
      re += '\\' + c;
    } else {
      re += c;
    }
  }
  return new RegExp('^' + re + '$');
}

const cache = new Map();

function matches(glob, filePath) {
  let re = cache.get(glob);
  if (!re) { re = toRegExp(glob); cache.set(glob, re); }
  return re.test(filePath);
}

function matchesAny(globs, filePath) {
  return (globs || []).some(g => matches(g, filePath));
}

module.exports = { toRegExp, matches, matchesAny };
