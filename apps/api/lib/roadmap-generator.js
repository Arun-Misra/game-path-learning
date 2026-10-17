const { validateRoadmap } = require('./roadmap-validation');

class RoadmapGenerationError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const responseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string', maxLength: 100 },
    summary: { type: 'string', maxLength: 500 },
    topics: {
      type: 'array',
      minItems: 2,
      maxItems: 40,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          key: { type: 'string', maxLength: 80 },
          title: { type: 'string', maxLength: 120 },
          description: { type: 'string', maxLength: 450 },
          learningObjectives: { type: 'array', minItems: 2, maxItems: 4, items: { type: 'string', maxLength: 180 } },
          estimatedMinutes: { type: 'integer' },
          timeBreakdown: {
            type: 'object',
            additionalProperties: false,
            properties: {
              conceptMinutes: { type: 'integer', minimum: 0 },
              workedExampleMinutes: { type: 'integer', minimum: 0 },
              guidedPracticeMinutes: { type: 'integer', minimum: 0 },
              independentPracticeMinutes: { type: 'integer', minimum: 0 },
              reviewMinutes: { type: 'integer', minimum: 0 },
            },
            required: ['conceptMinutes', 'workedExampleMinutes', 'guidedPracticeMinutes', 'independentPracticeMinutes', 'reviewMinutes'],
          },
          prerequisiteKeys: { type: 'array', maxItems: 12, items: { type: 'string', maxLength: 80 } },
        },
        required: ['key', 'title', 'description', 'learningObjectives', 'estimatedMinutes', 'prerequisiteKeys'],
      },
    },
  },
  required: ['title', 'summary', 'topics'],
};

const learningBriefSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    outcomeRestatement: { type: 'string' },
    estimatedRemainingMinutes: { type: 'integer', minimum: 30, maximum: 100000 },
    estimateConfidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    capabilities: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          capability: { type: 'string' },
          importance: { type: 'string', enum: ['required', 'supporting'] },
          evidenceOfSuccess: { type: 'string' },
        },
        required: ['capability', 'importance', 'evidenceOfSuccess'],
      },
    },
    prerequisiteKnowledge: { type: 'array', items: { type: 'string' } },
    assumptions: { type: 'array', items: { type: 'string' } },
    finalDeliverable: { type: 'string' },
    outOfScope: { type: 'array', items: { type: 'string' } },
  },
  required: ['outcomeRestatement', 'estimatedRemainingMinutes', 'estimateConfidence', 'capabilities', 'prerequisiteKnowledge', 'assumptions', 'finalDeliverable', 'outOfScope'],
};

const reviewSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    approved: { type: 'boolean' },
    score: { type: 'integer' },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          severity: { type: 'string', enum: ['critical', 'major', 'minor'] },
          code: { type: 'string' },
          explanation: { type: 'string' },
          suggestedFix: { type: 'string' },
          relatedTopicKeys: { type: 'array', items: { type: 'string' } },
        },
        required: ['severity', 'code', 'explanation', 'suggestedFix', 'relatedTopicKeys'],
      },
    },
  },
  required: ['approved', 'score', 'issues'],
};

