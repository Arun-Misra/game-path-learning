# Pathwise Learning Design Research and Generation Audit

**Research date:** 22 October 2026  
**Scope:** Pathwise / Gamified Learning V2 — any-skill roadmap generation, rolling follow-up chunks, daily missions, assessment, adaptive review, and learner motivation.  
**Purpose:** Turn research into concrete product and engineering decisions, not copy another app's appearance.

## Executive summary

Pathwise already has several strong foundations: it asks about the learner's starting point and desired outcome; generates short rolling chunks rather than an enormous static curriculum; requires a worked-example-to-independent-practice sequence; stores assessment evidence; adapts future chunks using completion and timing history; preserves completed work; and uses deadline feasibility checks.

The largest opportunity is to move from **generating a list of activities** toward **running a closed learning loop**:

1. **Orient:** explain the small capability being built and why it matters to the learner's goal.
2. **Retrieve:** briefly ask the learner to recall relevant prior knowledge before showing an explanation.
3. **Teach:** introduce one manageable idea with a concrete example or demonstration.
4. **Guide:** let the learner attempt a partially scaffolded variation.
5. **Perform:** ask for an independent action that demonstrates the capability.
6. **Give feedback:** identify the specific error or misconception, explain why it happened, and let the learner retry.
7. **Connect:** apply the skill in a small authentic task, song, conversation, project, or real-world situation.
8. **Schedule review:** revisit the knowledge or action later, with spacing adjusted to observed performance.
9. **Reflect and adapt:** record evidence, ask about friction only when it changes the plan, and generate the next small chunk.

A roadmap topic should be a **promise of learning and observable evidence**, not just a title plus estimated minutes. A follow-up chunk should be generated from the learner's demonstrated capability and current constraints, not merely from the previous chunk's text.

## 1. What the research and products suggest

### 1.1 Learning science: durable recall matters more than exposure

A 2022 review in *Nature Reviews Psychology* describes spacing and retrieval practice as effective learning strategies across domains and ages. A systematic review of classroom research also finds retrieval practice broadly benefits student learning. A tutorial review identifies six robust strategies: spaced practice, interleaving, retrieval practice, elaboration, concrete examples, and dual coding.

**Pathwise implications**
- Do not equate reading an explanation, watching a video, copying a solution, or marking a mission complete with mastery.
- Use short, low-stakes retrieval before reteaching: “What do you remember?” or a tiny attempt. Show hints after the learner has tried, not before.
- After a mistake, explain the underlying reason and offer a retry with a changed example. Later checks should test recall without the original scaffold.
- Review old material alongside new material when it helps discriminate between similar concepts. Do not mechanically mix unrelated topics just to claim interleaving.
- Let a learner advance after evidence of capability, while keeping a review queue for material likely to be forgotten.

**Sources**
- Carpenter, Pan & Butler, “The science of effective learning with spacing and retrieval practice,” *Nature Reviews Psychology* (2022): https://doi.org/10.1038/s44159-022-00089-1
- Agarwal, Nunes & Blunt, “Retrieval Practice Consistently Benefits Student Learning,” *Educational Psychology Review* (2021): https://doi.org/10.1007/s10648-021-09595-9
- Weinstein, Madan & Sumeracki, “Teaching the science of learning” (2018): https://link.springer.com/article/10.1186/s41235-017-0087-y
- Chen, Paas & Sweller, “Spacing and Interleaving Effects Require Distinct Theoretical Bases” (2021): https://link.springer.com/article/10.1007/s10648-021-09613-w

### 1.2 roadmap.sh: paths need branches, prerequisites, checkpoints, and projects

The roadmap.sh catalogue spans role-based paths (for example Frontend, Backend, Full Stack, DevOps, Machine Learning, Data Engineer, Product Design, Cyber Security, QA, and others), skill-based paths (languages, frameworks, databases, DSA, System Design, Linux, cloud, and more), beginner tracks, best-practice tracks, and project ideas. Its beginner guidance explicitly emphasizes setting a goal, consistent study, avoiding tutorial hell, building projects, and learning to get unstuck.

Representative patterns from its Full Stack roadmap:
- Start with web foundations (HTML, CSS, JavaScript and package tooling).
- Use checkpoints such as static pages, interactivity, collaboration, external packages, and frontend apps.
- Then move to backend, APIs, data storage and a complete app.
- Deployment, automation, CI/CD, monitoring and infrastructure appear as later capabilities.
- Project ideas at checkpoints help convert topic knowledge into something built.

