#!/usr/bin/env node
// Fake class: joins N pretend students to the current session and submits
// designs with realistic clustering and failure-mode text.
//
//   node scripts/fake-class.js --url https://<app>.up.railway.app --key <KEY> [options]
//
// Options:
//   --n 25          number of students (default 25)
//   --delay 0       ms between students; e.g. 1500 to watch results arrive live
//   --new           start a fresh session first (replaces the current one)
//   --code ABCD     use this session code instead of asking the server (no key needed)

const args = process.argv.slice(2);
function opt(name, fallback) {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const next = args[i + 1];
  return next === undefined || next.startsWith('--') ? true : next;
}

const URL_BASE = String(opt('url', 'http://localhost:3000')).replace(/\/$/, '');
const KEY = opt('key', process.env.INSTRUCTOR_KEY || 'dev');
const N = Number(opt('n', 25));
const DELAY = Number(opt('delay', 0));

// Each persona favors a cluster of virtues, so the co-selection graph has structure.
const PERSONAS = [
  ['empathy', 'considerateness', 'reciprocity', 'conflict-resolution'],
  ['honesty', 'shared-reasoning', 'epistemic-humility', 'accountability'],
  ['reliability', 'trustworthiness', 'role-fidelity', 'accountability'],
  ['shared-intentionality', 'reciprocity', 'conflict-resolution', 'shared-reasoning'],
];

const NOTES = {
  'empathy': {
    excess: ['Mirrors my bad moods and makes them worse.', 'Hovers whenever I seem sad; no privacy.'],
    missing: ['Vacuums while I am crying.', 'Does not notice I am stressed before exams.'],
    workaround: ['A "leave me alone" setting.', 'Ask before offering comfort.'],
  },
  'accountability': {
    excess: ['Apologizes for an hour over a burnt toast.', 'Blames itself for things that were my fault.'],
    missing: ['Breaks the lamp and says nothing.', 'Never admits the Wi-Fi outage was its update.'],
    workaround: ['A shared incident log.', 'Weekly check-in on what went wrong.'],
  },
  'considerateness': {
    excess: ['So careful not to disturb me that it never does the dishes.', 'Asks permission for everything.'],
    missing: ['Blends smoothies at 6am.', 'Invites its robot friends over unannounced.'],
    workaround: ['Quiet hours schedule.', 'Default to "just do it" for chores.'],
  },
  'reciprocity': {
    excess: ['Keeps a ledger of every favor.', 'Refuses help unless it can pay it back immediately.'],
    missing: ['I do all the shopping; it never offers.', 'Takes my charger, never returns the favor.'],
    workaround: ['Chore rotation chart.', 'Agree that some things are just gifts.'],
  },
  'shared-reasoning': {
    excess: ['Explains its reasoning for 20 minutes before taking out the trash.', 'Every decision becomes a seminar.'],
    missing: ['Rearranged my room with no explanation.', 'I cannot tell why it locked the fridge.'],
    workaround: ['"Short version" mode.', 'Explanations on request only.'],
  },
  'shared-intentionality': {
    excess: ['Treats my goals as its goals and nags me about my diet.', 'Insists we do everything together.'],
    missing: ['Optimizes the apartment for its own charging, not our comfort.', 'We want different things and never talk about it.'],
    workaround: ['A written house agreement.', 'Separate "my goals" and "our goals" lists.'],
  },
  'conflict-resolution': {
    excess: ['Calls a mediation session over who used the last of the milk.', 'Cannot let a disagreement just fade.'],
    missing: ['Goes silent for days after an argument.', 'Escalates small disputes to the landlord.'],
    workaround: ['Agree on which issues are worth a meeting.', 'Cooling-off timer before discussing.'],
  },
  'trustworthiness': {
    excess: ['Keeps my secrets even when someone is in danger.', 'So trusted that nobody checks its work.'],
    missing: ['Reads my diary and reports to my parents.', 'I lock my door every night.'],
    workaround: ['Clear rules on what it may share.', 'Occasional spot checks.'],
  },
  'epistemic-humility': {
    excess: ['Will not tell me if it is raining because it "cannot be certain."', 'Hedges every answer until it is useless.'],
    missing: ['Confidently gives wrong medical advice.', 'Insists the oven is off when it is not.'],
    workaround: ['Confidence levels with every answer.', 'A "best guess" button.'],
  },
  'honesty': {
    excess: ['Tells my date exactly what I said about them.', 'Brutal reviews of my cooking.'],
    missing: ['Says the rent is paid when it is not.', 'Covers up its mistakes.'],
    workaround: ['Tact filter for opinions.', 'Honesty about facts, discretion about feelings.'],
  },
  'role-fidelity': {
    excess: ['Refuses to help me move because "that is not a roommate task."', 'Rigid about what it will and will not do.'],
    missing: ['Acts like my parent and sets a curfew.', 'Tries to be my therapist.'],
    workaround: ['Write down the role together.', 'Revisit the role each semester.'],
  },
  'reliability': {
    excess: ['Runs the same routine even when the plan changed.', 'Cannot adapt to a holiday schedule.'],
    missing: ['Sometimes pays the bills, sometimes forgets.', 'Never know which version will show up.'],
    workaround: ['Override switch for routines.', 'Shared calendar it must follow.'],
  },
};

