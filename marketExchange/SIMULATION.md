# Market Exchange — Simulation spec

**Status: draft for review (2026-10-31). Nothing built yet.**

Students trade things they hold for things they would like better. The room tracks **aggregate welfare** (the sum of everyone's score) round by round. The exercise has two kinds of phase:

- **Chairs**: a pure exchange economy. Every voluntary swap helps both traders and hurts no one, so welfare can only rise. It still stalls short of the best possible allocation.
- **Offices**: your score depends on *who your neighbors are*. A swap that helps both traders can hurt the people around them, so welfare can fall. This phase runs twice: once with random neighbor preferences (externalities) and once with "like me" preferences (Schelling-style sorting).

Each phase is a sequence of **rounds**. When the instructor opens a round, they choose whether that round has **Classifieds** (low search cost) and **Money** (side payments), so the class can see what each institution adds.

## Why the design looks like this (from the bot simulation)

A Python simulation (500 simulated classes of 18, trading only when both sides gain) found:

- **Chairs:** pairwise trading stalled below the best possible assignment in every class, at about 81% of the possible gain. A trade-cycle broker (Top Trading Cycles) added almost nothing (to about 84%). Most of the gap remains because reaching the best total requires *some people to accept a worse chair*, so the extension that closes the gap is **money**, not a broker.
- **Offices, random preferences:** about 23% of mutually beneficial swaps lowered the room's welfare, and welfare fell in at least one round in about half the classes.
- **Offices, "like me":** harmful swaps almost vanish, but the grid sorts into clusters (average neighbor type difference fell from 1.59 to 1.09).
- **Offices, "everyone wants quiet":** near gridlock. Not used.

## Scores (all on one 0–64 scale, higher is better)

### Chairs

Each student has a private **target** and holds a public **chair**. Both are 4-vectors with values 1–5.

```
score = 64 − Σ (target_d − chair_d)²      over the 4 dimensions
```

64 is a perfect match. 0 is the worst possible chair (4 dimensions × 4² = 64).

**Dimensions.** They must be *ordinal*, because the formula treats 2 as between 1 and 3. Proposed:

| id | Label | 1 → 5 |
|---|---|---|
| `shade` | Shade | pale → deep (rendered as the card's background color) |
| `style` | Style | classic → modern |
| `firmness` | Firmness | soft → firm |
| `weight` | Weight | light → heavy |

"Material" from the original sketch is not ordinal (is metal between wood and plastic?), so it is replaced by firmness. *Open for Dan to change.*

### Offices

Offices sit on a grid. Neighbors are the offices directly up, down, left, and right. Each student has a public **type** (1–5, e.g. quiet → loud) and a private **preferred neighbor type**.

```
score = 64 − 4 × mean over my neighbors of (preferred − neighbor_type)²
```

The mean, not the sum, so corner offices are not penalized for having fewer neighbors. The ×4 puts it on the same 0–64 scale as chairs.

- **Offices: random:** preferred neighbor type is drawn at random, independent of your own type.
- **Offices: like me:** preferred neighbor type = your own type.

### Money

In a Money round, everyone holds tokens (starting balance **20**, set when the phase starts). A student's displayed score is `item score + (tokens − 20)`. Transfers move tokens between students, so **aggregate welfare counts item scores only**: payments can make a trade possible, but they never change the room total by themselves.

## Session flow

```
Lobby (students join)
  └─ Start phase: Chairs | Offices: random | Offices: like me
       Round 0: baseline, trading closed. Everyone sees item and score.
       ├─ Open round  [☐ Classifieds] [☐ Money]   ← chosen on the projected slide
       │    trading…
       ├─ Close round → welfare recorded
       ├─ Open round  [☑ Classifieds] [☐ Money]
       │    …
       └─ Start next phase (fresh economy for whoever is joined now)
```

- **Starting a phase generates a fresh economy** for the students joined at that moment: random targets, random starting holdings (chairs), or random types, preferences, and offices. That is why attendance doesn't matter.
- **Late joiners** wait on a "you'll join at the next phase" screen.
- **Offices grid size** is chosen from headcount: the smallest of 4×4, 4×5, 5×5, 5×6 that fits. Empty offices hold **phantoms**: they have a public type, never trade, and are not counted in welfare. They make sure real students have neighbors.
- Rounds have no built-in timer. The instructor closes them.

## Student screens

### Chairs: the chair card

The main screen is meant to be **held up and read from about six feet away**:

```
┌─────────────────────────────┐   background = Shade (pale → deep)
│                             │
│        STYLE   ▮▮▮▯▯        │   big bars or icons, no small numbers
│     FIRMNESS   ▮▮▮▮▯        │
│       WEIGHT   ▮▯▯▯▯        │
│                             │
│           "Maya"            │   nickname, large
├─────────────────────────────┤
│ You want: ▮▮▯ ▮▮▮▮ ▮▮ …  41 │   private strip: your target + score
└─────────────────────────────┘
          [ Trade ]
```

The instructor tells students to move around as much or as little as they like.

### Finding a partner

The flow in an ordinary round:

1. Look around. Everyone holds up their chair card. You spot a card whose bars look close to your "You want" strip.
2. Optionally talk to them. The app doesn't require it.
3. Tap **Trade**, then tap their nickname (shown large on their card, so you know which name to tap).
4. Your phone shows **your own** result ("Maya's chair: 41 → 52") and an **Offer swap** button.
5. They get a banner with **their own** result and **Accept / Decline**.
6. On Accept, both cards update, and the trade appears on the projector's ticker.

Round types differ in how hard it is to **find** a trade (step 1), not how hard it is to evaluate one (step 4 is always available). Score previews are **uncapped**: a student can tap through every name to build their own classifieds list. That is tedious, and the tedium is the friction we want. If students routinely do it, a per-round preview cap is the lever. Decided 2026-10-31: start uncapped.


- **Ordinary round:** tap **Trade**, then tap the name of the person you're talking to (a list of joined nicknames). You see only **your own** result: "Your score: 41 → 52."
- **Classifieds round:** **Trade** opens a sorted list: "Chairs that would raise your score" with your gain and the holder's name. You can send an offer straight from the list. You still see only your own gain.
- **Offices swap screen** (decided 2026-11-01): after tapping an office you see a small map of the room *as it would be after the swap* (you in their office, them in yours, your new neighbors outlined), a comparison line ("You want 2 · Neighbors now 3 4 · After swap 1 4"), and a note that your old neighbors and theirs are affected too, so the externality is visible before you offer.
- **Offices phases:** the Trade screen is a **map** of the grid. Each office shows its occupant's type as a color, yours is outlined, and phantoms are grey. Tap any office to see your score change if you swapped with its occupant. In a Classifieds round, a sorted list appears beside the map.

### Offers

- **Send:** choose a partner, see your own change, then press **Offer swap**. In a Money round, add a payment in either direction ("I pay 6" / "they pay me 6").
- **Receive:** a banner shows "Maya offers to swap" with **your** score change, including any payment. Buttons: **Accept** / **Decline**.
- **One pending outgoing offer per student.** Sending a new one withdraws the old one. Any number of incoming offers can wait.
- **The server rechecks when an offer is accepted.** If either item has changed hands, or a payer no longer has the tokens, the offer is rejected as stale and both students are told.
- Offers that lower your own score are allowed but flagged in red ("This makes you worse off"). The math is done for each student, but nobody sees the other side's gain.
- Offers are withdrawn when the round closes.

## Projected view (the instructor slide)

One page, used both on the slide and for control:

- **Welfare chart:** room welfare after each round, with each round labeled by its toggles (e.g. "R2 · Classifieds"). A dashed line marks the **benchmark**: the best possible assignment for chairs (computed exactly with the Hungarian algorithm) or the best arrangement found for offices (simulated annealing; the true optimum is computationally hard). The caption reads "X% of possible gain."
- **Trade ticker:** each completed swap with its effect: "Swap · traders +11 · neighbors −4". In Offices phases, swaps that **lowered room welfare** are shown in red and flash on the map.
- **Offices map:** the live grid, colored by type, so sorting is visible as it happens.
- **Controls:** Start phase (choose type) · Open round (Classifieds / Money checkboxes) · Close round · Save. All destructive actions use two-click confirm.
- **Counts:** joined, in this phase, trades this round.
- **Show names** toggle (off by default), as in roommateDesign.

## Slide demo (decided 2026-11-01)

To explain the game before playing, a slide shows two `/demo` panes side by side: **same phase and economy, different institutions** (plain vs Classifieds, Money, or both). Holding the phase fixed makes the comparison about institutions, which is the course's question about markets as an alignment mechanism. The chairs-versus-offices contrast (when markets fail) is a separate slide if wanted.

- 8 people, 4 wide × 2 tall for both chairs and offices.
- Each meeting is narrated in three beats: who meets and each side's own gain; the outcome (swap, payment, or no deal; in offices, the neighbors' change and the room's); then a short pause.
- Plain market: random pairs meet. Classifieds: someone goes down their list, best first, until a partner also gains. Money: the winner pays the loser enough to accept, splitting the surplus in whole tokens. Everyone starts with 20 tokens, shown as a coin counter on each person (added 2026-11-01); a deal fails if the winner can't afford it. Tokens never count toward welfare.
- Chairs tiles show each person's **target as pink rings** on the chair's attribute rows (wants are private in the real game, but the demo shows them so the gains make sense). A one-line key under the board explains the encoding for each phase (decided 2026-11-01).
- Captions on by default (`captions=0` to narrate yourself). Starts on click; panes stay in step; stops on a summary.

## Saved snapshot (`sim.snapshot()`, no names)

Participants are saved as shuffled anonymous indices.

```js
{
  phases: [
    {
      type: "chairs" | "offices-random" | "offices-like-me",
      n: 18,
      grid: { rows: 4, cols: 5 } | null,
      economy: {                        // the starting state
        targets: [[...], ...] | null,   // chairs
        holdings: [...],                // chair index per student, or office index per student
        chairs: [[...], ...] | null,
        types: [...] | null, wants: [...] | null,
        phantoms: [{ office, type }] | null
      },
      benchmark: 1066,
      rounds: [
        { classifieds: false, money: false,
          welfareStart: 865, welfareEnd: 934,
          trades: [ { a: 3, b: 11, pay: 0, dA: 6, dB: 9, dRoom: 15 }, ... ] }
      ]
    }
  ]
}
```

`dRoom` is the change in total welfare. It differs from `dA + dB` only in Offices phases, where the difference is the effect on neighbors.

## Open questions

1. Dimension names and the card's visual encoding (above).
2. Starting token balance (20?) and whether payments are capped.
3. Should students see the welfare chart on their phones after a round closes, or only on the projector?
