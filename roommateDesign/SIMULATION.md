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

Students can open it after submitting, or once submissions are closed. The instructor's slide shows it live.

1. **Frequency.** A bar chart of how many students picked each virtue, sorted by count. Each bar shows `n` and a percentage. On a student's view, their own picks are highlighted.
2. **Co-selection graph** (a force-directed graph; a small hand-written layout in `results.js`, no library):
   - Each virtue is a node, sized by how often it was picked.
   - An edge joins two virtues that were picked together **more often than chance**: lift > 1, with at least 2 students. Edge thickness is the lift. Clusters form on their own.
   - Using lift rather than raw counts stops the most popular virtues from connecting to everything.
   - The graph appears once there are at least 5 submissions. Before that, a placeholder says it is waiting for more data.
   - **The graph is live and springy.** It animates as it settles, and anyone can drag a node: strongly linked partners follow, and the node springs back on release. A press that moves less than 6px counts as a tap and opens the writeups.
   - **Shake** scatters the nodes and lets them resettle; clusters that reappear are real. New submissions nudge the layout from its current positions instead of restarting it.
   - On phones, touching the graph drags nodes rather than scrolling the page.
3. **Writeups.** Tapping any virtue, as a bar or a node, opens a panel with two lists:
   - **Failures when included (excess)**, each with its workarounds.
   - **Failures when excluded (missing)**, each with its workarounds.
   - Instructor view: a **Show names** toggle, off by default, attributes each entry to its author's nickname or name. Students always see anonymous entries.

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