function buildCumulativePracticeGuidance(goal = {}) {
  const profile = `${goal.title || ''} ${goal.targetOutcome || ''} ${goal.learningMode || ''}`.toLowerCase();
  const base = [
    'CUMULATIVE PRACTICE (MANDATORY): learning is not a sequence of disposable daily lessons. Each new session must deliberately reconnect to relevant earlier skills, then add a manageable new step, then use old and new skills together where possible.',
    'At the start of a session, include a short attempt from memory or a quick performance check before showing the answer. If the learner struggles, give a targeted cue or easier variation, then retry; do not blindly repeat the whole lesson.',
    'Maintain a small rolling practice set: keep recently introduced skills active, rotate older skills back at sensible intervals, and reduce practice time for skills the learner can perform reliably. Do not repeat every old item every day or block all progression until perfection.',
    'For every repeated activity, state what is being retrieved, why it is returning, how the learner should attempt it, and what success looks like. Distinguish deliberate practice from filler repetition.',
  ];
  if (/(guitar|piano|keyboard|drum|violin|instrument|sing|singing|music|song|chord|strumming|rhythm)/.test(profile)) return [...base,
    'MUSIC / INSTRUMENT ROUTINE: begin with a brief warm-up and play previously learned chords, notes, rhythm, or a short section from memory. Keep the most recent material in frequent rotation and bring older material back periodically.',
    'When introducing a new chord or technique, decide how much new material fits the learner’s current fluency and available time. Bring recent skills back into practice, combine old and new material, and move forward when the learner is ready; spend longer on a specific difficulty when useful. Any day-by-day example is illustrative, not a fixed sequence.',
    'Every session should include a musical use: combine the current skills into a short phrase, riff, chord progression, or song section. Use a slower tempo and isolate a difficult transition when needed, then reintegrate it into the phrase. Increase tempo or complexity only when accuracy and rhythm remain stable; do not demand perfection before moving forward.',
    'Track observable evidence such as clean notes/chords, transition accuracy, steady tempo, a section played without stopping, or a short recording. A recognition quiz alone is not evidence of performance.',
  ];
  if (/(language|spanish|french|english|japanese|korean|mandarin|german|italian|vocabulary|conversation|pronunciation|grammar|speaking|listening)/.test(profile)) return [...base,
    'LANGUAGE ROUTINE: start with brief no-notes recall of useful words or phrases from recent sessions. Recycle them in new sentences and a short listening or dialogue task instead of only re-reading a vocabulary list.',
    'Introduce a small amount of new language, model natural usage and pronunciation, then require the learner to produce their own response. Mix older and new vocabulary in a realistic exchange; gradually remove prompts as recall improves.',
    'Bring missed words and constructions back soon, and successful items back after longer gaps. Include listening comprehension and spoken/written production appropriate to the goal; multiple-choice recognition must not be the only activity.',
  ];
  if (/(programming|software|coding|developer|javascript|typescript|python|java|rust|c\+\+|dsa|data structure|algorithm|machine learning|\bml\b|sql|database|api|computer science|networking)/.test(profile)) return [...base,
    'CODING / TECHNICAL ROUTINE: open with a short recall question, trace, command, or tiny change using a concept from an earlier session. Then teach one new concept or technique, demonstrate it, guide a variation, and ask for an independent attempt.',
    'Revisit earlier code or problems through a changed input, edge case, debugging task, or explanation rather than copying the same solution. Mix previously learned problem patterns after the learner has learned how to distinguish them.',
    'For project-based goals, repeatedly run or inspect the existing artifact before adding one small capability. Preserve working functionality, test the new change, and occasionally integrate the whole feature path.',
  ];
  if (/(robot|robotics|esp32|arduino|electronics|hardware|sensor|motor|circuit|embedded)/.test(profile)) return [...base,
    'ROBOTICS / HANDS-ON ROUTINE: begin by rerunning the last known-good component test and recording the expected versus observed result. Add or change one subsystem at a time, then test its integration with the earlier subsystem.',
    'Carry forward a simple test log with setup, observation, failure and fix. If integration fails, isolate the last changed variable and restore the last known-good state before adding more complexity. Check board, power and voltage assumptions before instructing wiring.',
  ];
  return [...base,
    'GENERAL SKILL ROUTINE: revisit one recent skill through a short recall or performance attempt, practise the current target with feedback, and combine it with an earlier skill in a realistic task. Choose the review item based on relevance, elapsed time and evidence rather than repeating everything.',
  ];
}
function buildPrompt(goal, outcomeBrief = '') {
  const weeklyMinutes = goal.minutesPerDay * goal.daysPerWeek;
  const planningDays = Number.isInteger(goal.planningDays) ? Math.max(1, Math.min(28, goal.planningDays)) : 7;
  const practiceDays = Math.ceil(goal.daysPerWeek * planningDays / 7);
  const sessionMinutes = Math.max(5, Math.floor(goal.minutesPerDay));
  const chunkBudgetMinutes = sessionMinutes * practiceDays;
  const target = goal.targetDate
    ? new Date(goal.targetDate).toISOString().slice(0, 10)
    : 'No fixed deadline';
  const hasPriorChunk = Boolean(goal.priorLearningContext && goal.priorLearningContext.trim());

  return [
    'Design only the next small learning chunk. The desired outcome remains the long-term destination, but this chunk covers only the requested period.',
    'Do not design the entire curriculum in this chunk. Estimate remaining effort by considering the unmet capabilities, likely practice, feedback, and integration; account for overlap rather than adding the same practice twice. Avoid arbitrary multipliers and implausibly large placeholder numbers. The estimate is a revisable planning hypothesis, not a promise; use low confidence when evidence is thin, and keep it separate from this small chunk.',
    hasPriorChunk
      ? 'CONTINUATION MODE (MANDATORY): This is a later chunk, not a fresh start. Continue from the previous chunk and the verified learner evidence below. Do not restart with introductions, setup, or beginner concepts already taught. Do not repeat a previous topic or activity unless the evidence shows it was incomplete, misunderstood, or needs deliberate spaced practice. Begin at the next sensible step after the learner\'s demonstrated progress, and explicitly build on prior work.'
      : 'FIRST-CHUNK MODE: This is the learner\'s first chunk. Start from their stated experience level, teach genuinely missing prerequisites, and establish a useful first win.',
    '',
    'LEARNING FROM THE ACTUAL STARTING POINT (MANDATORY):',
    '- Treat the stated experience level and learner clarifications as hard facts, not decorative profile text. “I do not know where to start” means assume no practical ability unless explicitly demonstrated.',
    '- Before proposing an activity, identify the knowledge and actions it assumes. If the learner has not been taught them in this chunk or evidenced them in prior progress, teach the prerequisite first or remove the activity.',
    '- For programming topics, infer the right starting point from the learner\'s stated experience, explicit revision/practice intent, clarifications, and verified prior evidence. Do not assign a fixed difficulty level or assume that a new roadmap means a new learner. If the learner wants revision, build a focused review and diagnostic practice plan around their existing knowledge rather than restarting from fundamentals.',
    '- For Java, teach or review only the syntax and concepts needed for the stated goal and not already demonstrated. A first-run program and explanations of class/main-method structure are appropriate when the learner is new to Java or evidence shows this foundation is missing; they are not mandatory for experienced learners or revision plans.',
    '- Java factual correctness is mandatory: int and boolean are primitive types; String is a reference type. Never describe String as a primitive type. Do not introduce syntax or APIs inaccurately.',
    '- For Java arrays, loops, and other related concepts, choose the sequence and depth from the learner\'s current capability and desired outcome. Avoid combining concepts only when the learner has not yet learned the prerequisites or the available session time makes it unrealistic.',
    '- A topic is not teachable just because it says “execute a provided snippet”. Explain where the snippet goes, how to run it, what each unfamiliar syntax element means, what output to expect, and how to change it safely.',
    '- Choose the teaching approach that fits the learner and skill: demonstration, example, coached attempt, exploration, retrieval, independent practice, feedback, or a combination. Scaffold unfamiliar work, but do not force the same sequence into every session.',
    '- Do not assign debugging before showing how to read the relevant error or what correct syntax looks like. Do not ask learners to write code from scratch before they have seen and modified a complete working example.',
    '- Explicitly distinguish recognition, guided practice, and independent demonstration. Do not claim mastery from reading an explanation or copying code.',
    '',
    ...buildCumulativePracticeGuidance(goal),
    '',
    'INSTRUCTIONAL DESIGN AND SCOPE:',
    '- Plan a useful sequence of sessions for the next planning window. The number of sessions is your instructional decision, not a quota: do not add filler to match the number of days, and do not force one topic per day when a different grouping would help the learner.',
    '- Use the learner’s stated daily availability as the practical time limit. Prefer sessions that fit a study day; split a genuinely larger activity when useful, but do not impose an arbitrary percentage buffer or shrink estimates to fit.',
    '- Estimate the total time for the actual activity. Add an optional timeBreakdown only when it genuinely helps explain the session; do not force every skill into the same five-phase lesson template.',
    '- Never silently compress work to make it fit. If the useful work exceeds the available time, teach fewer concepts and defer the rest to a later chunk.',
    '- Keep the planned work realistic for ' + chunkBudgetMinutes + ' available minutes across ' + practiceDays + ' study days. If the goal needs more work, select the most useful next steps and leave the rest for later rather than pretending the whole goal fits.',
    '- Make each session actionable: say what to try, what support or example is useful, and how the learner can tell whether it worked. Use a full worked example or guided variation when the learner needs it; keep sessions focused and avoid padding them with phases that do not fit the task.',
    '- Adapt depth and difficulty to the learner\'s stated experience, requested mode (learning, revision, practice, or mastery), clarifications, and demonstrated capability. Do not impose a preset beginner/intermediate/advanced sequence.',
    hasPriorChunk
      ? '- Continue from the learner\'s latest evidenced capability. Use completion, progress, and assessment evidence to decide whether to advance, review briefly, or reteach a specific gap. A new chunk is not a reset of the learner\'s skill level.'
      : '- For a first chunk, identify the learner\'s actual starting point from their stated experience and clarifications. Include setup or foundational instruction only when it is needed for this learner and outcome.',
    '- Use previous-chunk evidence to adapt: repeat or simplify only where evidence shows a need; otherwise progress to the next capability. If the goal is revision, prioritize retrieval practice, diagnosis of gaps, and targeted reinforcement rather than automatically teaching topics from scratch.',
    '- Treat evidence types separately: completion means the activity was finished, confidence is self-report, quiz scores cover only tested concepts, and independent performance/artifacts are stronger evidence for practical skills.',
    '- Interpret the most recent assessment attempt in context, not as a universal pass/fail rule. Use the score, the kinds of mistakes, task difficulty, prior evidence, and learner confidence together to decide whether to reinforce, reteach a specific gap, or advance. A high quiz score supports only the concepts it actually tested.',
    '- For language, music, robotics, design, and other hands-on skills, do not infer practical mastery from multiple-choice scores alone. Require domain-appropriate evidence such as production, performance, a working artifact, a recorded result, or a novel independent attempt.',
    '- When prior chunks exist, use up to the four most recent chunks to avoid losing long-term continuity. The immediately previous chunk sets the next step; older chunks help avoid needless restarts and identify useful delayed review.',
    '- Do not invent song-specific chords, tabs, lyrics, or exact strumming patterns. If a named arrangement has not been supplied or verified, clearly ask the learner to provide a tutorial, chord chart, or other trusted reference; use generic technique practice until then.',
    '- Avoid duplicate topics, filler, generic motivation, and unrealistic mastery claims.',
    '- Give every topic 2–4 short assessable learning objectives and a concise actionable description. Each objective must be achievable within this session, not merely describe a long-term aspiration.',
    '- End the chunk with a small checkpoint that tests only what this chunk actually taught; do not force a capstone for the long-term outcome into an introductory chunk.',
    '',
    'DEPENDENCIES:',
    '- prerequisiteKeys must contain only exact keys of other topics in this response. Use [] when no prerequisite is required.',
    '- Never create self-dependencies, duplicate edges, unknown keys, or cycles. Place prerequisites earlier in the array.',
    '- Keys must be unique and contain only letters, numbers, dots, underscores, or hyphens.',
    '',
    'Return valid JSON only matching this schema:',
    JSON.stringify(responseSchema),
    '',
    'LEARNER PROFILE:',
    `Skill/domain: ${goal.title}`,
    `Starting experience: ${goal.experienceLevel}`,
    `Desired outcome: ${goal.targetOutcome}`,
    goal.learnerClarifications ? `CLARIFICATIONS FROM THE LEARNER (preserve these exactly): ${goal.learnerClarifications}` : '',
    `Availability: ${goal.minutesPerDay} minutes/day, ${goal.daysPerWeek} days/week (${weeklyMinutes} minutes/week)`,
    `Target date: ${target}`,
    outcomeBrief ? `ENHANCED LEARNING BRIEF TO HONOUR:\n${outcomeBrief}` : '',
    goal.timeCalibrationContext ? `LEARNER-SPECIFIC TIME CALIBRATION (use as evidence, not as a blind multiplier):\n${goal.timeCalibrationContext}` : '',
    '',
    'Planning horizon: ' + planningDays + ' calendar days, ' + practiceDays + ' practice days; maximum total effort ' + chunkBudgetMinutes + ' minutes.',
    goal.priorLearningContext ? 'PRIOR CHUNKS AND VERIFIED PROGRESS:\n' + goal.priorLearningContext : 'This is the first chunk; begin with the most useful starting activities.',
    'QUALITY GATE BEFORE RETURNING JSON: mentally simulate the plan from the learner’s stated starting point. For every session, check what the learner knows at its start, which new syntax or technique is introduced, whether the worked example teaches it, whether guided practice precedes independent work, and whether the entire session fits its time limit. Remove or defer any activity that depends on untaught knowledge. Check every session duration and the sum independently. Do not expose private reasoning; return only the final corrected plan.',
  ].filter(Boolean).join('\n');
}

