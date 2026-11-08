# Kiroween Exercise App

A Halloween-themed fitness app where a spooky 3D coach demonstrates exercises that beginners can view from any angle and follow in short workouts.

## Language

### Coach

**Coach**:
The single 3D skeleton character who demonstrates every exercise. The user can personalise it.
_Avoid_: Avatar, trainer, model, character

**Coach name**:
The name the user gives their Coach.

**Accessory**:
A wearable item (e.g. witch hat, cape) that the user can put on the Coach. Every Accessory costs Candy.
_Avoid_: Item, cosmetic, skin

**Coach color**:
A color option for the Coach. A few are free from the start; the rest cost Candy.

### Training

**Exercise**:
One movement the Coach can demonstrate, with its instructions and safety notes. Its target is either reps or seconds.
_Avoid_: Move, pose, activity

**Stretch**:
An Exercise held for seconds rather than counted in reps. Shown in its own section of the app.

**Routine**:
A fixed, ordered list of Exercises, each with a target number of Sets, ending in a Cool-down. The only way to earn Candy.
_Avoid_: Program, plan, playlist

**Cool-down**:
The Stretches at the end of every Routine.

**Workout**:
One run-through of a Routine by the user, from start to summary.
_Avoid_: Session (in user-facing text), training

**Workout outcome**:
How a Workout ended: **completed** (every Set confirmed), **partial** (reached the summary with skipped Sets), or **abandoned** (the user quit).
_Avoid_: Status, result

**Set**:
One round of an Exercise inside a Workout. The user confirms it themselves; the app never counts reps.

### Rewards

**Candy**:
The points a user earns by finishing training, which they spend on Coach customisation. Earned only in Workouts: per confirmed Set, plus a bonus when every Set including the cool-down is confirmed. Skipped Sets earn nothing; viewing Exercises outside a Workout earns nothing.
_Avoid_: Points, coins, score, XP

**Welcome gift**:
The Candy a brand-new user receives once, enough to buy one Accessory straight away.

**Unlock**:
Spending Candy to make a Coach color or Accessory permanently available.
_Avoid_: Buy, purchase (no real money is involved)