Its DSA roadmap branches into programming fundamentals, data structures, complexity, sorting/searching, trees/graphs, advanced structures, and problem-solving techniques. This is a dependency map, not a single flat list: a learner needs the foundations and runtime reasoning before many advanced techniques make sense.

**Pathwise implications**
- Model prerequisites as capability dependencies, but show a readable path rather than a wall of nodes.
- Define checkpoints by what the learner can do, with evidence. “Understand REST” is weaker than “build and test a CRUD endpoint with validation and useful errors.”
- Alternate learning with a meaningful project or use case. A project should be the natural consequence of recent skills, not an arbitrary capstone inserted into day one.
- Treat roadmap.sh as a catalogue and reference for technical scope, not as a day-by-day teaching engine. Its paths help answer *what belongs and what depends on what*; Pathwise must additionally decide *what this learner should do today, how to teach it, and when to review it*.
- Avoid treating one public roadmap as a universal syllabus. Check relevance against the learner's target, current ability, constraints and preferred learning mode.

**Sources**
- Roadmap catalogue: https://roadmap.sh/roadmaps/
- Getting started / beginner guidance: https://roadmap.sh/get-started
- Full Stack roadmap PDF: https://roadmap.sh/pdfs/roadmaps/full-stack.pdf
- Data Structures & Algorithms roadmap: https://roadmap.sh/datastructures-and-algorithms
- DSA roadmap PDF: https://roadmap.sh/pdfs/roadmaps/datastructures-and-algorithms.pdf
- Machine Learning roadmap: https://roadmap.sh/machine-learning
- Project ideas catalogue: https://roadmap.sh/projects

**Coverage note:** The catalogue taxonomy was surveyed broadly and representative full-stack, DSA, and ML paths were inspected. This is not a claim that every individual roadmap page was exhaustively audited line by line; the catalogue is large and changes over time.

### 1.3 Duolingo: small steps, adaptive challenge, and review inside the path

Duolingo's published teaching principles emphasize interactive practice from the start, AI and learning-science personalization, focusing on important skills, motivation, and delight. Its adaptive-lesson description explains that tasks become harder when the learner is succeeding and use scaffolding when introducing unfamiliar material. Its spaced-repetition writing describes reviewing old material at increasing intervals and prioritizing content the learner is more likely to forget. Its Music course uses bite-sized interactive exercises to develop rhythm, note recognition, listening, reading, and then playing songs.

**Pathwise implications**
- Make the learner *do* something early, even in a first lesson. The activity can be tiny and scaffolded.
- Use a “learning frontier”: mostly accessible material plus a manageable new challenge, rather than all easy repetition or a sudden difficulty jump.
- Keep review visible and specific: show what is due and why, rather than relying on a streak alone.
- Adapt within a session when possible: if the learner succeeds, ask a transfer question; if they struggle, show a hint, worked step, or simpler contrast.
- Celebrate evidence of capability, not only elapsed time or clicks. XP is motivation; it is not proof of learning.
- A streak should encourage return without pressuring learners to do low-quality busywork when they have little time.

**Sources**
- Duolingo teaching method: https://blog.duolingo.com/duolingo-teaching-method/
- Adaptive lessons and the learning frontier: https://blog.duolingo.com/keeping-you-at-the-frontier-of-learning-with-adaptive-lessons/
- Spaced repetition: https://blog.duolingo.com/spaced-repetition-for-learning/
- Student models and skill strength: https://blog.duolingo.com/how-we-learn-how-you-learn/
- Duolingo Music course: https://blog.duolingo.com/music-course/
- Reviewing previous lessons (published October 2026): https://blog.duolingo.com/how-to-review-lessons-on-duolingo/

### 1.4 Guitar learning: practice a repertoire, not only isolated techniques

JustinGuitar's beginner course sequences basic instrument handling and tuning, first chords, first songs, chord changes, rhythm, strumming, metronome work, technique, theory, and consolidation. Its first-step module includes a short practice schedule, one-minute chord-change exercises, backing tracks, and easy songs. The site cautions that finishing the lesson content is not the same as building solid fundamentals; it recommends additional consolidation. Fender Play asks about instrument, level and style, then provides a path from basic technique through progressively more advanced skills and songs. It also includes practice plans, feedback modes and backing tracks. Ableton's interactive Learning Music moves from beats, bass, chords and melodies to creating and combining patterns.