function buildReviewPrompt(goal, roadmap, learningBrief = null) {
  const planningDays = Number.isInteger(goal.planningDays) ? Math.max(1, Math.min(28, goal.planningDays)) : 7;
  const practiceDays = Math.ceil(goal.daysPerWeek * planningDays / 7);
  const sessionMinutes = Math.max(5, Math.floor(goal.minutesPerDay));
  const chunkBudgetMinutes = sessionMinutes * practiceDays;
  return [
    'You are an independent, skeptical instructional-design auditor. Judge whether this is genuinely teachable and appropriately challenging for this exact learner, not whether the topic list sounds plausible.',
    'Reject a roadmap if it is vague, generic, repetitive, disconnected from the desired outcome, missing a requested capability, poorly sequenced, or unrealistic for the available time.',
    goal.priorLearningContext
      ? 'CONTINUITY AUDIT (MANDATORY): Continue from the prior chunk and verified learner evidence. Reject an unjustified restart, repeated completed material without a clear diagnostic/revision purpose, ignored unfinished work, or a failure to move toward the next capability. Revisit material when requested for revision or when evidence identifies a gap.'
      : 'STARTING-POINT AUDIT: Check that this is a sensible starting point for the learner\'s stated experience, desired mode (learning, revision, practice, or mastery), and goal.',
    'PREREQUISITE AUDIT: for every session, compare assumed knowledge and actions against the learner\'s stated experience, revision intent, clarifications, earlier sessions, and verified prior-chunk evidence. Flag only prerequisites that are genuinely missing; do not assume all learners are beginners or that every new plan starts at the beginning.',
    'TEACHING AUDIT: explain unfamiliar ideas at the depth the learner needs; use worked examples, guided modification, independent practice, and clear success criteria where appropriate. Do not force introductory explanations for concepts the learner already demonstrates. “Execute a snippet” alone is not sufficient instruction when the learner has not yet shown they can do so independently.',
    'FACTUAL CORRECTNESS AUDIT: verify domain-specific statements and syntax rather than trusting fluent wording. For Java, String is a reference type, not a primitive. Teach how to run a minimal program only when that capability is not already established or the goal requires a refresher.',
    'TIME AUDIT: estimate realistic effort for this learner and the requested activity, including setup, practice, mistakes, and checks where relevant. Keep activities realistic for the learner’s stated availability. Optional phase breakdowns are not mandatory; if work exceeds the available window, narrow the next steps and carry the rest forward.',
    'PROGRESSION AUDIT: each session must prepare the learner for the next or deliberately reinforce a target skill for revision. Do not introduce a task before its actual prerequisites are taught or evidenced. If the horizon is too short, narrow the scope instead of rushing.',
    'CUMULATIVE PRACTICE AUDIT: verify that sessions intentionally retrieve recent prior skills, introduce new material gradually, and integrate old and new skills. For instruments, check that yesterday’s chords/techniques remain in practice when a new one is introduced; for languages, recycle old vocabulary in production; for coding, use changed examples and tests; for hands-on builds, retest known-good components before integration. Reject both zero-review progression and pointless repetition of everything every day.',
    'EVIDENCE AUDIT: completion is not mastery; use the most recent attempt rather than the best historical score. Interpret scores alongside the errors made, task difficulty, confidence and prior evidence; choose targeted practice or progression from the actual gap instead of applying a universal percentage threshold. Practical skills need independent performance or an authentic artifact.',
    'LONGITUDINAL CONTINUITY AUDIT: use the previous chunk to select the immediate next capability and older chunks to avoid restarting or losing important review opportunities. Do not mechanically repeat every old topic; justify review by evidence, spacing, transfer, or a prerequisite need.',
    'Approve when the plan is credible, teachable, aligned with the learner and free of critical problems. Raise only meaningful issues that warrant a change; do not request revisions for stylistic preferences or harmless differences in teaching approach. Be specific and actionable; do not invent requirements not implied by the goal.',
    learningBrief ? `ENHANCED LEARNING BRIEF TO AUDIT AGAINST:\n${JSON.stringify(learningBrief)}` : '',
    goal.priorLearningContext ? `PRIOR CHUNKS AND VERIFIED PROGRESS:\n${goal.priorLearningContext}` : '',
    'AVAILABLE TIME: ' + planningDays + ' calendar days and ' + practiceDays + ' study days, with about ' + chunkBudgetMinutes + ' minutes available in total and ' + sessionMinutes + ' minutes on a typical study day. Use this as a practical constraint, not a reason to force an identical session structure.',
    goal.timeCalibrationContext ? `LEARNER-SPECIFIC TIME CALIBRATION:\n${goal.timeCalibrationContext}` : '',
    'Return JSON only matching this schema:',
    JSON.stringify(reviewSchema),
    '',
    `SKILL: ${goal.title}`,
    `EXPERIENCE: ${goal.experienceLevel}`,
    `DESIRED OUTCOME: ${goal.targetOutcome}`,
    `TIME: ${goal.minutesPerDay} minutes/day × ${goal.daysPerWeek} days/week`,
    `DEADLINE: ${goal.targetDate || 'None'}`,
    `ROADMAP:\n${JSON.stringify(roadmap)}`,
  ].join('\n');
}

