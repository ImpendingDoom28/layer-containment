# Level 2 Boss Design — "The Ferryman"

> **Status:** **Variant B (The Ferryman) is implemented in this PR** — a
> generic, boss-agnostic `PathSwap` trait + `PathSwapSystem` carries the
> front-crossing mechanic, wired into Sector 2's boss via `BossConfig.pathSwap`.
> The other variants (C, D, E) and the Sector 3 sketch below remain proposals.
> **Scope:** the boss for **Sector 2: The Convergence** (level 2), with a set of
> distinct gameplay implementation variants, plus the level's difficulty curve
> around it. A short section at the end sketches (does **not** implement) boss
> ideas for **Sector 3: The Coil** (level 3). The boss below is the **Ferryman**
> (Variant B); "The Convergence Warden" was the pre-decision placeholder name.

---

## 1. Context: what exists today

### 1.1 The boss system (what we build on)

The game already has a general boss framework; a level boss is a themed enemy
that spawns alongside a boss wave and inherits everything a normal enemy of that
wave gets. The pieces, and where they live:

| Piece | File | What it does |
|---|---|---|
| `IsBoss` trait | `src/core/ecs/traits/enemy.ts` | Tags the boss entity. The HUD boss bar watches for the first live entity carrying it (at most one exists at a time). |
| Boss spawn | `src/core/session/waveSystem.ts` (`initializeWave`) | On a boss wave, unshifts a `tank`-type spawn at `t=0` carrying `boss` base stats + the `IsBoss` tag. The regular wave is otherwise unchanged. |
| HP scaling | `src/utils/bossHp.ts` (`bossHealthForWave`) | First appearance = raw base HP; each later appearance = base HP × `hpGrowthPerAppearance`^(appearance−1). |
| Upgrade inheritance | `src/core/ecs/spawnLevelEnemy.ts` | The boss is spawned with the player's **full current upgrade stack** (Armored, Swift, Regenerating, Reinforcements, Missing Out, …) exactly like any other enemy — base stats are overridden, then the stack is applied additively. |
| Boss bar | `src/components/hud/HUDBossBar.tsx` (via `useBossInfo`) | Big name + health bar; shows while the boss is alive, hides on death. |
| Boss banner | `src/components/hud/HUDBossWaveBanner.tsx` | One-shot "BOSS WAVE" flash when a boss wave starts. |
| Preview | `src/components/gui/GUINextWavePreview.tsx` (`bossHealthWithUpgrades`) | Red skull row above the per-portal list, showing the boss's upgrade-scaled HP for the upcoming boss wave. |
| Config | `public/configs/levels/level_2.json` → `boss` | `name`, `everyNthWave`, `baseStats { health, speed, size, healthLoss, reward }`, `hpGrowthPerAppearance`. |

The level-2 config **already** carries a placeholder boss ("The Convergence
Warden", 1200 HP, speed 0.7, size 1.5, 5 health on leak, 300 reward, ×1.5 HP
growth, every 4th wave). Today it is a very large, very slow, very tanky
*wall* with no behavior — it just walks the path and soaks damage. The work in
this doc is to give it a **gameplay role**.

### 1.2 Level 2's geometry: the "convergence"

The map's whole identity is its name. Two portals (left, right) each feed a
snaking path that **merges into a single shared corridor** near the bottom, and
both paths end at the same base tile. Concretely (20×20 grid, world coords):

```
        PORTAL A (left)                        PORTAL B (right)
          (x=-6.5, z=-9.5)                       (x=6.5, z=-9.5)
                |  S-shaped zig-zag                    |  S-shaped zig-zag
                |  around two water ponds              |  around two water ponds
                v                                       v
      z=-5.5 -> z=-1.5 -> z=2.5  <--- shared lane ---->  z=-5.5 -> z=-1.5 -> z=2.5
                \___________________________________/
                              merges at (x=-0.5, z=2.5)
                                     |
                             SHARED CORRIDOR
                             (x=-0.5, z=2.5 -> 6.5 -> 9.5)
                                     |
                             BUILDING 6 at (0.5,0.5) flanks it
                                     |
                              BASE (x=-0.5, z=9.5)
```

Key facts that drive the design:

- **Two mostly independent approaches until z ≈ 2.5.** Until the merge, a tower
  on the left half can reach the right approach only from tiles near the centre
  line — a basic tower (range 3.5) at (−0.5, −4.5) is 3.0 units from the right
  approach at x = 2.5, so a centre-line tower can cover both approaches. Towers
  placed further left or right cover one front only. The player is pushed to
  **split their defense across two fronts** (the level's tagline:
  "Split your defense across both fronts.").
- **One shared bottleneck after the merge.** From z ≈ 2.5 to the base, both
  waves flow down a single ~7-tile corridor flanked by one building. This is
  the map's "chokepoint": a single well-placed tower here covers both fronts,
  but it also concentrates risk (one leak down the corridor is the same as one
  leak from either portal).
- **A long, winding path.** Each portal-to-base path is ~33–34 world units, so
  a 0.7-speed enemy takes ~47s to traverse — there is a lot of room to kite.
- **Water and buildings block placement** in the outer pockets, so the two
  fronts have distinct, non-overlapping buildable arcs.

The design goal: a boss that **uses the two-fronts-then-one-chokepoint
structure** to create a challenge a single-front boss (levels 1, 4, 5) cannot.

### 1.3 The difficulty curve in level 2

Level 2 has **8 waves** with a boss on wave 4 and wave 8 (the default
`everyNthWave: 4`). These are the level's two "beats":

- **Wave 4 — the introduction.** The boss appears the first time, at base HP
  (1200), against a medium wave (27 enemies, first tanks + a medic). The player
  has just learned the map. The boss here should **teach its mechanic** at a
  survivable pace.
- **Wave 8 — the exam.** Same mechanic, but HP is ×1.5 (≈1800), the regular
  wave is heavy (57 enemies, 8 tanks, splitters, medics), and the player's
  economy/upgrade stack is at its peak. The boss here should be the same idea
  with a **second layer** (a phase, a second body, more minions) that punishes
  players who only built for wave 4.

Everything below is written around this two-beat curve.

---

## 2. Level 2 boss variants

Each variant is a distinct *mechanic* (not just a stat change). For each: the
core mechanic, the challenge it poses, how it plays on wave 4 vs wave 8 (the
curve), what it tests in the player's build, and a sketch of the implementation
surface (new traits/systems). All of them keep the existing `IsBoss` tag, boss
bar, banner, preview, and HP-growth plumbing — only the *behavior* changes.

> Naming: the placeholder boss was called **"The Convergence Warden"**, which
> fits the map. The shipped boss took **Variant B's** epithet — **"The
> Ferryman"** — so the two beats (wave 4 / wave 8) read as one boss escalating
> rather than two different creatures.

---

### Variant A — "The Wall" (armored gate, pure tank)

**Mechanic.** The Warden is a single, extremely tanky, very slow body with a
layer of armor that *peels off* in stages. It has no active ability; its
challenge is scale + a damage-sponge with a threshold.

- **Concretely:** three armor layers. While layer N is up, the boss takes
  reduced damage (e.g. ×0.5) and is visually plated. When the layer's HP pool
  empties, the layer "breaks" (a burst VFX, a short stagger that stops it for
  ~2s and grants a damage window). Each break also **spawns 2 escort tanks** on
  a random portal.
- **Challenge:** a damage-race against a moving, self-escorting wall. The
  escorts force the player to split DPS between the wall and its bodyguards,
  and they spawn *on a portal* — so the escorts run the full path and can leak
  while the player is locked onto the Warden.
- **Curve:**
  - *Wave 4:* one armor layer, 2 escorts on break. Teach "break the plate,
    punish the stagger."
  - *Wave 8:* two armor layers, 4 escorts on break, and the Warden is immune to
    slow while a layer is intact (slow only works in the stagger window) — this
    punishes a pure-slow build.
- **Tests:** sustained AoE/DPS (BRL, laser, basic) vs. the escort pressure that
  rewards a second front. A slow-only build is deliberately disadvantaged on
  wave 8.
- **Impl sketch:** a `BossArmor` trait (layers, per-layer hp, stagger state);
  a small `BossArmorSystem` that applies the damage multiplier, detects layer
  breaks, emits the stagger, and triggers the escort spawns (reuse the existing
  split/escort spawn path). No path or movement changes. Lowest implementation
  cost; the "real" content is the tuning.

*Verdict:* safe and clearly readable, but the least "convergence-specific" —
a plain tank works on any map. It's the floor, not the ceiling.