**Pathwise implications**
- Skill-specific instructional structure matters. A guitar session should not be forced into “read concept → answer quiz” if the actual skill requires physical repetition, listening, timing, and performance.
- Mix isolated drills with a meaningful piece of repertoire. For guitar: a chord change drill can be immediately used in a song or backing track.
- Include observable quality signals: clean chord changes, stable tempo, accurate notes, ability to play a section without stopping, or a recording/teacher check when feasible.
- Use short focused practice blocks and revisit techniques across sessions. Motor skills need repeated execution over time; a single multiple-choice quiz is inadequate.
- Do not invent exact song arrangements, tabs, lyrics, or chords. Use a verified learner-provided resource when a named song is involved.
- Ask what went wrong in practice when useful (tempo too high, hand tension, unclear rhythm, source mismatch), then change the next session accordingly.

**Sources**
- JustinGuitar Beginner Grade 1: https://www.justinguitar.com/classes/beginner-guitar-course-grade-one
- First steps and practice schedule: https://www.justinguitar.com/modules/beginner-1-first-steps
- How JustinGuitar works and consolidation guidance: https://www.justinguitar.com/faq/how-justinguitar-works
- Fender Play personalized paths: https://www.fender.com/play
- Fender Play practice collections: https://www.fender.com/play/guitar/collections
- Ableton Learning Music: https://learningmusic.ableton.com/

A meta-analysis of music practice supports a substantial relationship between task-relevant deliberate practice and musical achievement, while also making clear that practice quality and domain context matter. It should not be used to promise a specific time-to-mastery for an individual.
- Macnamara et al., “The influence of deliberate practice on musical achievement: a meta-analysis”: https://pmc.ncbi.nlm.nih.gov/articles/PMC4073287/

## 2. Current Pathwise strengths and gaps

### Existing strengths to preserve
- Short rolling planning horizons, rather than generating a whole long-term curriculum upfront.
- Goal, learner experience, clarifications and available time are passed into generation.
- A first chunk and continuation chunks use different prompts; follow-up chunks receive prior progress and assessment evidence.
- The generator requires phase-by-phase estimates for explanation, worked example, guided practice, independent practice and review.
- The reviewer audits the proposed roadmap; deterministic validation catches structural errors, time-budget violations and some unjustified repeats.
- Assessment answer keys stay server-side; recent scores influence next-step recommendations and future mission generation.
- Actual-versus-estimated timing evidence can influence future planning after enough samples.
- Deadline feasibility is refreshed from current persisted state.
- Existing work and XP are preserved when adapting plans.

### Main gaps to investigate and improve
1. **The activity model is still too coarse.** A topic description can contain a teaching sequence, but the persisted model does not yet represent each phase as a learner-facing step with its own interaction, answer, hint, feedback and evidence. The scheduler can turn a topic into a mission, but it cannot guarantee that the learner actually experiences each teaching step.
2. **Assessments are mostly multiple-choice.** Useful for concept checks, but insufficient alone for code-writing, conversation, instrument performance, physical skills, or project work. A roadmap should define domain-appropriate evidence and use a quiz only where it fits.
3. **Follow-up personalization needs stronger evidence semantics.** Completion, self-reported confidence, assessment scores, timing, and direct performance are different evidence types. They should not be treated as interchangeable proof of mastery.
4. **The next chunk needs to explain its adaptation.** Learners should see a short “why this next” note: what evidence was used, what capability comes next, what is being reviewed, and what changed because of their available time.
5. **Generation needs domain-specific lesson archetypes, not a universal phase template.** A shared learning loop is useful, but the activity mechanics must vary for programming, languages, music, academic knowledge, and hands-on building.
6. **Estimate confidence must remain honest.** A model's total remaining-minute estimate is not a validated forecast. Actual completion data and learner outcomes should gradually calibrate it; avoid false precision.
7. **Follow-up should be lightweight.** Do not ask a long survey after every session. Ask a targeted question when an error pattern, repeated stall, timing mismatch, or ambiguous goal means the answer would materially change the next plan.

## 2.1 The crucial distinction: cumulative practice is not repeating yesterday's lesson