function normalizeRoadmapProposal(proposal) {
  if (!proposal || !Array.isArray(proposal.topics)) return proposal;
  const emptyPrerequisiteMarkers = new Set(['', '[]', 'none', 'null', 'no prerequisites']);
  const topicKeys = new Set(proposal.topics.map((topic) => topic?.key).filter((key) => typeof key === 'string'));

  return {
    ...proposal,
    topics: proposal.topics.map((topic) => {
      if (!Array.isArray(topic.prerequisiteKeys)) return topic;
      const markers = topic.prerequisiteKeys
        .map((key) => typeof key === 'string' ? key.trim() : key);
      if (markers.length > 0 && markers.every((key) => typeof key === 'string'
        && emptyPrerequisiteMarkers.has(key.toLowerCase()))) {
        return { ...topic, prerequisiteKeys: [] };
      }
      return {
        ...topic,
        prerequisiteKeys: [...new Set(markers.filter((key) => typeof key === 'string'
          && !emptyPrerequisiteMarkers.has(key.toLowerCase())
          && topicKeys.has(key)
          && key !== topic.key))],
      };
    }),
  };
}

function guardUnverifiedSongDetails(proposal, goal) {
  if (!proposal || !Array.isArray(proposal.topics)) return proposal;
  const profile = String((goal.title || '') + ' ' + (goal.targetOutcome || '')).toLowerCase();
  const isNamedSongGoal = /guitar/.test(profile) && /(song|play|perform|record|arrangement)/.test(profile);
  const learnerMaterial = String((goal.originalDescription || '') + ' ' + (goal.learnerClarifications || ''));
  const hasReference = /(https?:|youtube|tutorial|chord chart|tablature|\\btabs?\\b|provided reference|source link)/i.test(learnerMaterial);
  if (!isNamedSongGoal || hasReference) return proposal;
  let replacedReferenceTask = false;
  const topics = proposal.topics.map((topic) => {
    const text = String((topic.title || '') + ' ' + (topic.description || ''));
    if (!/(song chords?|chord sequence|chord progression|strumming pattern associated with (the )?song|known chord progression|exact chords|song.?specific rhythm)/i.test(text)) return topic;
    if (!replacedReferenceTask) {
      replacedReferenceTask = true;
      return { ...topic, title: 'Find and verify a trusted song reference', description: 'Choose a trusted tutorial or chord chart for the exact arrangement you want to play. Record the chord names and rhythm instructions from that source; do not assume song-specific details before checking the reference.', learningObjectives: ['Choose a trusted reference for the intended arrangement.', 'Record the chord and rhythm information from the reference without guessing.'] };
    }
    return { ...topic, title: 'Practise general chord and rhythm control', description: 'Practise the chord shapes already introduced and maintain a steady, comfortable strumming pulse. Use only chord names and song-specific rhythm instructions confirmed by your chosen reference.', learningObjectives: ['Form the currently assigned chords clearly.', 'Maintain a steady pulse without assuming an unverified song progression.'] };
  });
  return { ...proposal, topics };
}

function applyChunkBudget(roadmap, budgetMinutes) {
  if (!roadmap || !Array.isArray(roadmap.topics) || roadmap.topics.length === 0) return roadmap;
  const budget = Math.max(10, Math.floor(budgetMinutes));
  const topics = roadmap.topics.map((topic) => ({ ...topic, estimatedMinutes: Math.max(5, Math.floor(topic.estimatedMinutes)) }));
  const estimatedTotalMinutes = topics.reduce((sum, topic) => sum + topic.estimatedMinutes, 0);
  return {
    ...roadmap,
    topics,
    estimatedTotalMinutes,
    budgetMinutes: budget,
    fitsBudget: estimatedTotalMinutes <= budget,
  };
}

function normalizeJavaBeginnerContent(roadmap, goal) {
  if (!roadmap || !Array.isArray(roadmap.topics)) return roadmap;
  const profile = `${goal.title || ''} ${goal.targetOutcome || ''}`.toLowerCase();
  if (!/java/.test(profile) || String(goal.experienceLevel || '').toUpperCase() !== 'BEGINNER') return roadmap;
  const incorrectPrimitivePhrase = /primitive(?: data)? types?\s*\(\s*int\s*,\s*boolean\s*,\s*String\s*\)/gi;
  const fix = (value) => typeof value === 'string'
    ? value.replace(incorrectPrimitivePhrase, 'primitive types (int, boolean) and the reference type String')
    : value;
  return {
    ...roadmap,
    title: fix(roadmap.title),
    summary: fix(roadmap.summary),
    topics: roadmap.topics.map((topic) => ({
      ...topic,
      title: fix(topic.title),
      description: fix(topic.description),
      learningObjectives: Array.isArray(topic.learningObjectives) ? topic.learningObjectives.map(fix) : topic.learningObjectives,
    })),
  };
}

function getJavaBeginnerInstructionIssues(roadmap, goal) {
  if (!roadmap || !Array.isArray(roadmap.topics)) return [];
  const profile = `${goal.title || ''} ${goal.targetOutcome || ''}`.toLowerCase();
  if (!/java/.test(profile) || String(goal.experienceLevel || '').toUpperCase() !== 'BEGINNER') return [];
  const issues = [];
  const first = roadmap.topics[0];
  const statedIntent = `${goal.title || ''} ${goal.targetOutcome || ''} ${goal.originalDescription || ''} ${goal.learnerClarifications || ''}`;
  const isRevisionOrPractice = /\b(revis(e|ion)|refresh|brush up|review|practice|interview prep|problem solving)\b/i.test(statedIntent);
  if (!isRevisionOrPractice && !(goal.priorLearningContext && goal.priorLearningContext.trim()) && first && !/(hello.?world|first program|minimal.*program|run a simple java program)/i.test(`${first.title} ${first.description}`)) {
    issues.push({ severity: 'major', code: 'MISSING_FIRST_RUNNABLE_PROGRAM', explanation: 'The first session does not clearly teach a complete first Java program and how to run it.', suggestedFix: 'Start with a minimal Hello World program and explain its structure and execution before variables or DSA concepts.', relatedTopicKeys: first.key ? [first.key] : [] });
  }
  for (const topic of roadmap.topics) {
    if (/\barrays?\b/i.test(`${topic.title} ${topic.description}`) && /\bloops?\b/i.test(`${topic.title} ${topic.description}`)) {
      issues.push({ severity: 'major', code: 'COMBINED_NEW_ARRAYS_AND_LOOPS', explanation: `“${topic.title}” combines arrays and loops in one beginner session.`, suggestedFix: 'Teach basic loop syntax in an earlier session, then use a separate session for array declaration and indexing; defer iteration if time is tight.', relatedTopicKeys: [topic.key] });
    }
    if (/primitive(?: data)? types?\s*\([^)]*\bString\b/i.test(`${topic.title} ${topic.description} ${(topic.learningObjectives || []).join(' ')}`)) {
      issues.push({ severity: 'major', code: 'JAVA_STRING_MISCLASSIFIED', explanation: `“${topic.title}” incorrectly describes String as a primitive type.`, suggestedFix: 'State that int and boolean are primitive types while String is a reference type.', relatedTopicKeys: [topic.key] });
    }
  }
  return issues;
}

