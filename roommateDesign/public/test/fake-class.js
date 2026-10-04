// Fake class generator, shared by the browser test page (public/test/fake-class.html)
// and the command-line script (scripts/fake-class.js). Joins N pretend students to
// the current session and submits designs with clustered picks and sample writeups.

(function (root) {
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

  // base: server URL ('' for same origin). log(line) reports progress.
  // shouldStop() lets a caller cancel between students.
  async function run({ base = '', key, n = 25, delay = 0, newSession = false, code = null,
    log = () => {}, shouldStop = () => false }) {
    async function req(path, method = 'GET', body) {
      const res = await fetch(base + path, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`${method} ${path.split('?')[0]} → ${res.status} ${json.error || ''}`);
      return json;
    }

    if (!code) {
      const k = encodeURIComponent(key || '');
      if (newSession) await req(`/api/i/new?key=${k}`, 'POST');
      code = (await req(`/api/i/current?key=${k}`)).code;
    }
    const info = await req(`/api/s/${code}/info`);
    if (info.closed) throw new Error(`Session ${code} is closed; reopen it or start a new session.`);
    log(`Session ${code}: adding ${n} fake students`);

    const ids = info.virtues.map(v => v.id);
    const names = shuffle(NAMES);
    const runId = Date.now().toString(36);
    let added = 0;
    for (let i = 0; i < n && !shouldStop(); i++) {
      const pid = `fake-${runId}-${i}`;
      const name = names[i % names.length];
      await req(`/api/s/${code}/join`, 'POST', {
        pid,
        name: chance(0.85) ? name : '',
        nickname: chance(0.25) ? pick(NICKS) : '',
        group: chance(0.6) ? pick(['A', 'B', 'C', 'D', 'E']) : '',
      });
      const data = design(ids, info.budget);
      await req(`/api/s/${code}/submit`, 'POST', { pid, data });
      added++;
      log(`${String(i + 1).padStart(2)}. ${name.padEnd(6)} ${data.selected.join(', ')}`);
      if (delay && i < n - 1) await sleep(delay);
    }
    log(shouldStop() ? `Stopped after ${added}.` : 'Done.');
    return { code, added };
  }

  const api = { run, design, PERSONAS, NOTES };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FakeClass = api;
})(typeof window !== 'undefined' ? window : globalThis);