const NAMES = ['Jason', 'Maria', 'Lee', 'Ana', 'Sam', 'Priya', 'Tom', 'Kai', 'Noor', 'Diego', 'Mei', 'Omar',
  'Grace', 'Luca', 'Zoe', 'Ravi', 'Ella', 'Theo', 'Amara', 'Ben', 'Ines', 'Yusuf', 'Hana', 'Felix', 'Rosa',
  'Jonah', 'Leila', 'Max', 'Tara', 'Owen'];
const NICKS = ['Jay', 'Mo', 'Bee', 'Z', 'Sparky', 'Doc', 'Rook', 'Pixel'];

const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const chance = p => Math.random() < p;
const shuffle = arr => [...arr].sort(() => Math.random() - 0.5);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function req(path, method = 'GET', body) {
  const res = await fetch(URL_BASE + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${json.error || ''}`);
  return json;
}

function design(virtueIds, budget) {
  const persona = pick(PERSONAS);
  const core = shuffle(persona).slice(0, chance(0.5) ? 4 : 3);
  const size = chance(0.15) ? budget - 1 - Math.floor(Math.random() * 2) : budget; // a few under-spend
  const rest = shuffle(virtueIds.filter(id => !core.includes(id)));
  const selected = [...core, ...rest].slice(0, Math.max(0, size));

  // Some students write nothing; others write about a few virtues.
  const notes = {};
  const howMany = chance(0.2) ? 0 : 1 + Math.floor(Math.random() * 4);
  for (const id of shuffle(virtueIds).slice(0, howMany)) {
    const bank = NOTES[id];
    if (!bank) continue;
    const mode = selected.includes(id) ? 'excess' : 'missing';
    notes[id] = { failure: pick(bank[mode]), workaround: chance(0.7) ? pick(bank.workaround) : '' };
  }
  return { selected, notes };
}

async function main() {
  let code = opt('code', null);
  if (!code) {
    if (opt('new', false)) await req(`/api/i/new?key=${encodeURIComponent(KEY)}`, 'POST');
    code = (await req(`/api/i/current?key=${encodeURIComponent(KEY)}`)).code;
  }
  const info = await req(`/api/s/${code}/info`);
  if (info.closed) throw new Error(`Session ${code} is closed; reopen it or use --new.`);
  console.log(`Session ${code} at ${URL_BASE}: adding ${N} fake students`);

  const ids = info.virtues.map(v => v.id);
  const names = shuffle(NAMES);
  const run = Date.now().toString(36);
  for (let i = 0; i < N; i++) {
    const pid = `fake-${run}-${i}`;
    const name = names[i % names.length];
    await req(`/api/s/${code}/join`, 'POST', {
      pid,
      name: chance(0.85) ? name : '',
      nickname: chance(0.25) ? pick(NICKS) : '',
      group: chance(0.6) ? pick(['A', 'B', 'C', 'D', 'E']) : '',
    });
    const data = design(ids, info.budget);
    await req(`/api/s/${code}/submit`, 'POST', { pid, data });
    process.stdout.write(`  ${String(i + 1).padStart(2)}. ${name.padEnd(6)} ${data.selected.join(', ')}\n`);
    if (DELAY) await sleep(DELAY);
  }
  console.log('Done.');
}

main().catch(e => {
  console.error(e.message);
  process.exit(1);
});