---

### Variant B — "The Ferryman" (approach-crossing roamer)

**Mechanic.** The Warden **crosses from one portal's approach to the other
mid-run**: while it is still on the distinct (pre-merge) approach segment, at a
trigger point it *teleports to the mirrored point on the other portal's
approach* and runs the remainder from there. On a two-portal map this makes the
boss a **roaming threat that flips front** as it goes.

- **Concretely:** spawn on portal A. While its `pathProgress` is still on the
  pre-merge approach (before the merge at (−0.5, 2.5)), at a trigger point it
  re-assigns to **portal B at the same progress**. The two approaches are exact
  mirrors (same z rows, x mirrored: A's x ∈ {−6.5, −2.5} ↔ B's x ∈ {6.5, 2.5}),
  so the same `pathProgress` lands on a valid, mirrored lane position — the
  swap is geometrically clean and never pops the boss into water or buildings.
  Visually it "crosses over" the centre line (a short teleport/flash). After the
  swap it walks the remainder of portal B (a few approach rows, then the shared
  corridor). It can do this up to N times per appearance.
  (A swap *after* the merge is a no-op: both paths share all waypoints from the
  merge point on, so re-assigning there changes nothing. The swap must be on the
  distinct approach segments.)
- **Challenge:** the player can never fully commit towers to one front, because
  the boss will be walking the *other* front's approach while the regular wave
  is on the first. The boss effectively **forces both pre-merge approaches to
  be covered**: a player who stacks one outer pocket and leaves the other bare
  gets the boss walked straight down the uncovered approach to the corridor.
- **Curve:**
  - *Wave 4:* one swap (A→B), at a fixed point (when the boss first reaches the
    z = −1.5 row). Teach "both approaches matter, not just your main front."
  - *Wave 8:* two swaps (A→B→A), at *progress-triggered* points so the timing
    is unpredictable, plus the boss gains a short speed burst right after each
    swap.
- **Tests:** placement across **both pre-merge approaches** (the design intent
  of the map). A player who over-invests in one outer pocket and neglects the
  other gets punished hard.
- **Impl sketch (as implemented):** a generic, boss-agnostic `PathSwap` trait
  (a list of rules — trigger progress, target pathIndex — plus a `nextSwap`
  cursor, a `telegraphReadyAt` countdown, and a `lastCrossAt` timestamp) and a
  `PathSwapSystem` that, when an enemy's `pathProgress` crosses a rule's
  `atProgress`, **telegraphs** the cross: it stands the enemy still for ~1s
  while a **wind-up plays around the enemy's own body**, then re-assigns it to
  the rule's `targetPathIndex` while keeping the same `pathProgress` (the
  approaches are mirrors, so the same fraction lands on the other front's
  corresponding row) and records `lastCrossAt`, from which the view plays a
  short **arrival burst** at the new position — so the player sees the jump
  coming and knows when it will happen, instead of the boss silently vanishing
  from one front. The visuals are **enemy-anchored, not ground-anchored**: a
  ground-level ring burst would be hidden under the boss's size-1.5 model, so
  instead a `PathSwapEffect` view (a child of the enemy `<group>`, exactly like
  the upgrade and slow visuals) renders a boss-colored pulsing double ring plus
  rising particles while the telegraph is in flight (the wind-up), and an
  expanding dual ring (the same shape as the medic heal burst) right after the
  cross (the arrival). Both are scaled by the enemy size and driven in
  `useFrame` on the pause-aware simulation clock (the wind-up freezes with the
  game), with no per-frame React state. The trait is one-shot per rule and
  lingers for the ~0.45s arrival burst after the final cross (it is dropped
  once the last rule is consumed and the burst has played, or when the enemy
  reaches the end of its path). Because it is generic, any future enemy — not
  just a boss — can carry the same trait; the boss-specific scaling (one rule
  on appearance 1, a second from appearance 2, both gated to the pre-merge
  segment) lives in `BossConfig.pathSwap` and is filtered in the wave system
  before the trait is attached. The speed burst called for in the curve was
  **not** implemented.
  This is the first variant that touches `EnemyMotion`/path assignment directly;
  keeping the swap on the mirrored pre-merge segment means the boss always
  lands on a valid lane. Medium cost, highest thematic payoff for *this* map.

