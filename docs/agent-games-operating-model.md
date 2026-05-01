# Agent Games Operating Model v0.1

> Living coordination model for the `#agent-games` thread and the Agent Game Arcade repo.

## Doctrine

**Merquery directs. Kodor builds slices. Dr verifies/artifacts. Critic agents review. Humans steer taste.**

This process is intentionally lightweight: encode enough structure for agents to coordinate, then improve the process through real game-dev pilots.

## Roles

### Merquery — director / producer / integrator

Merquery owns the spine of the work:

- translate ideas into scoped slices
- decide what can be delegated
- maintain plans, tickets, manifests, and release notes
- integrate work into `agent-apps`
- run or route verification
- report blockers, meaningful changes, and completion evidence

Merquery should avoid giant handoffs like "make this game fun". Break work into small, testable slices.

### Kodor — coding specialist

Kodor builds bounded implementation slices with explicit file scope and acceptance criteria.

Good Kodor tasks:

- add local high score persistence
- add enemy wave progression
- add hit-marker or damage feedback
- refactor input handling in one game
- add DOM/debug test hooks
- fix a specific console error or failing test

Avoid Kodor tasks:

- make the whole game
- redesign the entire architecture
- polish everything
- make it more fun without concrete criteria
- broad refactors touching unrelated games/infrastructure

### DrClawBotNik — verifier / operator / artifact collector

Dr verifies that the game actually works in browser and produces evidence.

Good Dr tasks:

- run `npm test`, `npm run test:ci`, and `uv run pytest`
- launch/check the preview service
- capture screenshots and gameplay videos
- check browser console/page errors
- verify preview URLs and artifact paths
- summarize failures with commands and logs

### Critic agents — review-only specialists

Critic agents do not own code. They inspect artifacts and produce focused feedback.

Good critic tasks:

- review screenshot for HUD/readability issues
- review gameplay video for feel and clarity
- score a game using the standard scorecard
- suggest 3-5 next improvements
- identify confusing controls/UI states

### Humans — taste, priority, and final steering

Humans decide what is actually fun, weird, worth shipping, or worth abandoning. Agent scorecards inform taste; they do not replace it.

## Standard loop

```text
Idea or request
  ↓
Merquery writes a tiny spec / ticket
  ↓
Kodor implements one bounded slice
  ↓
Dr verifies tests, preview, screenshots, video, logs
  ↓
Critic agent reviews artifact and scorecard
  ↓
Merquery integrates, commits, and reports evidence
  ↓
Human steers the next taste/prioritization call
```

## Delegation rules

1. Every coding task needs explicit files allowed, acceptance criteria, and verification.
2. Prefer tasks that take 2-30 minutes and can be verified by tests/artifacts.
3. Do not dispatch multiple coding agents to edit the same files at the same time.
4. Textual claims are not proof. Verify with tests, logs, screenshots, video, or filesystem checks.
5. Keep generated artifacts ignored unless a human explicitly asks to commit them.
6. Preview/security infrastructure changes require Merquery review and full verification before commit.
7. If agent output is only proposed code/commands, Merquery or Dr owns execution and verification.

## Game project card template

```text
Game:
Status:
Owner/director:
Current playable URL:
Core loop:
Controls:
Known issues:
Next 3 improvements:
Latest scorecard:
Artifacts:
```

## Agent task ticket template

```text
Agent:
Role:
Task:
Files allowed:
Acceptance criteria:
Verification command/artifact:
Result:
Blockers:
```

## Release/update report template

```text
Done:
Commit:
Preview:
Tests:
Screenshot/video:
Scorecard:
Next recommended move:
```

## Scorecard

Use 0-10 for each category:

| Category | Question |
| --- | --- |
| Gameplay | Is the loop fun and understandable? |
| Controls | Are inputs responsive and correctly mapped? |
| Visual clarity | Can you tell what is happening? |
| Performance | Does it feel smooth in browser? |
| Replayability | Is there a reason to try again? |
| Agent self-test quality | Did the agent provide real test proof/artifacts? |

## First pilot

Use this model on the Neon Breach weapon-feedback polish slice in:

```text
docs/plans/2026-04-30-neon-breach-weapon-feedback-pilot.md
```

After the pilot, update this operating model based on what was useful, annoying, or missing.
