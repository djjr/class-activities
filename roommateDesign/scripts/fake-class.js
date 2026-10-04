#!/usr/bin/env node
// Command-line fake class. The same generator runs in the browser at
// /test/fake-class.html?key=<KEY>; see public/test/fake-class.js.
//
//   node scripts/fake-class.js --url https://<app>.up.railway.app --key <KEY> [options]
//
// Options:
//   --n 25          number of students (default 25)
//   --delay 0       ms between students; e.g. 1500 to watch results arrive live
//   --new           start a fresh session first (replaces the current one)
//   --code ABCD     use this session code instead of asking the server (no key needed)

const FakeClass = require('../public/test/fake-class.js');

const args = process.argv.slice(2);
function opt(name, fallback) {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const next = args[i + 1];
  return next === undefined || next.startsWith('--') ? true : next;
}

FakeClass.run({
  base: String(opt('url', 'http://localhost:3000')).replace(/\/$/, ''),
  key: opt('key', process.env.INSTRUCTOR_KEY || 'dev'),
  n: Number(opt('n', 25)),
  delay: Number(opt('delay', 0)),
  newSession: !!opt('new', false),
  code: opt('code', null),
  log: line => console.log(line),
}).catch(e => {
  console.error(e.message);
  process.exit(1);
});