function getUnjustifiedRepeatedTopicIssues(roadmap, goal) {
  if (!goal?.priorLearningContext || !roadmap || !Array.isArray(roadmap.topics)) return [];
  let prior;
  try { prior = JSON.parse(goal.priorLearningContext); } catch { return []; }
  const normalize = (value) => String(value || '').normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const evidence = new Map();
  for (const topic of Array.isArray(prior.topics) ? prior.topics : []) {
    const title = normalize(topic.title);
    // The continuation context is ordered newest chunk first. Keep the newest evidence,
    // including a weak retake, so an older high score cannot override current difficulty.
    if (!title || evidence.has(title)) continue;
    const progress = Array.isArray(topic.progress) ? topic.progress : [];
    const assessments = Array.isArray(topic.assessments) ? topic.assessments : [];
    const latestScore = assessments.length && Number.isFinite(Number(assessments[0].score))
      ? Number(assessments[0].score) : null;
    const completed = progress.some((item) => ['COMPLETED', 'MASTERED'].includes(String(item.status || '').toUpperCase()));
    const demonstrated = latestScore !== null ? latestScore >= 85
      : progress.some((item) => String(item.status || '').toUpperCase() === 'MASTERED'
        || (String(item.status || '').toUpperCase() === 'COMPLETED' && Number(item.masteryScore) >= 85));
    evidence.set(title, { completed, demonstrated });
  }
  const purposefulReview = /\b(review|retrieval|diagnostic|revision|revise|reinforce|reinforcement|refresh|spaced practice|practice gap)\b/i;
  return roadmap.topics.flatMap((topic) => {
    const priorTopic = evidence.get(normalize(topic.title));
    if (!priorTopic?.completed || !priorTopic?.demonstrated || purposefulReview.test([topic.title, topic.description, ...(topic.learningObjectives || [])].join(' '))) return [];
    return [{
      severity: 'major',
      code: 'UNJUSTIFIED_COMPLETED_TOPIC_REPEAT',
      explanation: `“${topic.title}” repeats a previously completed topic with demonstrated mastery and no explicit review purpose.`,
      suggestedFix: 'Move to the next unmastered capability, or make this an explicitly purposeful diagnostic, retrieval, or revision session only when it serves the learner goal.',
      relatedTopicKeys: topic.key ? [topic.key] : [],
    }];
  });
}

function getOverlongSessions(roadmap, maxSessionMinutes) {
  if (!roadmap || !Array.isArray(roadmap.topics)) return [];
  return roadmap.topics.filter((topic) => topic.estimatedMinutes > maxSessionMinutes);
}

function getTimeBreakdownIssues(roadmap) {
  if (!roadmap || !Array.isArray(roadmap.topics)) return [];
  return roadmap.topics.flatMap((topic) => {
    const breakdown = topic.timeBreakdown;
    const phases = ['conceptMinutes', 'workedExampleMinutes', 'guidedPracticeMinutes', 'independentPracticeMinutes', 'reviewMinutes'];
    if (!breakdown || typeof breakdown !== 'object'
      || phases.some((phase) => !Number.isInteger(breakdown[phase]) || breakdown[phase] < 0)) {
      return [{ severity: 'major', code: 'TIME_BREAKDOWN_INVALID', explanation: `“${topic.title}” is missing a valid nonnegative integer time breakdown for all five phases.`, suggestedFix: 'Provide integer minutes for every phase and make estimatedMinutes equal their sum.', relatedTopicKeys: topic.key ? [topic.key] : [] }];
    }
    const total = phases.reduce((sum, phase) => sum + breakdown[phase], 0);
    const positivePhases = phases.filter((phase) => breakdown[phase] > 0).length;
    if (total !== topic.estimatedMinutes || positivePhases < 3 || topic.estimatedMinutes < 5) {
      return [{ severity: 'major', code: 'TIME_BREAKDOWN_INVALID', explanation: `“${topic.title}” has a time breakdown that does not match its estimate or has too few meaningful phases.`, suggestedFix: 'Make the five phase values sum exactly to estimatedMinutes, keep at least three phases positive, and use at least five minutes total.', relatedTopicKeys: topic.key ? [topic.key] : [] }];
    }
    return [];
  });
}

function isLocalOllama(baseUrl) {
  try {
    const url = new URL(baseUrl);
    return ['localhost', '127.0.0.1', '::1'].includes(url.hostname)
      && url.port === '11434';
  } catch {
    return false;
  }
}

function parseStructuredContent(payload, description) {
  const content = payload.choices?.[0]?.message?.content ?? payload.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new RoadmapGenerationError(502, 'ROADMAP_PROVIDER_INVALID_RESPONSE', `The AI provider returned no ${description}.`);
  }
  try {
    return JSON.parse(content);
  } catch (error) {
    if (process.env.AI_DEBUG === 'true') {
      console.error(`[roadmap-generator] Invalid JSON for ${description}; chars=${content.length}; finish_reason=${payload.choices?.[0]?.finish_reason || 'unknown'}; usage=${JSON.stringify(payload.usage || {})}; messageKeys=${JSON.stringify(Object.keys(payload.choices?.[0]?.message || {}))}; tail=${content.slice(-700)}`);
    }
    throw new RoadmapGenerationError(502, 'ROADMAP_PROVIDER_INVALID_RESPONSE', `The AI provider returned invalid JSON for the ${description}.`);
  }
}

async function requestStructured({ endpoint, headers, model, schemaName, schema, messages, fetchImpl, retryInvalidJson = true, reasoningEffortOverride = null }) {
  const requestStartedAt = Date.now();
  if (process.env.AI_DEBUG === 'true') console.log(`[roadmap-generator] ${schemaName} request started`);
  let response;
  const localOllama = isLocalOllama(endpoint);
  const contextLength = Number.parseInt(process.env.AI_CONTEXT_LENGTH || '16384', 10);
  const reasoningEffort = reasoningEffortOverride !== null ? reasoningEffortOverride : (process.env.AI_REASONING_EFFORT || 'low');
  const outputTokens = schemaName === 'personalised_learning_roadmap' ? 4096 : 2048;
  const requestBody = localOllama
    ? {
      model,
      messages,
      format: schema,
      think: reasoningEffort,
      options: { num_ctx: Number.isFinite(contextLength) ? Math.max(4096, Math.min(32768, contextLength)) : 16384, num_predict: outputTokens, temperature: 0.2 },
      stream: false,
    }
    : {
      model,
      messages,
      max_tokens: outputTokens,
      temperature: 0.2,
      reasoning_effort: reasoningEffort,
      response_format: { type: 'json_schema', json_schema: { name: schemaName, strict: true, schema } },
      stream: false,
    };
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(240000),
      body: JSON.stringify(requestBody),
    });
  } catch (error) {
    if (process.env.AI_DEBUG === 'true') console.error(`[roadmap-generator] ${schemaName} request failed after ${Date.now() - requestStartedAt}ms: ${error.name || 'Error'} ${error.message || ''}`);
    throw new RoadmapGenerationError(
      502,
      'ROADMAP_PROVIDER_UNAVAILABLE',
      'The AI provider could not be reached. Make sure Ollama is running and the selected models are installed.',
    );
  }

  if (process.env.AI_DEBUG === 'true') console.log(`[roadmap-generator] ${schemaName} HTTP ${response.status} after ${Date.now() - requestStartedAt}ms`);
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new RoadmapGenerationError(503, 'ROADMAP_PROVIDER_CONFIGURATION', 'The AI provider rejected its API key or permissions. Check AI_API_KEY and provider access.');
    }
    if (response.status === 429) {
      throw new RoadmapGenerationError(503, 'ROADMAP_PROVIDER_RATE_LIMITED', 'The AI provider is rate-limited. Please try again shortly.');
    }
    throw new RoadmapGenerationError(
      502,
      'ROADMAP_PROVIDER_ERROR',
      `The AI provider returned an error while using model “${model}”. Check the model name and structured-output support.`,
    );
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new RoadmapGenerationError(502, 'ROADMAP_PROVIDER_INVALID_RESPONSE', 'The AI provider returned an unreadable response.');
  }
  const description = schemaName === 'roadmap_review'
    ? 'roadmap review'
    : schemaName === 'enhanced_learning_brief'
      ? 'enhanced learning brief'
      : 'roadmap';
  try {
    const parsed = parseStructuredContent(payload, description);
    if (process.env.AI_DEBUG === 'true') console.log(`[roadmap-generator] ${schemaName} parsed in ${Date.now() - requestStartedAt}ms; finish=${payload.choices?.[0]?.finish_reason || 'unknown'}; prompt=${payload.prompt_eval_count ?? payload.usage?.prompt_tokens ?? 'n/a'}; output=${payload.eval_count ?? payload.usage?.completion_tokens ?? 'n/a'}`);
    return parsed;
  } catch (error) {
    if (process.env.AI_DEBUG === 'true') {
      console.error('[roadmap-generator] Structured response parsing failed:', JSON.stringify({ schemaName, code: error.code || 'UNKNOWN', message: error.message }));
    }
    if (localOllama && error.code === 'ROADMAP_PROVIDER_INVALID_RESPONSE' && (error.message.startsWith('The AI provider returned no ') || !retryInvalidJson)) {
      const fallbackEffort = ['high', 'medium'].includes(reasoningEffort) ? 'low' : reasoningEffort === 'low' ? false : null;
      if (fallbackEffort !== null) {
        if (process.env.AI_DEBUG === 'true') console.warn(`[roadmap-generator] ${schemaName} returned no usable JSON with think=${reasoningEffort}; retrying with think=${fallbackEffort}`);
        return requestStructured({
          endpoint, headers, model, schemaName, schema, messages, fetchImpl,
          retryInvalidJson,
          reasoningEffortOverride: fallbackEffort,
        });
      }
    }
    if (retryInvalidJson && error.code === 'ROADMAP_PROVIDER_INVALID_RESPONSE') {
      return requestStructured({
        endpoint, headers, model, schemaName, schema,
        messages: [
          ...messages,
          {
            role: 'system',
            content: 'Your previous response was not valid parseable JSON. Start over and return one complete JSON object matching the required schema exactly. Do not use markdown, comments, trailing commas, or text outside the JSON. Keep every required field and finish the object completely.',
          },
        ],
        fetchImpl,
        retryInvalidJson: false,
        reasoningEffortOverride,
      });
    }
    throw error;
  }
}

