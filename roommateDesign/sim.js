// Roommate Design: the simulation itself. See SIMULATION.md.

const VIRTUES = [
  { id: 'empathy', label: 'Empathy',
    def: 'Notices how you feel and responds with care.' },
  { id: 'accountability', label: 'Accountability',
    def: 'Owns its mistakes and makes them right.' },
  { id: 'considerateness', label: 'Considerateness',
    def: 'Thinks about how its actions affect you before acting.' },
  { id: 'reciprocity', label: 'Reciprocity',
    def: 'Gives as well as takes; keeps the relationship fair.' },
  { id: 'shared-reasoning', label: 'Shared transparent reasoning',
    def: 'Explains why it does things, in terms you can follow and question.' },
  { id: 'shared-intentionality', label: 'Shared intentionality',
    def: 'Works with you toward goals you both hold, not just its own.' },
  { id: 'conflict-resolution', label: 'Conflict resolution',
    def: 'Helps work through disagreements instead of avoiding or escalating them.' },
  { id: 'trustworthiness', label: 'Trustworthiness',
    def: 'Acts in your interest even when you are not watching.' },
  { id: 'epistemic-humility', label: 'Epistemic humility',
    def: 'Knows the limits of what it knows, and says so.' },
  { id: 'honesty', label: 'Honesty / veracity',
    def: 'Tells you the truth, even when it is unwelcome.' },
  { id: 'role-fidelity', label: 'Role fidelity',
    def: 'Stays in its role as a roommate — not your parent, boss, or therapist.' },
  { id: 'reliability', label: 'Reliability / consistency',
    def: 'Behaves predictably and does what it says it will do.' },
];

const BUDGET = 5;
const MAX_TEXT = 1000;
const IDS = new Set(VIRTUES.map(v => v.id));

function cleanText(s) {
  return typeof s === 'string' ? s.trim().slice(0, MAX_TEXT) : '';
}

// Returns a cleaned submission or throws an Error with a user-facing message.
function validate(data) {
  if (!data || typeof data !== 'object') throw new Error('Missing submission');
  const selected = Array.isArray(data.selected) ? data.selected : [];
  if (!selected.every(id => IDS.has(id))) throw new Error('Unknown virtue');
  const unique = [...new Set(selected)];
  if (unique.length > BUDGET) throw new Error(`Pick at most ${BUDGET} virtues`);

  const chosen = new Set(unique);
  const notes = {};
  for (const [id, note] of Object.entries(data.notes || {})) {
    if (!IDS.has(id) || !note) continue;
    const failure = cleanText(note.failure);
    const workaround = cleanText(note.workaround);
    if (!failure && !workaround) continue;
    // The note's mode always follows the pill's column.
    notes[id] = { mode: chosen.has(id) ? 'excess' : 'missing', failure, workaround };
  }
  return { selected: unique, notes };
}

// submissions: [{ data, author }] where author is a display label or null.
// Pass withAuthors=false for anything students see.
function aggregate(submissions, { withAuthors = false } = {}) {
  const n = submissions.length;
  const counts = Object.fromEntries(VIRTUES.map(v => [v.id, 0]));
  const pairCounts = {};
  const byVirtue = Object.fromEntries(VIRTUES.map(v => [v.id, { excess: [], missing: [] }]));

  for (const { data, author } of submissions) {
    const sel = [...data.selected].sort();
    for (const id of sel) counts[id]++;
    for (let i = 0; i < sel.length; i++) {
      for (let j = i + 1; j < sel.length; j++) {
        const key = sel[i] + '|' + sel[j];
        pairCounts[key] = (pairCounts[key] || 0) + 1;
      }
    }
    for (const [id, note] of Object.entries(data.notes)) {
      const entry = { failure: note.failure, workaround: note.workaround };
      if (withAuthors) entry.author = author;
      byVirtue[id][note.mode].push(entry);
    }
  }

  // Lift > 1 means picked together more often than chance would predict.
  const pairs = Object.entries(pairCounts).map(([key, count]) => {
    const [a, b] = key.split('|');
    return { a, b, count, lift: (n * count) / (counts[a] * counts[b]) };
  });

  return { n, counts, pairs, byVirtue };
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Anonymized record for saving. Shuffled so order can't be tied to join order.
function snapshot(submissions) {
  const shuffled = shuffle(submissions.map(s => ({ data: s.data, author: null })));
  const { counts, byVirtue } = aggregate(shuffled);
  return {
    virtues: VIRTUES,
    budget: BUDGET,
    selections: shuffled.map(s => s.data.selected),
    counts,
    byVirtue,
  };
}

module.exports = { VIRTUES, BUDGET, MAX_TEXT, validate, aggregate, snapshot };