The learner's guitar example is an important design requirement: **new learning should accumulate, not replace yesterday's skill**. If Day 1 teaches two chords, Day 2 should retrieve and practise both chords, introduce a third, and use the old and new chords together. Day 3 should revisit all three, focus extra time on the weakest transition, and integrate them into a short phrase or song section. As the repertoire grows, old items rotate in and out rather than every item receiving equal time every day.

This is directly reflected in JustinGuitar's public course sequence: its early modules introduce A and D chords and a first song, then add rhythm, chord changes and E, followed by minor chords and more strumming; later modules explicitly include consolidation. JustinGuitar also distinguishes completing lesson content from consolidating fundamentals, and recommends additional practice after the lessons. (Sources: https://www.justinguitar.com/classes/beginner-guitar-course-grade-one; https://www.justinguitar.com/beginner; https://assets.justinguitar.com/faq/how-justinguitar-works)

### Example: cumulative guitar progression

| Day | Retrieve / maintain | New step | Combine and check |
|---|---|---|---|
| 1 | Basic tuning and hand position if needed | Learn two chord shapes | Form each chord cleanly and strum each slowly |
| 2 | Recall both chords without looking; switch between them | Add a third chord if the learner can form the first two | Practise all three transitions, then play a tiny progression |
| 3 | Revisit the three chords and identify the weakest transition | Add a simple rhythm pattern or fourth chord only if time allows | Play the progression at a manageable tempo without stopping |
| 4 | Retrieve the chord/rhythm set and briefly revisit older trouble spots | Learn a small song section or a new transition | Combine the section with the established routine; record or self-check timing |
| Later sessions | Keep recent skills frequent and rotate older skills back periodically | Add one appropriately sized challenge | Apply the growing set to repertoire; slow down or isolate a difficult transition when needed |

This is an illustration, not a fixed syllabus. If the learner cannot make the first two chords cleanly, the next session should spend longer on those shapes and introduce a third only if it remains realistic. If the learner is already playing them reliably, Pathwise should progress rather than force unnecessary repetition. A useful rule is **retrieve → practise the weak point → add one new thing → integrate**.

### The same principle changes shape by domain

- **Language:** retrieve older words and phrases without notes, listen to a short exchange, produce a response, add a few new phrases, then reuse old and new language in a dialogue. Bring missed items back soon and successful items back after longer gaps.
- **Programming / DSA:** trace or explain an earlier concept from memory, then solve a changed problem, handle an edge case, and periodically mix older problem patterns. Do not repeat the exact same solution as if copying were mastery.
- **Robotics / hands-on building:** rerun the last known-good component test, add one subsystem, compare expected and observed behavior, then integrate it with the earlier subsystem. Preserve a test log and isolate one changed variable when debugging.
- **Math / academic concepts:** recall a prerequisite, solve a new example, explain the reasoning, and later mix similar problem types once the learner can distinguish them.
- **Design / creative work:** revisit one principle through a short critique or revision, learn one new technique, then apply both to the same evolving artifact.
- **Physical skills:** warm up and repeat the relevant movement, focus on one quality constraint, then combine it into the complete movement or routine. Repetition must remain safe and technique-aware.

### Product rule

Pathwise should maintain a small **rolling practice set**, not a daily checklist of everything ever learned. Review frequency should depend on recency, difficulty, learner performance and relevance to the current goal. Do not block all progression until perfection; instead, keep a difficult skill in rotation while moving forward at an appropriate pace. Every repeat should have a reason and observable success criterion.

## 3. Proposed learning loop for Pathwise

### A. Before a new chunk
1. Reconcile the learner's stated goal and target date.
2. Summarize demonstrated capabilities from recent tasks, assessments, project artifacts, and self-report separately.
3. Select one meaningful next milestone and identify the smallest prerequisite gap that blocks it.
4. Select any reviews due or weak topics that matter for the next capability.
5. Generate only the next few days of work, within the buffered daily budget.
6. Run structural, dependency, instructional-sequence, factual-risk, scope, duration and continuity checks.
7. Present the plan with the reason for each session and a checkpoint that makes progress visible.