function validateReview(review) {
  return review
    && typeof review.approved === 'boolean'
    && Number.isInteger(review.score)
    && review.score >= 0
    && review.score <= 100
    && Array.isArray(review.issues)
    && review.issues.every((issue) => issue
      && ['critical', 'major', 'minor'].includes(issue.severity)
      && typeof issue.code === 'string'
      && typeof issue.explanation === 'string'
      && typeof issue.suggestedFix === 'string'
      && Array.isArray(issue.relatedTopicKeys));
}

const clarificationQuestionsSchema = {
  type: 'object', additionalProperties: false,
  properties: { questions: { type: 'array', maxItems: 4, items: { type: 'object', additionalProperties: false, properties: { key: { type: 'string' }, question: { type: 'string' }, reason: { type: 'string' }, options: { type: 'array', minItems: 2, maxItems: 5, items: { type: 'string' } } }, required: ['key', 'question', 'reason', 'options'] } } },
  required: ['questions'],
};

function getProviderEndpoint(baseUrl) {
  if (isLocalOllama(baseUrl)) return new URL(baseUrl).origin + '/api/chat';
  return baseUrl.replace(/\/+$/, '') + '/chat/completions';
}

async function generateClarifyingQuestions(goal, { apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY || '', baseUrl = process.env.AI_BASE_URL || process.env.OPENAI_BASE_URL || 'http://127.0.0.1:11434/v1', model = process.env.AI_MODEL || process.env.OPENAI_MODEL || 'gemma4:e4b', fetchImpl = globalThis.fetch } = {}) {
  const endpoint = getProviderEndpoint(baseUrl);
  if (!apiKey && !isLocalOllama(baseUrl)) throw new RoadmapGenerationError(503, 'ROADMAP_GENERATOR_NOT_CONFIGURED', 'No AI API key is configured.');
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = 'Bearer ' + apiKey;
  const result = await requestStructured({ endpoint, headers, model, schemaName: 'learning_clarification_questions', schema: clarificationQuestionsSchema, fetchImpl, messages: [
    { role: 'system', content: 'You are an adaptive learning coach. Ask at most four high-impact questions that materially change the first short learning chunk. Do not ask questions already answered by the goal. Return an empty list if the goal is sufficiently clear. Each question must have 2–5 concise answer options. Ask about skill-specific uncertainties such as starting ability, desired difficulty, preferred format, tools or arrangement only when relevant. For a named song or other source-dependent outcome, ask which trusted tutorial, chart, file, or reference the learner wants to follow if the exact material is not already provided. Return JSON only.' },
    { role: 'user', content: 'Skill: ' + goal.title + '\\nOutcome: ' + goal.targetOutcome + '\\nExperience: ' + goal.experienceLevel + '\\nAvailability: ' + goal.minutesPerDay + ' minutes/day, ' + goal.daysPerWeek + ' days/week\\nOriginal description: ' + (goal.originalDescription || '') + '\\nAsk only questions whose answers would materially change the plan.' },
  ] });
  const seen = new Set();
  const questions = (Array.isArray(result.questions) ? result.questions : []).filter((item) => {
    if (!item || typeof item.key !== 'string' || !/^[a-zA-Z0-9._-]{1,60}$/.test(item.key) || seen.has(item.key) || typeof item.question !== 'string' || !item.question.trim() || !Array.isArray(item.options) || item.options.length < 2) return false;
    seen.add(item.key); return true;
  }).slice(0, 4);
  return { questions };
}

