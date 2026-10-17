# Pathwise Cross-Domain Generation Audit

**Run date:** 22 October 2026  
**Harness:** `npm run smoke:roadmap-quality` using the local configured Ollama model.  
**Purpose:** Inspect first-chunk generation across software/ML, guitar, language learning, and robotics after the learning-design research.  
**Status:** Four scenarios produced structured output without a reported `generationError`. This is a small qualitative sample, not a statistically meaningful benchmark. The harness does not independently score factual correctness or learner outcomes.

## Sample results

| Domain | Chunk sessions | Chunk effort | Remaining-goal estimate | Confidence | Weekly availability | Estimated weeks to goal |
|---|---:|---:|---:|---|---:|---:|
| ML deployment | 3 | 90 min | 1,800 min | Low | 225 min | 8 |
| Guitar performance | 3 | 69 min | 250 min | Medium | 150 min | 2 |
| Beginner Spanish travel conversation | 3 | 46 min | 15,000 min | Low | 100 min | 150 |
| ESP32 obstacle-avoiding robot | 2 | 60 min | 550 min | Medium | 180 min | 4 |

The harness now distinguishes **estimatedChunkWeeks** (how long this small chunk represents at the learner's weekly pace) from **estimatedGoalWeeks** (remaining effort divided by weekly availability). Previously a generic `estimatedWeeks` field was calculated from the chunk total and could be mistaken for the time to reach the full goal.

## Qualitative observations

### 1. ML deployment
The chunk sequence was sensible: prepare/train a tabular classifier, evaluate on held-out data, then expose a prediction endpoint. Prerequisite order was coherent and the 90-minute total matched three 30–35 minute sessions in a 45-minute/day schedule with the 20% buffer. The remaining estimate is low-confidence and should not be treated as a calibrated forecast.

### 2. Guitar / named song
The generator correctly replaced song-specific chord/progression work with a “Find and verify a trusted song reference” activity because no trusted arrangement reference was supplied. This avoids inventing exact arrangement details.

**Important defect found:** the generated chunk totaled only 69 minutes and the model's remaining-goal estimate was 250 minutes. The repository contains a deterministic beginner guitar-song realism floor of 1,800 minutes, but a source search shows `applyRealismFloor` is defined and exported yet not called by the active `generateRoadmap` pipeline. Therefore that guard did not affect this live sample. The guard also currently scales topic estimates, so its application point must ensure the remaining-work estimate used for deadline feasibility is consistent too. Fix this before trusting named-song deadline outlooks.

### 3. Beginner Spanish
The first chunk included greetings/politeness, self-introduction, and asking for simple directions. This is a useful initial slice of the travel-conversation goal, with concrete phrase-production objectives. The long-term estimate was 15,000 minutes (150 weeks at 100 minutes/week) at low confidence; this is likely too imprecise to present as a precise forecast. The chunk did not yet cover ordering food or understanding spontaneous replies, which is acceptable only because this is the first small chunk and the next chunks must continue toward those missing capabilities. Future language-specific sessions should include listening, spoken production, retrieval of vocabulary from previous days, and short unscripted exchanges—not only recognition questions.

### 4. ESP32 robotics
The sequence began with setup and controlled motor movement, followed by ultrasonic distance sensing. That is a plausible dependency order for the target. The first chunk does not yet demonstrate integrated collision avoidance or repeatable-course reliability, so the follow-up must combine the subsystems, run controlled tests, capture observations, and debug one variable at a time. Before practical wiring, the lesson should explicitly verify the learner's motor driver, power supply and sensor voltage compatibility rather than assume a particular board/wiring setup.

## Findings and next actions

1. **Fix the unused guitar realism guard.** Invoke it at the correct point in generation and synchronize topic totals, phase breakdowns, and `learningBrief.estimatedRemainingMinutes`. Do not allow the total remaining estimate to undercut a deterministic domain-specific minimum.
2. **Make the smoke harness evaluate quality, not only successful JSON generation.** Add explicit checks for objective coverage, session/day budget, phase arithmetic, prerequisite validity, independent practice, authentic evidence, and continuation quality.
3. **Make language learning more interactive.** Include active recall, listening, spoken production, short dialogues, delayed vocabulary review and feedback on the learner's own responses.
4. **Make robotics evidence physical and observable.** Include a test procedure, expected/observed readings, wiring/safety assumptions, and a subsystem-to-integrated-system progression.
5. **Use the new four-chunk context in a real persisted continuation test.** Current live smoke is a first-chunk generator check; it does not prove that PostgreSQL history, weak retakes, or the learner-facing continuation summary work end to end.
6. **Calibrate estimate confidence.** The wide spread (250 to 15,000 minutes) shows that a successful generation does not mean a credible remaining-effort estimate. Track actual task outcomes and keep low-confidence estimates visibly provisional.

## Follow-up implementation update (2026-10-22)

The cumulative-practice recommendations above have now been added to the roadmap planner and independent reviewer prompts. The prompt is domain-aware and gives explicit guidance for music/instruments, language, programming/technical work, robotics/hands-on builds, and a general skill fallback. Unit tests assert that the guitar example preserves yesterday's two chords while introducing a third and that language, coding and robotics each receive different practice instructions.

The beginner guitar-song effort floor has also been corrected in code: it applies to the separate remaining-goal estimate on the first chunk and no longer inflates individual sessions or breaks the chunk's phase arithmetic. A continuation with prior learning context is not reset to the first-chunk floor. The attempted follow-up live guitar sample did **not** reach generation: Ollama returned `ROADMAP_PROVIDER_UNAVAILABLE` because the local provider was stopping/unavailable. This is an infrastructure failure, not a pass or a model-quality failure. Re-run the sample after Ollama is healthy before claiming that the new generated lesson follows the cumulative routine or that the corrected estimate appears in live output.

## Reproducibility and limitations

The output is from a single run against one configured local model on one date. Sampling variability, prompt/model settings, and learner differences can change results. The smoke run validates that the generation pipeline can produce four domain-shaped chunks; it does not establish that the lessons are factually perfect, that the learner will achieve the target, or that the estimates are calibrated.