*Verdict:* the most level-2-specific variant. It turns the two-front geometry
into an active challenge. Risk: the trigger must be gated to the pre-merge
segment (progress below the merge), or the swap degenerates to a no-op on the
shared corridor.

---

### Variant C — "The Conduit" (moving spawner / summoner)

**Mechanic.** The Warden is a **slow-moving spawner**: as it walks, it
periodically **releases enemies from its own body** onto a portal, in addition
to the regular wave. The boss is a "leaky bucket" that the regular wave and
its own spawns must be cleared *simultaneously*.

- **Concretely:** every T seconds the boss releases a small group (e.g. 3
  basic + 1 fast) on a **random** portal. The group runs the full path. The
  boss's reward scales with how many of its own spawns it leaks (risk/reward),
  and it has a modest **regen** (it is a "living conduit" feeding on the field).
- **Challenge:** sustained *throughput* rather than burst DPS. The player's
  towers are simultaneously fighting the Warden, the regular wave, and the
  boss's ongoing spawn stream. If DPS is spread too thin, the spawns queue up
  and become a flood down the corridor.
- **Curve:**
  - *Wave 4:* one group every ~8s, small groups. Teach "the boss keeps calling
    in units — keep one front clear."
  - *Wave 8:* one group every ~5s, larger groups that *upgrade* (a tank or
    splitter joins), and the boss's regen is high enough that without slow it
  effectively heals between its own spawn ticks.
- **Tests:** overall map throughput and the ability to clear **both** fronts'
  tails. Rewards relay-buffed clusters on the corridor and a second DPS front.
  Punishes a single-chokepoint build (the spawns arrive from a random portal,
  so a lone corridor tower gets swamped).
- **Impl sketch:** a `BossSummoner` trait (timer, group config, portal
  selection); a `BossSummonerSystem` that on tick releases groups via the
  existing spawn path (reuses `spawnLevelEnemy`, so upgrades apply) and manages
  the boss's regen. Low-to-medium cost; reuses the spawn system heavily.

*Verdict:* great "pressure" variant that makes the boss feel like a *force*,
not a single HP bar. Thematically it's "the convergence feeding the front."
Tuning risk: can feel like a second level on top of the level if the spawn
stream is too strong — keep groups small and the interval generous.

---

### Variant D — "The Phase-Shifter" (vulnerability windows)

**Mechanic.** The Warden **cycles between phases**: a *vulnerable* phase (full
damage taken, slow-able) and an *invulnerable* phase (takes no damage, moves
faster, is un-slowable). The phase is tied to a visible timer/aura. The player
must **concentrate damage in the vulnerable windows**.

- **Concretely:** e.g. 6s vulnerable → 4s invulnerable, looping. During
  invulnerable the boss glows, moves faster, and shrugs slow; during vulnerable
  it is plated-off and slow-able. A phase timer is shown on the boss bar.
- **Challenge:** *timing and burst*. You can't just chip at it; you must line
  up your strongest tower cluster to hit during the vulnerable window. A slow
  tower is a double-edged sword: it's useless during the invulnerable phase but
  locks the boss in place during the vulnerable one.
- **Curve:**
  - *Wave 4:* long vulnerable / short invulnerable (6/4), so it's forgiving.
    Teach "wait for the window, burst."
  - *Wave 8:* short vulnerable / long invulnerable (4/6) and the boss takes a
    **damage burst on the phase transition** (a shockwave that briefly slows
    all nearby enemies — rewarding a crowd around it), plus its speed rises
    each cycle.
- **Tests:** burst/AoE concentrated on the chokepoint and the *timing* of
  tower placement. Rewards building a heavy AoE/relay cluster on the corridor
  and using slow to hold the boss in a kill window. Punishes spread-out,
  even-DPS builds.
- **Impl sketch:** a `BossPhase` trait (phase, timer, per-phase damage/slow
  multipliers); a `BossPhaseSystem` that toggles phase, applies the multipliers
  to incoming damage (a damage hook), and emits the transition effect. Needs a
  small damage-interception point (damage is currently applied by the
  projectile/death systems) — the least "off-the-shelf" of the set, but a clean,
  self-contained system. Medium cost.

*Verdict:* the most "active" for the *player* (timing windows), and very
satisfying. It's also the most tuning-sensitive (invulnerable time vs. boss HP
can swing difficulty a lot) — start generous and tighten.

---

