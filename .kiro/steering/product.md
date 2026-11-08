# Product: Spooky Coach (Kiroween Exercise App)

A Halloween-themed, phone-first fitness website. A 3D skeleton Coach demonstrates every Exercise and Stretch; beginners rotate it, jump to front/side/back views, pause and slow it down. They follow a guided Routine, confirm each Set themselves, earn Candy, and spend it to Unlock Coach colors and Accessories.

Built for Kiroween 2026, Costume Contest category. Deadline: Fri 2026-12-04, 2 PM PT. Judging weights Impact, Technical implementation (use of Kiro), Design, Idea and Presentation equally; polish of the Halloween UI matters most for this category.

Sources of truth: `CONTEXT.md` (glossary), `docs/adr/0001–0004`, `.scratch/spooky-coach-mvp/spec.md` (user stories, decisions, scope).

## Glossary

Use these exact terms in UI text, code identifiers, test names, issues and comments. Never use the "Avoid" words. If a concept is missing from the glossary, don't invent a synonym; flag the gap.

| Term | Meaning | Avoid |
|---|---|---|
| **Coach** | The single 3D skeleton character that demonstrates every Exercise. The user can personalise it. | Avatar, trainer, model, character |
| **Coach name** | The name the user gives their Coach. Free. | |
| **Coach color** | A color option for the Coach. Two or three are free; the rest cost Candy. | |
| **Accessory** | A wearable on the Coach (glowing eyes, witch hat, pumpkin head). Every Accessory costs Candy. | Item, cosmetic, skin |
| **Exercise** | One movement with instructions and safety notes. Its target is reps **or** seconds, never both. | Move, pose, activity |
| **Stretch** | An Exercise held for seconds. Has its own section in the app. | |
| **Routine** | A fixed, ordered list of Exercises, each with a target number of Sets, ending in a Cool-down. The only way to earn Candy. | Program, plan, playlist |
| **Cool-down** | The Stretches at the end of every Routine. | |
| **Workout** | One run-through of a Routine, from start to summary. | Session (in UI text), training |
| **Set** | One round of an Exercise inside a Workout. The user confirms it; the app never counts reps. | |
| **Workout outcome** | **completed** (every Set confirmed), **partial** (reached the summary with skipped Sets) or **abandoned** (the user quit). | Status, result |
| **Candy** | Earned only in Workouts; spent on Coach customisation. | Points, coins, score, XP |
| **Welcome gift** | 15 Candy granted once to a brand-new user. | |
| **Unlock** | Spending Candy to make a Coach color or Accessory permanently available. No real money. | Buy, purchase |

The customisation screen is called the **Crypt** in the UI.

## Candy rules

- 1 Candy per confirmed Set. Stretches count.
- +5 bonus only when every Set, including the Cool-down, is confirmed.
- Skipped Sets earn 0. Abandoned Workouts keep the per-Set Candy already earned.
- Browsing Exercises or Stretches outside a Workout earns 0.
- Welcome gift: 15 Candy, exactly once. No daily cap, no anti-cheat.
- Prices (tunable content): glowing eyes 10, witch hat 15, pumpkin head 40, extra Coach colors 5 each.
- An Unlock with too little Candy fails and changes nothing. The Unlock button is disabled and shows how much more Candy is needed.
- Unlocks are permanent. Equipping and unequipping are free. The equipped look appears everywhere the Coach appears, including Workouts.

## Product rules

- No sign-up. The visitor lands straight on the home screen.
- Show a short safety message in the Coach's voice before the first Workout and on every Exercise page: the Coach cannot see the user or check their form.
- Sets are self-reported. For rep targets the user can adjust actual reps (0–200). For second targets a countdown stops at the target and waits for confirmation.
- A rest timer starts after each confirmed Set and shows what comes next. Rest can be skipped. Skipping a Set needs a confirmation.
- Pausing stops both the timer and the Coach. The Workout pauses itself when the tab is hidden or the phone locks.
- After a refresh or close mid-Workout, offer Resume or Discard. Time while the page was closed never counts.
- The summary shows Sets confirmed and skipped, active time, Candy earned and the Workout outcome. Never claim or imply "perfect form".
- Sound effects (a few CC0 clips) are off by default with a mute/unmute button. No music.
- Reduced motion: the Coach starts paused, no automatic camera motion, and a simple "+1" replaces the Candy burst.
- Accessibility: every viewer gesture has a button, every button is labelled, the current Exercise, Set and timer are screen-reader readable, layouts reflow with large text, touch targets are large.
- Portrait phone first; must also look great on a laptop for judges.
- English only. All user-facing text sits in one place so Thai can be added later.

## Content

- **Must have:** Grave Rise (air squat), Skeleton Jacks (jumping jacks), Coffin Push (push-up), 2 Stretches, Routine "Graveyard Shift" (~10 min, with Cool-down).
- **Nice to have:** Crypt Crunch, Zombie Burpee, a 3rd Stretch, Routine "Witching Hour" (~15 min), stretch-only Routine "Moonlight Stretch".
- Stretch choices depend on what can be animated convincingly.

## Out of scope (do not build)

Native apps; accounts, login, sync, any server or database (Supabase); camera, pose detection, form scoring, automatic rep counting; analytics, telemetry, consent and data export flows; admin content pipeline; shipping Thai; music, voice narration, story/levels/monsters; extra creature types, capes or cloth simulation; offline downloads, reminders, notifications; daily Candy cap or anti-cheat; medical, rehab, pregnancy or youth programs.