### B. Inside a learning session
1. **Recall:** one short question or attempt from a prior session (skip when irrelevant).
2. **Goal:** “By the end, you can …” with a concrete success criterion.
3. **Model:** one small explanation/demo/example.
4. **Guided attempt:** a scaffolded variation, with progressive hints.
5. **Independent attempt:** a novel but bounded task without the answer shown upfront.
6. **Feedback:** diagnose the misconception or error and offer a retry.
7. **Transfer:** apply the skill in the learner's real goal when appropriate.
8. **Evidence:** record what was actually demonstrated, errors, retries, confidence, and optional actual minutes.
9. **Close:** celebrate the specific capability gained and preview the next step.

This is a reusable *design pattern*, not a requirement to force eight screens into every session. Some 10-minute practice sessions should be just a recall question, focused repetition, and one observable check.

### C. After a session
Update an evidence record with separate dimensions:
- **Exposure:** saw/read/heard the material.
- **Guided success:** succeeded with hints or worked examples.
- **Independent success:** succeeded without a solution.
- **Transfer:** used the skill in a new or authentic context.
- **Retention:** succeeded again after a delay.
- **Confidence:** learner's self-report, not an objective score.
- **Friction:** what blocked progress, if known.
- **Timing:** estimated and actual minutes.

Then choose one of four actions:
- **Advance:** independent evidence is strong and no prerequisite is blocking.
- **Practice:** the learner can do it with support or inconsistently.
- **Reteach:** a specific misconception or prerequisite gap is apparent.
- **Review later:** performance is good now; schedule retrieval after a suitable interval.

### D. Follow-up generation
The next chunk should contain a concise adaptation summary:
- “You demonstrated …”
- “You struggled with …” (only if evidence supports it)
- “We'll briefly review … because …”
- “Next you'll build …”
- “This fits your available time because …”

Avoid restarting from fundamentals merely because a new chunk was generated. Avoid repeating a mastered topic unless the repetition has a stated purpose, such as retrieval, transfer, fluency or a prerequisite for a more complex task.

## 4. Domain-specific activity archetypes

| Domain | Useful session pattern | Evidence beyond a quiz | Common adaptation |
|---|---|---|---|
| Programming / DSA | Recall → worked trace/code → guided modification → independent implementation → tests/complexity explanation | Runnable code, test cases, explanation, debugging behavior | Smaller trace/example after confusion; novel edge case or optimization after success |
| Language | Retrieve vocabulary/grammar → hear/read example → guided response → produce own sentence → short conversation/recall | Correct production, listening comprehension, delayed vocabulary recall, comprehensibility | More contrastive examples and earlier review for recurring errors |
| Guitar / instrument | Tune/warm up → technique demo → slow isolated drill → metronome/backing track → short song section → record/check | Clean notes/chords, tempo, uninterrupted section, listening/recording/teacher feedback | Reduce tempo, isolate transition, shorten phrase, then reintegrate |
| Music theory / production | Listen/identify → demonstrate beat/chord/melody concept → manipulate pattern → create variation → explain choices | Hear/identify accurately; produce a working pattern/song segment | Contrast two examples; give constraints for next composition |
| Math / academic concepts | Recall prerequisite → worked solution → explain reasoning → solve a similar problem → mixed transfer problem | Correct reasoning, not just answer; delayed retrieval | Diagnose exact step or misconception; interleave similar problem types when ready |
| Robotics / hands-on | Safety/setup → demonstrate component → guided build/test → independent change → observe real behavior → debug | Working prototype, sensor readings, test log, ability to explain failure | Isolate one subsystem; test one variable; return to integrated system |
| Design / creative skill | Analyze exemplar → learn one principle → guided critique/remix → create own artifact → compare against criteria | Artifact and rationale, iteration quality, critique evidence | Target one design principle; show contrasting examples and revise |

## 5. Proposed product and engineering priorities

### P0 — Audit the generated learning experience, not only the roadmap JSON
Build a repeatable evaluation set across at least:
- Java / DSA learning and revision,
- language learning,
- guitar / named-song learning,
- machine learning,
- ESP32 / robotics,
- one creative or design goal.

For each, inspect first chunk and continuation. Score goal alignment, prerequisite accuracy, teachability, meaningful independent practice, authentic evidence, time realism, continuation, and unnecessary repetition. Do not rely on one live model sample.

### P1 — Make session steps executable
Introduce an incremental activity representation inside a topic or mission: phase/type, learner-facing instruction, interaction mode, expected response/evidence, hint or support, success criterion, and feedback rule. Start with a small schema and backwards-compatible JSON storage; do not build a huge generic LMS framework.