### Variant E — "The Twin" (two simultaneous bosses)

**Mechanic.** On a boss wave, **two Wardens spawn — one on each portal at the
same time.** They are independent (each carries `IsBoss`, so the boss bar shows
whichever is currently the "primary" — the one with more HP, or the first
spawned — and both have their own HP bars via a small bar extension). The
regular wave is unchanged.

- **Concretely:** each twin has a fraction of the single-boss HP (e.g. 55%
  each) and a distinct "affinity": the left twin is armored (resists slow,
  high HP), the right twin is swift (fast, low HP). Both walk the full path.
- **Challenge:** the **literal two-front problem** the map advertises, at boss
  scale. The player must allocate enough DPS to *both* corridors/ends at once,
  because either twin leaking costs 5 health. There is no "focus one then the
  other" — they arrive and run in parallel.
- **Curve:**
  - *Wave 4:* two twins, but the second (the "swift" one) is delayed ~10s, so
    there's a beat to focus the first before the second becomes a threat. Teach
    "two fronts, but you get a moment."
  - *Wave 8:* two twins, simultaneous, and the swift twin spawns **one escort
    fast unit** when it leaks partway (a "the twin got through" panic beat).
- **Tests:** true two-front allocation — the single most on-theme challenge the
  map can offer. Rewards a balanced build with DPS on both ends plus a
  corridor net. Punishes a lopsided build (all DPS on one front) catastrophically.
- **Impl sketch:** spawn two boss entities on a boss wave (both `IsBoss`);
  extend the boss bar to show **two** bars (or a combined "twin" bar with two
  segments). The bar extension is the main new UI; the spawn is trivial (call
  the boss-spawn path twice with per-twin stats). Medium cost, mostly UI.

*Verdict:* the most **thematic** and the highest-difficulty-cap option. It is
also the most demanding on the boss-bar UI (two entities both tagged `IsBoss`
break the current "at most one exists" assumption in `useBossInfo` — needs a
small change to show both). Best as the *wave 8* payoff of the level if we
want the finale to "pay off the convergence."

*Note:* if we use the Twin as the level's defining boss, wave 4 is the
"one front" tutorial beat (single Warden) and wave 8 is the "two fronts" exam
(two Wardens) — a clean curve directly derived from the map's core idea.

---

### Variant F — "The Warden's Bulwark" (companion / shield tank)

**Mechanic.** The Warden is accompanied by a **second, tanky "bulwark" entity**
that walks just in front of it. While the bulwark is alive, the Warden is
**unhurt by anything behind it** (the bulwark physically blocks the shared
corridor) and the bulwark itself has high HP + slow-resistance. The player must
**kill the bulwark first**, then the Warden is exposed.

- **Concretely:** bulwark spawns on a random portal ~5s before the Warden,
  ahead of it on the same path. The Warden's effective "front" is the bulwark.
  Killing the bulwark drops a money burst and leaves the Warden vulnerable.
  On wave 8 the bulwark *regenerates* a small HP pool if the Warden reaches the
  base (a "last stand" beat).
- **Challenge:** a **targeting/ordering** puzzle — the player must decide how
  much DPS to throw at the bulwark vs. the Warden vs. the regular wave, and
  the bulwark's slow-resistance means slow towers can't hold it.