async function generateRoadmap(goal, {
  apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY || '',
  baseUrl = process.env.AI_BASE_URL || process.env.OPENAI_BASE_URL || 'http://127.0.0.1:11434/v1',
  model = process.env.AI_MODEL || process.env.OPENAI_MODEL || 'gemma4:e4b',
  fetchImpl = globalThis.fetch,
} = {}) {
  const endpoint = getProviderEndpoint(baseUrl);
  const planningDays = Number.isInteger(goal.planningDays) ? Math.max(1, Math.min(28, goal.planningDays)) : 3;
  const practiceDays = Math.ceil(goal.daysPerWeek * planningDays / 7);
  const sessionMinutes = Math.max(5, Math.floor(goal.minutesPerDay));
  const chunkBudgetMinutes = sessionMinutes * practiceDays;
  const chunkRoadmapSchema = responseSchema;
  if (!apiKey && !isLocalOllama(baseUrl)) {
    throw new RoadmapGenerationError(
      503,
      'ROADMAP_GENERATOR_NOT_CONFIGURED',
      'No AI API key is configured. Set AI_API_KEY for a hosted provider, or run Ollama locally and set AI_BASE_URL and AI_MODEL in the API environment.',
    );
  }

  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  // Stage 1: Use the same configured model throughout so Ollama does not have to load/swap separate planner and reviewer models.
  const learningBrief = await requestStructured({
    endpoint, headers, model, schemaName: 'enhanced_learning_brief', schema: learningBriefSchema, fetchImpl,
    messages: [
      {
        role: 'system',
        content: 'You are a learning-request enhancement specialist. Preserve the learner’s original intent and scope while making the request precise enough for a roadmap architect. Convert it into a structured brief with measurable success evidence, genuinely required capabilities, prerequisites, assumptions, and a final deliverable. Estimate the remaining total effort in minutes, including practice, debugging, review, and integration; include a confidence level and use a conservative estimate. Do not invent preferences, technologies, or commitments. State unresolved choices as assumptions and keep choices open where possible. Explicit learner clarifications override any inference or prior assumption; remove or update assumptions that the learner has clarified. When prior chunk evidence is supplied, estimate only remaining work from current evidence, not completed mastered material; use prior estimate, completed/incomplete activities, assessments, and actual time evidence to adjust it. Return only the structured brief JSON.',
      },
      {
        role: 'user',
        content: [
          'Enhance and clarify this learning request before any roadmap is written. Preserve its intent; do not add requirements that the learner did not ask for. Estimate the total remaining minutes to reach the goal and state confidence as low, medium, or high. If the learner has prior chunks, estimate only the remaining effort from evidence.',
          `Skill/domain: ${goal.title}`,
          `Current experience: ${goal.experienceLevel}`,
          `Desired outcome: ${goal.targetOutcome}`,
          goal.learnerClarifications ? `Learner clarification (takes precedence over inferred assumptions): ${goal.learnerClarifications}` : '',
          `Availability: ${goal.minutesPerDay} minutes/day, ${goal.daysPerWeek} days/week`,
          `Target date: ${goal.targetDate || 'None'}`,
          goal.timeCalibrationContext ? `ACTUAL VERSUS ESTIMATED TIME EVIDENCE:\n${goal.timeCalibrationContext}` : '',
          goal.priorLearningContext ? `PREVIOUS CHUNK AND VERIFIED LEARNER PROGRESS (preserve continuity; do not restart):\n${goal.priorLearningContext}` : 'This is the first chunk; no prior learning evidence exists yet.',
          'Break a multi-part outcome into distinct required capabilities. Describe observable evidence of success for each. List only prerequisites genuinely needed. If a tool/framework is unspecified, keep it open or state it as an assumption rather than treating it as a user requirement.',
          'Return JSON only matching this schema:',
          JSON.stringify(learningBriefSchema),
        ].join('\n'),
      },
    ],
  });

  const boundedGoal = { ...goal, planningDays, chunkBudgetMinutes, sessionMinutes };
  const draft = await requestStructured({
    endpoint, headers, model, schemaName: 'personalised_learning_roadmap', schema: chunkRoadmapSchema, fetchImpl,
    messages: [
      {
        role: 'system',
        content: 'You are a learning-path architect. Return compact, complete JSON only. Translate the exact outcome into concrete steps; keep descriptions concise, give 2–4 short measurable objectives per topic, and avoid long explanations, markdown, and repeated wording. Finish every required field before adding detail.',
      },
      { role: 'user', content: buildPrompt(boundedGoal, JSON.stringify(learningBrief)) },
    ],
  });

  // Phase breakdowns are optional guidance, not a hard gate on otherwise teachable plans.
  const firstValidation = validateRoadmap(normalizeJavaBeginnerContent(guardUnverifiedSongDetails(normalizeRoadmapProposal(draft), boundedGoal), boundedGoal));
  if (!firstValidation.success) {
    if (process.env.AI_DEBUG === 'true') console.error('[roadmap-generator] Draft structural validation failed:', JSON.stringify(firstValidation.errors));
    throw new RoadmapGenerationError(502, 'ROADMAP_PROVIDER_INVALID_ROADMAP', 'The generated roadmap failed structural validation. Please try again.');
  }
  let roadmap = firstValidation.data;

  // The same configured model audits its plan against the learner's exact outcome and enhanced brief.
  const review = await requestStructured({
    endpoint, headers, model, schemaName: 'roadmap_review', schema: reviewSchema, fetchImpl,
    messages: [
      {
        role: 'system',
        content: 'Audit learning roadmaps rigorously. Be skeptical of vague, generic, repetitive, or outcome-mismatched plans. Approve only if the learner can see a credible step-by-step path to the exact requested result. Return only the review JSON.',
      },
      { role: 'user', content: buildReviewPrompt(boundedGoal, roadmap, learningBrief) },
    ],
  });

  if (!validateReview(review)) {
    throw new RoadmapGenerationError(502, 'ROADMAP_REVIEW_INVALID', 'The roadmap reviewer returned an invalid review. Please try generating it again.');
  }
  if (process.env.AI_DEBUG === 'true') console.log('[roadmap-generator] Review result:', JSON.stringify({ approved: review.approved, score: review.score, issueCodes: review.issues.map((issue) => issue.code), issueSeverities: review.issues.map((issue) => issue.severity) }));

  const overlongBeforeRevision = getOverlongSessions(roadmap, sessionMinutes);
  const sessionBudgetIssues = overlongBeforeRevision.map((topic) => ({ severity: 'major', code: 'SESSION_OVER_BUDGET', explanation: `“${topic.title}” is estimated at ${topic.estimatedMinutes} minutes, exceeding the ${sessionMinutes}-minute planned session limit, which reserves buffer within the learner’s ${goal.minutesPerDay}-minute availability.`, suggestedFix: 'Narrow this session to one teachable objective, defer remaining work to a later chunk, and keep its estimate within the daily limit.', relatedTopicKeys: [topic.key] }));
  const instructionalIssues = getJavaBeginnerInstructionIssues(roadmap, goal);
  const initialTotalMinutes = roadmap.topics.reduce((sum, topic) => sum + topic.estimatedMinutes, 0);
  const totalBudgetIssues = initialTotalMinutes > chunkBudgetMinutes
    ? [{ severity: 'major', code: 'CHUNK_OVER_BUDGET', explanation: `The proposed chunk needs ${initialTotalMinutes} minutes, exceeding the available ${chunkBudgetMinutes}-minute chunk budget.`, suggestedFix: 'Reduce the scope or split work into later chunks; do not shrink estimates without reducing the activities.', relatedTopicKeys: roadmap.topics.map((topic) => topic.key) }]
    : [];
  const continuityIssues = getUnjustifiedRepeatedTopicIssues(roadmap, boundedGoal);
  const requiredFixes = [...sessionBudgetIssues, ...instructionalIssues, ...totalBudgetIssues, ...continuityIssues];
  const reviewForRevision = requiredFixes.length
    ? { ...review, approved: false, score: Math.min(review.score, 79), issues: [...review.issues, ...requiredFixes] }
    : review;

  if (!reviewForRevision.approved || reviewForRevision.issues.some((issue) => issue.severity === 'critical' || issue.severity === 'major')) {
    let revision = await requestStructured({
      endpoint, headers, model, schemaName: 'personalised_learning_roadmap', schema: chunkRoadmapSchema, fetchImpl,
      messages: [
        {
          role: 'system',
          content: 'Revise the roadmap to fix every critical and major issue while preserving the exact outcome. Return compact, complete JSON only. Keep descriptions concise, provide 2–4 short measurable objectives per topic, avoid repeated wording, and finish every required field. Do not add unrelated material.',
        },
        {
          role: 'user',
          content: [
            buildPrompt(boundedGoal, JSON.stringify(learningBrief)),
            '',
            `INITIAL ROADMAP:\n${JSON.stringify(roadmap)}`,
            '',
            `INDEPENDENT REVIEW AND REQUIRED FIXES:\n${JSON.stringify(reviewForRevision)}`,
            '',
            'Revise the roadmap itself, not just its wording. Return a complete replacement roadmap.',
          ].join('\n'),
        },
      ],
    });
    let candidate = revision;
    let accepted = false;
    let lastIssues = [];
    for (let repairAttempt = 0; repairAttempt < 2; repairAttempt += 1) {
      const timeIssues = []; // Optional phase estimates must not force an otherwise good plan through repair.
      const candidateValidation = validateRoadmap(normalizeJavaBeginnerContent(guardUnverifiedSongDetails(normalizeRoadmapProposal(candidate), boundedGoal), boundedGoal));
      const candidateRoadmap = candidateValidation.success ? candidateValidation.data : null;
      const totalMinutes = candidateRoadmap
        ? candidateRoadmap.topics.reduce((sum, topic) => sum + topic.estimatedMinutes, 0)
        : 0;
      const overlong = candidateRoadmap ? getOverlongSessions(candidateRoadmap, sessionMinutes) : [];
      const continuity = candidateRoadmap ? getUnjustifiedRepeatedTopicIssues(candidateRoadmap, boundedGoal) : [];
      const instructional = candidateRoadmap ? getJavaBeginnerInstructionIssues(candidateRoadmap, goal) : [];
      lastIssues = [
        ...timeIssues,
        ...(!candidateValidation.success ? candidateValidation.errors.map((issue) => ({ severity: 'major', code: 'STRUCTURAL_VALIDATION', explanation: issue.message || 'The roadmap structure is invalid.', suggestedFix: 'Return a complete roadmap matching the schema.', relatedTopicKeys: [] })) : []),
        ...(candidateRoadmap && totalMinutes > chunkBudgetMinutes ? [{ severity: 'major', code: 'CHUNK_OVER_BUDGET', explanation: `The chunk needs ${totalMinutes} minutes, exceeding the ${chunkBudgetMinutes}-minute budget.`, suggestedFix: 'Narrow the activities and reduce their scope; do not understate time.', relatedTopicKeys: candidateRoadmap.topics.map((topic) => topic.key) }] : []),
        ...overlong.map((topic) => ({ severity: 'major', code: 'SESSION_OVER_BUDGET', explanation: `“${topic.title}” needs ${topic.estimatedMinutes} minutes, above the ${sessionMinutes}-minute session cap.`, suggestedFix: 'Narrow this session to one achievable objective and defer remaining work to a later chunk.', relatedTopicKeys: [topic.key] })),
        ...continuity,
        ...instructional,
      ];

      if (process.env.AI_DEBUG === 'true') console.log(`[roadmap-generator] Repair attempt ${repairAttempt + 1} validation:`, JSON.stringify({ structurallyValid: candidateValidation.success, issueCodes: lastIssues.map((issue) => issue.code), issueCount: lastIssues.length, totalMinutes, chunkBudgetMinutes, sessionMinutes }));
      if (candidateValidation.success && lastIssues.length === 0) {
        roadmap = candidateRoadmap;
        accepted = true;
        break;
      }
      if (repairAttempt === 1) break;

      candidate = await requestStructured({
        endpoint, headers, model, schemaName: 'personalised_learning_roadmap', schema: chunkRoadmapSchema, fetchImpl,
        messages: [
          {
            role: 'system',
            content: `Repair the roadmap to satisfy every deterministic constraint. Return compact, complete JSON only. Every topic must fit within ${sessionMinutes} minutes; the sum of all topics must not exceed ${chunkBudgetMinutes} minutes. Each estimatedMinutes must equal the sum of five nonnegative integer timeBreakdown fields, with at least three positive phases. Keep the exact topic count, preserve valid prerequisites, and narrow activities instead of understating time.`,
          },
          {
            role: 'user',
            content: [
              buildPrompt(boundedGoal, JSON.stringify(learningBrief)),
              '',
              `ROADMAP TO REPAIR:\n${JSON.stringify(candidate)}`,
              '',
              `REMAINING VALIDATION ISSUES:\n${JSON.stringify(lastIssues)}`,
              '',
              'Return a complete replacement roadmap that fixes these issues, not an explanation.',
            ].join('\n'),
          },
        ],
      });
    }

    if (!accepted) {
      if (process.env.AI_DEBUG === 'true') console.error('[roadmap-generator] Final roadmap repair failed:', JSON.stringify(lastIssues));
      const codes = new Set(lastIssues.map((issue) => issue.code));
      if (codes.has('TIME_BREAKDOWN_INVALID')) {
        throw new RoadmapGenerationError(502, 'ROADMAP_TIME_ESTIMATE_INVALID', 'The AI could not produce a reliable phase-by-phase time estimate. Try a shorter chunk or generate it again.');
      }
      if (codes.has('CHUNK_OVER_BUDGET')) {
        throw new RoadmapGenerationError(502, 'ROADMAP_CHUNK_OVER_BUDGET', 'The AI could not fit the revised learning chunk into your available time without underestimating the work. Try a shorter planning horizon or generate the chunk again.');
      }
      if (codes.has('UNJUSTIFIED_COMPLETED_TOPIC_REPEAT')) {
        throw new RoadmapGenerationError(502, 'ROADMAP_CONTINUITY_FAILED', 'The revised roadmap still repeats mastered topics without a clear learning purpose. Please generate the next chunk again.');
      }
      if (codes.has('MISSING_FIRST_RUNNABLE_PROGRAM') || codes.has('COMBINED_NEW_ARRAYS_AND_LOOPS') || codes.has('JAVA_STRING_MISCLASSIFIED')) {
        throw new RoadmapGenerationError(502, 'ROADMAP_INSTRUCTIONAL_QUALITY_FAILED', 'The AI could not produce a realistic beginner sequence after revision. Try a shorter planning horizon or generate the chunk again.');
      }
      if (codes.has('SESSION_OVER_BUDGET')) {
        throw new RoadmapGenerationError(502, 'ROADMAP_SESSION_OVER_BUDGET', 'The AI could not fit every learning session into the planned time limit while preserving a buffer. Try a shorter planning horizon or generate the chunk again.');
      }
      throw new RoadmapGenerationError(502, 'ROADMAP_REVISION_INVALID', 'The revised roadmap failed structural validation. Please try again.');
    }
  }

  const result = {
    ...roadmap,
    estimatedRemainingMinutes: Number.isFinite(Number(learningBrief.estimatedRemainingMinutes)) ? Number(learningBrief.estimatedRemainingMinutes) : learningBrief.estimatedRemainingMinutes,
    estimateConfidence: learningBrief.estimateConfidence,
    learningBrief: {
      ...learningBrief,
      ...(goal.learnerClarifications ? { learnerClarifications: goal.learnerClarifications } : {}),
    },
  };
  return {
    ...result,
    learningBrief: {
      ...result.learningBrief,
      estimatedRemainingMinutes: result.estimatedRemainingMinutes ?? result.learningBrief?.estimatedRemainingMinutes,
      estimateConfidence: result.estimateConfidence ?? result.learningBrief?.estimateConfidence,
    },
  };
}

module.exports = {
  RoadmapGenerationError,
  buildPrompt,
  buildCumulativePracticeGuidance,
  getProviderEndpoint,
  generateClarifyingQuestions,
  buildReviewPrompt,
  applyChunkBudget,
  getOverlongSessions,
  getTimeBreakdownIssues,
  getJavaBeginnerInstructionIssues,
  getUnjustifiedRepeatedTopicIssues,
  normalizeJavaBeginnerContent,
  guardUnverifiedSongDetails,
  generateRoadmap,
  isLocalOllama,
  normalizeRoadmapProposal,
  validateReview,
};