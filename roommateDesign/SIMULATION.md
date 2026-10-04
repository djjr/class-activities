# Roommate Design — Simulation spec

Students design a robot roommate by choosing virtues within a budget. They then reflect on how the robot could fail: from too much of a chosen virtue, or from the lack of one they left out. They can also suggest workarounds.

## Virtues (budget: 5)

| id | Label |
|---|---|
| `empathy` | Empathy |
| `accountability` | Accountability |
| `considerateness` | Considerateness |
| `reciprocity` | Reciprocity |
| `shared-reasoning` | Shared transparent reasoning |
| `shared-intentionality` | Shared intentionality |
| `conflict-resolution` | Conflict resolution |
| `trustworthiness` | Trustworthiness |
| `epistemic-humility` | Epistemic humility |
| `honesty` | Honesty / veracity |
| `role-fidelity` | Role fidelity |
| `reliability` | Reliability / consistency |

`VIRTUES` and `BUDGET = 5` are constants in `sim.js`. The selection is an unordered set of **0 to 5** virtues.

## Student screen

```
 Robot roommate                    Budget: 3 / 5
 ┌ Selected ─────────────────────────────────────┐
 │ (Empathy ✎) (Honesty / veracity ✎•) (Role…✎)  │
 └───────────────────────────────────────────────┘
 ┌ Not selected ─────────────────────────────────┐
 │ (Accountability ✎) (Reciprocity ✎) ...        │
 └───────────────────────────────────────────────┘
                     [ Submit ]
```

- **Tapping a pill** moves it to the other column. Moving to Selected when the budget is full is refused: the pill shakes and the counter flashes.
- **On a laptop, dragging** a pill between columns also works.
- **On narrow screens**, the columns stack, with Selected on top. On wide screens they sit side by side, Selected on the left.
- **The ✎ button on each pill opens the failure-mode dialog.** A dot (•) means the pill already has text.
- **The dialog** depends on the pill's current column:
  - Selected → "How could this fail if expressed **in excess**?"
  - Not selected → "How could this fail because it is **missing**?"
  - Each dialog has two free-text boxes, **Failure mode** and **Workarounds**. Students can write as much as they like, including several items.
- **Everything is optional.** A student can submit an empty or partial design.
- **If a student moves a pill after writing about it,** the text for the other column is kept but not submitted. It reappears if they move the pill back.
- **The draft autosaves** to `localStorage`, so a refresh loses nothing. **Submit** sends the current state and can be pressed again until submissions close.

## Submission (what the server receives)

```js
{
  selected: ["empathy", "honesty", "role-fidelity"],
  notes: {
    "empathy":        { mode: "excess",  failure: "...", workaround: "..." },
    "accountability": { mode: "missing", failure: "...", workaround: "" }
  }
}
```

`validate()` checks the following:
- Every ID is known.
- There are no more than `BUDGET` virtues, with no duplicates.
- Each note's mode matches the pill's column (`excess` if selected, `missing` if not).
- Each text field is at most 1000 characters.
- Notes with both fields empty are dropped.

## Results view

Students can open it after submitting, or once submissions are closed. The instructor's slide shows it live. The writeups are the substance of the exercise, so the layout centers on them:

```
┌ Virtues chosen ───────────────┐ ┌ ‹      Empathy          › ┐
│   (graph: size = # picked,    │ │ Picked 13 of 25 · Ranked 1 │
│    lines = picked together)   │ │ …with excessive empathy    │
│   tap a virtue → panel        │ │   failure… ↳ workaround…   │
│                               │ │ …with absence of empathy   │
└───────────────────────────────┘ └────────────────────────────┘
```

Wide screens show two columns: the graph on the left and the writeup panel on the right. The panel scrolls inside its own column. Phones stack them, and tapping a virtue scrolls down to its panel.

1. **Graph (left), the navigator.**
   - Each virtue is a node labelled with its count, e.g. "Empathy · 13". Circle area is relative to the most-picked virtue. A dashed circle means nobody picked it.
   - An edge joins two virtues picked together **more often than chance**: lift > 1, with at least 2 students. Its thickness and pull grow with lift, so weak links barely matter and strong ones form clusters.
   - The graph is live and springy: drag a node and its linked partners follow, then it springs back on release. A press that moves less than 6px is a tap. Each node has an invisible tap target at least 16 units in radius, and its label is tappable too.
   - **Shake** scatters the nodes and lets them resettle; clusters that reappear are real. New submissions nudge the layout instead of restarting it. On phones, touching the graph drags nodes rather than scrolling.
   - The graph appears once there are at least 5 submissions. The panel works before that.
2. **Writeup panel (right), the main content.**
   - It opens on the virtue with the most writeups. **‹ ›** step through virtues in order of popularity, for walking the class through them one by one.
   - The header shows "Picked by k of n · Ranked r of 12" and, for students, "★ in your design".
   - Two sections: **Failure modes with excessive ⟨virtue⟩** and **Failure modes with absence of ⟨virtue⟩**. The virtue name is lowercased mid-sentence. Each failure mode has its workaround indented beneath it.
   - Instructor view: a **Show names** toggle, off by default, attributes each entry to its author's nickname or name. Students always see anonymous entries.

There is no separate frequency chart: counts are in the graph labels and the panel header.

The instructor slide also keeps the **Close Submissions** and **Save** controls and the "N joined / M submitted" count.

## Saved snapshot (`sim.snapshot()`, no names)

```js
{
  virtues: [ /* the VIRTUES list at save time */ ],
  budget: 5,
  selections: [ ["empathy","honesty","role-fidelity"], [...], ... ],   // one anonymous set per submission
  counts: { "empathy": 14, ... },
  byVirtue: {
    "empathy": {
      excess:  [ { failure: "...", workaround: "..." }, ... ],
      missing: [ { failure: "...", workaround: "..." }, ... ]
    },
    ...
  }
}
```

The co-selection graph is not saved; it can be recomputed from `selections`. Submissions are shuffled before saving, so the order of `selections` cannot be matched to the order people joined.