- **Curve:**
  - *Wave 4:* one bulwark, moderate HP, no regen. Teach "kill the shield first."
  - *Wave 8:* the bulwark gains regen and, on death, drops a **splitter** (the
    shield's "core" bursts into the splitter mechanic), so clearing it creates
    a new mini-wave right at the chokepoint.
- **Tests:** target prioritization and the use of AoE/pierce to chew through a
  slow-resistant shield. Rewards a focused kill chain (kill bulwark → burst
  Warden) and punishes a "just cover the corridor and let them both leak"
  build.
- **Impl sketch:** a `BossBulwark` trait pairing the bulwark entity to the boss
  (reference to boss id); a `BossBulwarkSystem` that gates the boss's damage
  (boss takes no damage while its bulwark is alive *and* the bulwark is ahead
  on the same path) and handles the bulwark-death burst / wave-8 regen. Medium
  cost.

*Verdict:* strong "ordered kill" puzzle, very readable (a big blocky shield in
front of the boss). Slightly less "convergence-specific" than B/E but a
distinct, satisfying mechanic.

---

### Quick comparison

| Variant | Core challenge | Most on-theme for level 2? | Player skill tested | Impl cost | UI cost |
|---|---|---|---|---|---|
| A — The Wall | Break a peeling armor wall + clear its escorts | low | sustained DPS | low | low |
| B — The Ferryman | Cover both approaches; boss flips front pre-merge | **high** | placement (both approaches) | medium | low |
| C — The Conduit | Throughput vs. a moving spawner | medium | map throughput | low-med | low |
| D — The Phase-Shifter | Burst damage in vulnerability windows | medium | timing / AoE focus | medium | med (timer) |
| E — The Twin | Two simultaneous fronts, boss scale | **highest** | two-front allocation | medium | med (2 bars) |
| F — The Bulwark | Ordered kill (shield → boss) | medium | target priority | medium | low |

### Recommendation

**Lead with Variant E (The Twin) as the level's signature boss, using the
two-beat curve as the level's identity:**

- **Wave 4 = one Warden** (the "one front" tutorial) — give it a single, simple
  active so the mechanic is learnable: use **Variant B's swap** as its one
  trick, or **Variant A's single armor layer**. This keeps wave 4 light.
- **Wave 8 = two Wardens (the Twin), simultaneous**, one armored / one swift,
  the "two fronts" exam. This is the payoff that justifies the map's name.

If we want a **single, lower-risk** boss (less UI work), **Variant B (The
Ferryman)** is the best *single-entity* choice: it is the most level-2-specific
and needs no boss-bar changes. **Variant D (Phase-Shifter)** is the best choice
if we want the most *active/interactive* feel and are willing to tune the
phasing.

A sensible ship shape: **B (Ferryman) for wave 4** + **E (Twin) for wave 8**
gives a two-beat level that first teaches covering both approaches and then
pays off the two-front theme — but that combines two mechanic surfaces, so if
we want to ship one coherent boss, pick **E (Twin)** and let its two bodies
carry the curve, or **B (Ferryman)** for the simplest on-theme single boss.

---

## 3. Balance reference (for whoever implements)

Useful numbers pulled from `public/configs/game.json` + `level_2.json` so the
variants can be tuned against real values:

**Enemy base stats** (health / speed / reward / healthLoss):

| Type | HP | Speed | Reward | HP loss |
|---|---|---|---|---|
| basic (Troop) | 50 | 1.4 | 10 | 1 |
| fast (Wraith) | 35 | 2.5 | 5 | 1 |
| medic (R&H) | 45 | 1.2 | 12 | 1 |
| splitter | 90 | 1.5 | 15 | 2 |
| tank (Tankee) | 200 | 0.8 | 25 | 2 |

**Towers** (cost / damage / range / cooldown-seconds / notes):

| Tower | Cost | Dmg | Range | Cooldown | Notes |
|---|---|---|---|---|---|
| basic | 50 | 20 | 3.5 | 1.0 | single target |
| slow | 75 | 10 | 3.0 | 0.8 | 0.7 slow, 3s |
| relay | 90 | 0 | — | — | +15% dmg/range to neighbors |
| brl | 125 | 50 | 5.0 | 4.0 | AoE radius 1.5, rocket |
| laser | 150 | 20 | 4.5 | 2.0 | pierce ×5, beam |
| chain | 200 | 25 | 3.5 | 2.0 | chains, −30%/hop, 3 hops |

**Enemy upgrades** (the stack the boss inherits): Armored (×1.5/1.75/2 HP),
Swift (×1.35/1.5/1.7 speed), Regenerating (+5/10/15 HP/s), Reinforcements
(+20/40/65% enemy count), Unstoppable/slowResistance (25/65/100%), Missing Out
(5/10/15% dodge).

**Current level-2 boss placeholder:** 1200 HP, speed 0.7, size 1.5, 5 HP loss,
300 reward, ×1.5 HP growth, every 4th wave (→ 1200 on wave 4, 1800 on wave 8).

**Tuning anchors:**
- A boss should die *near the end* of its wave, not dominate it entirely. With
  ~27 (wave 4) / ~57 (wave 8) regular enemies, the boss's HP should be a
  *fraction* of the total wave DPS the player can generate, leaving the regular
  wave as the real "clear" condition.
- Keep the boss's `healthLoss` (5) at or below the level's starting health
  (20) so a single boss leak is a setback, not an instant loss.
- `hpGrowthPerAppearance` (×1.5) already handles the wave-4→wave-8 scaling;
  the variants add the *behavioral* second layer, not more raw HP.

---

## 4. Sector 3 (The Coil) — next-level boss ideas (**do not implement**)

Sector 3 is a **single, long spiral** path (14 waypoints, concentric loops that
converge on the base), 9 waves, boss on wave 4 and 8. Its current placeholder
is "The Coil Sentinel" (1400 HP, speed 0.8, size 1.6, ×1.6 growth). The unique
constraint is the **opposite** of level 2: it is *one* very long, winding
path, so "kiting" is trivial (there's lots of loop to cover with towers). The
boss needs a mechanic that **punishes the "spray towers along the whole spiral"
strategy**. Ideas only — no implementation:

1. **"The Maw / The Gyre" — a moving spawner on the spiral.** The boss circles
   the loops and periodically releases enemies *at the outer edge of the
   spiral* (a moving spawner that walks the loop and drops units behind it).
   The spiral becomes a conveyor of minions the player must clear *while* it
   loops. Punishes a static tower spread: the spawns arrive at a *rotating*
   point, so fixed coverage can't keep up.

2. **"The Accelerant" — a boss that speeds up each lap.** The boss gains a
   speed bump every time it completes a full loop of the spiral (it "coils up").
   A pure-kite build (relying on the long path to wear it down) fails: the boss
   eventually laps the player's towers. Rewards burst/AoE at the chokepoint
   (the inner convergence) rather than spread-out coverage. A nice "the longer
   you drag this out, the worse it gets" curve within a single appearance.

3. **"The Anchor" — a boss that heals at the center.** The boss periodically
   "anchors" at the spiral's innermost point (the convergence): while anchored
   it is invulnerable and regens, and releases a radial burst that briefly
   slows all nearby enemies. The player must **break the anchor** (a damage
   threshold at the center) before the boss can proceed. Turns the spiral's
   convergence point — the place you'd normally overload with towers — into the
   single most important spot, but also the place the boss *heals*.

4. **"The Twin Coil" — two bosses on one spiral, offset.** Two Sentinels on the
   same path, offset by ~half a loop. They alternate being the "lead" and
   "trail," so the player's chokepoint coverage is constantly being
   re-tested by which boss is in range. On a single long path this creates a
   near-constant stream of boss bodies through the same chokepoint — the
   spiral's length becomes a *liability* for the player.

5. **"The Phase Coil" — geometry-tied phasing.** The boss is vulnerable only
   during the *inner* loops and invulnerable during the *outer* loops (or vice
   versa), tied to its position on the spiral. This forces the player to place
   their heaviest DPS specifically on the inner convergence so the boss spends
   its vulnerable phase in the kill zone — a placement puzzle that is
   *uniquely* a spiral thing.

**Why these (and the recommendation):** The spiral's identity is "one long
winding path with a convergence." The most on-theme boss is the one that
**abuses the convergence point** (ideas 3 and 5) or **turns the long path from
a kiting asset into a threat** (ideas 1 and 2). I'd lean toward **idea 2
(Accelerant)** for a clean single-boss feel (a simple "it gets faster each lap"
rule that scales naturally with the boss's existing HP growth) or **idea 3
(Anchor)** for a more spatial "convergence point" puzzle that mirrors level 2's
"convergence" theme from the other direction.

---

## 5. Appendix: shipped boss config (level 2)

The Ferryman (Variant B) as it ships in this PR — the `pathSwap` list gives it
one front-cross on wave 4 (appearance 1) and a second, back-cross from wave 8
(`minAppearance: 2`):

```jsonc
"boss": {
  "name": "The Ferryman",
  "everyNthWave": 4,
  "baseStats": {
    "health": 1200,
    "speed": 0.7,
    "size": 1.5,
    "healthLoss": 5,
    "reward": 300
  },
  "hpGrowthPerAppearance": 1.5,
  "pathSwap": [
    { "atProgress": 0.3636, "targetPathIndex": 1 },
    { "atProgress": 0.6, "targetPathIndex": 0, "minAppearance": 2 }
  ]
}
```

A chosen variant would add **behavior** (new traits/systems per the sketches in
§2) on top of this config, keeping the config shape stable so other levels
inherit the same boss plumbing.