### P2 — Separate mastery evidence from completion
Keep completion as a workflow fact; mastery should be earned from evidence. Extend the learner model so guided success, independent success, delayed recall, confidence and actual time remain distinct. Do not award the same mastery signal merely for opening or checking off a lesson.

### P3 — Add adaptive review and targeted retries
Schedule review from recent performance and elapsed time. A miss should trigger targeted practice and a retry, not only a lower score and a future roadmap. A strong response should increase challenge or move to transfer rather than repeat the same question.

### P4 — Explain plan changes and support graceful recovery
After missed sessions, time overruns or repeated errors, ask one contextual question only when necessary. Offer an honest smaller plan, reschedule or deadline/scope trade-off; do not silently cram the same workload into less time.

### P5 — Calibrate with real evidence
Capture estimated/actual minutes, retries, correctness and delayed review outcomes. Use minimum sample sizes and conservative updates; report confidence. Run shadow evaluation before allowing new adaptation rules to change live plans.

## 6. Evaluation scorecard for every generated chunk

Rate each item 0–2 (0 = fail, 1 = partial, 2 = strong). Total: 20.

1. **Outcome relevance:** every session advances the actual user goal.
2. **Starting-point fit:** no unsupported assumptions; no unnecessary restart.
3. **Prerequisite order:** each new action depends only on taught or demonstrated skills.
4. **Teachability:** includes enough explanation/demo to make the attempt possible.
5. **Scaffold progression:** supported attempt precedes independent work.
6. **Active retrieval:** appropriate recall or retrieval is included.
7. **Evidence quality:** success criterion is observable and domain-appropriate.
8. **Authentic application:** connects to a real use, artifact, conversation, song, or project where useful.
9. **Time realism:** phases add up and fit availability without pretending the work is smaller.
10. **Continuation/adaptation:** uses recent evidence and has a clear reason for the next step.

**Hard fail regardless of score:** factual error likely to teach the wrong thing; unsafe activity; invented source-specific song details; invalid prerequisite graph; a supposedly independent task that requires untaught knowledge; silently compressed over-budget work; or continuation that restarts despite clear mastery.

Keep the scorecard separate from automated structural validation. A schema-valid chunk can still be a bad lesson.

## 7. Suggested immediate implementation sequence

1. **Run and save a cross-domain first-chunk/continuation audit** using the existing live Ollama smoke harness, adding a human-readable scorecard and time/phase arithmetic checks. Preserve samples and label model/config/date; do not treat one sample as a universal result.
2. **Improve follow-up prompts** so they explicitly distinguish exposure, guided success, independent success, transfer, retention, confidence, friction and timing. Ask the model to select advance/practice/reteach/review and justify the choice from evidence.
3. **Add a compact “why this next” explanation** to generated continuation metadata and show it to the learner.
4. **Make phase-level learner steps executable** in a small vertical slice for one domain first (programming is the easiest initial path because correctness can be tested), then add a second archetype such as guitar.
5. Add regression tests and run the full unit, PostgreSQL integration, E2E, check and build suites after each slice.

## 8. What this report does not claim

- This is a research-informed product audit, not proof that a specific feature will improve retention for Pathwise users.
- Competitor statements describe their public documentation, not their complete proprietary systems.
- Public roadmaps show useful content structures but are not a substitute for domain experts or learner-specific evidence.
- Estimated effort and confidence are still heuristics until calibrated against real outcomes.
- Engagement metrics, streaks, and XP should not be used as proxies for durable learning.

**Bottom line:** Pathwise should become a coach that repeatedly observes, teaches, checks, responds, and revisits—not a generator that keeps producing plausible-looking topic lists.

## Implementation and first live audit (2026-10-22)

The first live cross-domain generation sample is documented separately in **Pathwise Cross Domain Generation Audit 2026-10-22.md**. It covers ML deployment, guitar, beginner Spanish, and ESP32 robotics, and distinguishes chunk duration from remaining time to the goal. The sample also exposed a concrete bug: the intended beginner guitar-song realism floor exists as a helper but is not called by the active generation pipeline. That finding is now recorded in `context.md` as the next fix. Four successful JSON generations are useful evidence that the pipeline runs, but they are not evidence of calibrated estimates or effective learning outcomes.