































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
    title: { type: 'string' },
    summary: { type: 'string' },
    topics: {
      type: 'array',
      minItems: 2,
      maxItems: 40,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          key: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          learningObjectives: { type: 'array', items: { type: 'string' } },
          estimatedMinutes: { type: 'integer' },
          prerequisiteKeys: { type: 'array', items: { type: 'string' } },
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
  required: ['outcomeRestatement', 'capabilities', 'prerequisiteKnowledge', 'assumptions', 'finalDeliverable', 'outOfScope'],
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

function buildPrompt(goal, outcomeBrief = '') {
  const weeklyMinutes = goal.minutesPerDay * goal.daysPerWeek;
  const planningDays = Number.isInteger(goal.planningDays) ? Math.max(1, Math.min(28, goal.planningDays)) : 7;
  const practiceDays = Math.ceil(goal.daysPerWeek * planningDays / 7);
  const chunkBudgetMinutes = goal.minutesPerDay * practiceDays;
  const sessionCount = Math.max(2, practiceDays);
  const sessionMinutes = goal.minutesPerDay;
  const target = goal.targetDate
    ? new Date(goal.targetDate).toISOString().slice(0, 10)
    : 'No fixed deadline';

  return [
    'Design only the next small learning chunk. The desired outcome remains the long-term destination, but this chunk covers only the requested period.',
    'Do not design the entire curriculum or estimate all work needed to reach the final outcome. Later chunks must use observed progress to decide what comes next.',
    '',
    'LEARNING FROM THE ACTUAL STARTING POINT (MANDATORY):',
    '- Treat the stated experience level and learner clarifications as hard facts, not decorative profile text. “I do not know where to start” means assume no practical ability unless explicitly demonstrated.',
    '- Before proposing an activity, identify the knowledge and actions it assumes. If the learner has not been taught them in this chunk or evidenced them in prior progress, teach the prerequisite first or remove the activity.',
    '- For programming beginners, do not assume they know where code is written, how to create/run a program, program structure, syntax, compiler/runtime errors, variables, loops, or methods merely because the goal mentions DSA.',
    '- For Java beginners, the first coding session must show a complete minimal Hello World program and explain the class declaration, main method, braces, semicolons, System.out.println, and how to run it. Teach variables after the learner can run and modify this program; teach conditionals and loops only after their required syntax is introduced.',
    '- Java factual correctness is mandatory: int and boolean are primitive types; String is a reference type. Never describe String as a primitive type. Do not introduce syntax or APIs inaccurately.',
    '- For a 5-session beginner Java chunk, prefer this progression: first runnable Hello World program; variables and types; operators plus introductory conditional/loop syntax; arrays declaration and indexing in a separate session; basic Strings in a separate session. Do not combine learning loops and arrays for the first time in one 30-minute session. If setup takes the full first session, defer later concepts rather than rush them.',
    '- A topic is not teachable just because it says “execute a provided snippet”. Explain where the snippet goes, how to run it, what each unfamiliar syntax element means, what output to expect, and how to change it safely.',
    '- Sequence from a worked example, to a partially completed example with guidance, to a small independent attempt. Independent work must use only concepts already introduced.',
    '- Do not assign debugging before showing how to read the relevant error or what correct syntax looks like. Do not ask learners to write code from scratch before they have seen and modified a complete working example.',
    '- Explicitly distinguish recognition, guided practice, and independent demonstration. Do not claim mastery from reading an explanation or copying code.',
    '',
    'INSTRUCTIONAL DESIGN AND SCOPE:',
    '- Plan the chunk as a sequence of individual practice sessions. Each topic is one session, not a bundle of several days. Produce exactly ' + sessionCount + ' topics/sessions for this chunk; do not collapse a multi-day chunk into one topic. If a single day must contain two tiny sessions to satisfy the minimum plan structure, keep their combined time within that day’s total budget.',
    '- No topic may exceed ' + sessionMinutes + ' minutes. Estimate explanation, demonstration, guided practice, independent attempt, and a quick understanding check together; leave room for a beginner to think and make mistakes.',
    '- Never silently compress work to make it fit. If the useful work exceeds the available time, teach fewer concepts and defer the rest to a later chunk.',
    '- The total effort must fit within ' + chunkBudgetMinutes + ' minutes across ' + practiceDays + ' practice sessions. Prefer one coherent objective per session over a list of disconnected topics.',
    '- For each topic, describe a concrete teaching sequence: (1) explain the idea and unfamiliar syntax, (2) walk through a complete worked example, (3) guide the learner through a small variation, (4) ask for a tiny independent task, and (5) state how success will be checked. Adapt these steps to non-programming skills where appropriate.',
    '- Introduce only the prerequisites needed for the next step. If the learner is new to a domain, start with setup and the smallest useful first action before progressing to concepts.',
    '- Use previous-chunk evidence to adapt: repeat or simplify when the learner struggles, and progress only when they demonstrate readiness.',
    '- Do not invent song-specific chords, tabs, lyrics, or exact strumming patterns. If a named arrangement has not been supplied or verified, clearly ask the learner to provide a tutorial, chord chart, or other trusted reference; use generic technique practice until then.',
    '- Avoid duplicate topics, filler, generic motivation, and unrealistic mastery claims.',
    '- Give every topic 1–5 assessable learning objectives and an actionable description. Each objective must be achievable within this session, not merely describe a long-term aspiration.',
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
    '',
    'Planning horizon: ' + planningDays + ' calendar days, ' + practiceDays + ' practice days; maximum total effort ' + chunkBudgetMinutes + ' minutes.',
    goal.priorLearningContext ? 'PRIOR CHUNKS AND VERIFIED PROGRESS:\n' + goal.priorLearningContext : 'This is the first chunk; begin with the most useful starting activities.',
    'QUALITY GATE BEFORE RETURNING JSON: mentally simulate the plan from the learner’s stated starting point. For every session, check what the learner knows at its start, which new syntax or technique is introduced, whether the worked example teaches it, whether guided practice precedes independent work, and whether the entire session fits its time limit. Remove or defer any activity that depends on untaught knowledge. Check every session duration and the sum independently. Do not expose private reasoning; return only the final corrected plan.',
  ].filter(Boolean).join('\n');
}

function buildReviewPrompt(goal, roadmap, learningBrief = null) {
  const planningDays = Number.isInteger(goal.planningDays) ? Math.max(1, Math.min(28, goal.planningDays)) : 7;
  const practiceDays = Math.ceil(goal.daysPerWeek * planningDays / 7);
  const chunkBudgetMinutes = goal.minutesPerDay * practiceDays;
  return [
    'You are an independent, skeptical instructional-design auditor. Judge whether this is genuinely teachable to this exact learner, not whether the topic list sounds plausible.',
    'Reject a roadmap if it is vague, generic, repetitive, disconnected from the desired outcome, missing a requested capability, poorly sequenced, or unrealistic for the available time.',
    'BEGINNER DEPENDENCY AUDIT: for every session, list the knowledge and practical actions it assumes. Compare them against the stated experience, clarifications, and only the earlier sessions. If a beginner must already know how to write/run code, recognize syntax, use a tool, or debug an error that has not been taught, this is a major issue.',
    'TEACHING AUDIT: check that unfamiliar ideas are explained; a complete worked example comes before guided modification; guided practice comes before independent work; expected output or success criteria are clear; and the learner is never asked to perform an untaught action. “Execute a snippet” alone is not sufficient instruction.',
    'FACTUAL CORRECTNESS AUDIT: verify domain-specific statements and syntax rather than trusting fluent wording. For Java, String is a reference type, not a primitive; a first lesson for a true beginner must teach how to run a minimal program before expecting independent code writing.',
    'TIME AUDIT: independently estimate realistic beginner effort, including reading, setup, mistakes, and checks. Every single session must fit within the daily limit and the whole chunk must fit its total budget. Never approve an overlong session just because the total sum fits.',
    'PROGRESSION AUDIT: each session must prepare the learner for the next. Do not introduce arrays/DSA exercises before teaching enough program structure and syntax to use them. If the horizon is too short, narrow the scope instead of rushing.',
    'Approve only when there are no critical or major issues and score is at least 85. Be specific: each issue should explain the mismatch and give an actionable fix. Do not invent requirements not implied by the goal.',
    learningBrief ? `ENHANCED LEARNING BRIEF TO AUDIT AGAINST:\n${JSON.stringify(learningBrief)}` : '',
    'CHUNK BUDGET: ' + planningDays + ' calendar days, ' + practiceDays + ' practice sessions, no more than ' + chunkBudgetMinutes + ' focused minutes total; daily session limit is ' + goal.minutesPerDay + ' minutes.',
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
  while (topics.length > 2 && topics.length * 5 > budget) topics.pop();
  const total = topics.reduce((sum, topic) => sum + topic.estimatedMinutes, 0);
  if (total > budget) {
    const extras = topics.map((topic) => Math.max(0, topic.estimatedMinutes - 5));
    const extraTotal = extras.reduce((sum, value) => sum + value, 0) || topics.length;
    const distributable = Math.max(0, budget - topics.length * 5);
    topics.forEach((topic, index) => { topic.estimatedMinutes = 5 + Math.floor(distributable * (extras[index] || (extraTotal === topics.length ? 1 : 0)) / extraTotal); });
    let remainder = budget - topics.reduce((sum, topic) => sum + topic.estimatedMinutes, 0);
    for (let index = 0; remainder > 0; index = (index + 1) % topics.length) { topics[index].estimatedMinutes += 1; remainder -= 1; }
    for (let index = topics.length - 1; remainder < 0 && index >= 0; index -= 1) { const reduction = Math.min(topics[index].estimatedMinutes - 5, -remainder); topics[index].estimatedMinutes -= reduction; remainder += reduction; }
  }
  return { ...roadmap, topics, estimatedTotalMinutes: topics.reduce((sum, topic) => sum + topic.estimatedMinutes, 0) };
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
  if (first && !/(hello.?world|first program|minimal.*program|run a simple java program)/i.test(`${first.title} ${first.description}`)) {
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

function getOverlongSessions(roadmap, maxSessionMinutes) {
  if (!roadmap || !Array.isArray(roadmap.topics)) return [];
  return roadmap.topics.filter((topic) => topic.estimatedMinutes > maxSessionMinutes);
}

function applyRealismFloor(roadmap, goal) {
  if (!roadmap || !Array.isArray(roadmap.topics) || roadmap.topics.length === 0) return roadmap;
  const profile = `${goal.title || ''} ${goal.targetOutcome || ''}`.toLowerCase();
  const isBeginner = String(goal.experienceLevel || '').toUpperCase() === 'BEGINNER';
  const isGuitarSongPerformance = isBeginner
    && /guitar/.test(profile)
    && /(play|perform|learn|record|rendition|song|piece|arrangement)/.test(profile)
    && /(song|play|perform|record|rendition|arrangement|from start to finish|complete)/.test(profile);
  if (!isGuitarSongPerformance) return roadmap;

  // Conservative planning floor for a complete named song when starting guitar from scratch.
  const minimumMinutes = 1800;
  const currentMinutes = roadmap.topics.reduce((total, topic) => total + topic.estimatedMinutes, 0);
  if (currentMinutes >= minimumMinutes) return roadmap;

  const scale = minimumMinutes / currentMinutes;
  const scaledTopics = roadmap.topics.map((topic) => ({
    ...topic,
    estimatedMinutes: Math.max(5, Math.round(topic.estimatedMinutes * scale)),
  }));
  let difference = minimumMinutes - scaledTopics.reduce((total, topic) => total + topic.estimatedMinutes, 0);
  for (let index = scaledTopics.length - 1; difference !== 0; index = (index - 1 + scaledTopics.length) % scaledTopics.length) {
    const delta = difference > 0 ? 1 : -1;
    if (scaledTopics[index].estimatedMinutes + delta >= 5) {
      scaledTopics[index].estimatedMinutes += delta;
      difference -= delta;
    }
  }
  return {
    ...roadmap,
    topics: scaledTopics,
    estimatedTotalMinutes: scaledTopics.reduce((total, topic) => total + topic.estimatedMinutes, 0),
  };
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

async function requestStructured({ endpoint, headers, model, schemaName, schema, messages, fetchImpl, retryInvalidJson = true }) {
  let response;
  const localOllama = isLocalOllama(endpoint);
  const contextLength = Number.parseInt(process.env.AI_CONTEXT_LENGTH || '16384', 10);
  const reasoningEffort = process.env.AI_REASONING_EFFORT || 'medium';
  const outputTokens = schemaName === 'personalised_learning_roadmap' ? 6144 : 4096;
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
  } catch {
    throw new RoadmapGenerationError(
      502,
      'ROADMAP_PROVIDER_UNAVAILABLE',
      'The AI provider could not be reached. Make sure Ollama is running and the selected models are installed.',
    );
  }

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
    return parseStructuredContent(payload, description);
  } catch (error) {
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
  const planningDays = Number.isInteger(goal.planningDays) ? Math.max(1, Math.min(28, goal.planningDays)) : 7;
  const practiceDays = Math.ceil(goal.daysPerWeek * planningDays / 7);
  const chunkBudgetMinutes = goal.minutesPerDay * practiceDays;
  const sessionCount = Math.max(2, practiceDays);
  const chunkRoadmapSchema = { ...responseSchema, properties: { ...responseSchema.properties, topics: { ...responseSchema.properties.topics, minItems: sessionCount, maxItems: sessionCount } } };
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
        content: 'You are a learning-request enhancement specialist. Preserve the learner’s original intent and scope while making the request precise enough for a roadmap architect. Convert it into a structured brief with measurable success evidence, genuinely required capabilities, prerequisites, assumptions, and a final deliverable. Do not invent preferences, technologies, or commitments. State unresolved choices as assumptions and keep choices open where possible. Explicit learner clarifications override any inference or prior assumption; remove or update assumptions that the learner has clarified. Return only the structured brief JSON.',
      },
      {
        role: 'user',
        content: [
          'Enhance and clarify this learning request before any roadmap is written. Preserve its intent; do not add requirements that the learner did not ask for.',
          `Skill/domain: ${goal.title}`,
          `Current experience: ${goal.experienceLevel}`,
          `Desired outcome: ${goal.targetOutcome}`,
          goal.learnerClarifications ? `Learner clarification (takes precedence over inferred assumptions): ${goal.learnerClarifications}` : '',
          `Availability: ${goal.minutesPerDay} minutes/day, ${goal.daysPerWeek} days/week`,
          `Target date: ${goal.targetDate || 'None'}`,
          'Break a multi-part outcome into distinct required capabilities. Describe observable evidence of success for each. List only prerequisites genuinely needed. If a tool/framework is unspecified, keep it open or state it as an assumption rather than treating it as a user requirement.',
          'Return JSON only matching this schema:',
          JSON.stringify(learningBriefSchema),
        ].join('\n'),
      },
    ],
  });

  const boundedGoal = { ...goal, planningDays, chunkBudgetMinutes };
  const draft = await requestStructured({
    endpoint, headers, model, schemaName: 'personalised_learning_roadmap', schema: chunkRoadmapSchema, fetchImpl,
    messages: [
      {
        role: 'system',
        content: 'You are a learning-path architect. Translate the learner’s exact desired outcome into a small sequence of concrete steps and a directly relevant final deliverable. No generic filler. Return only the requested JSON.',
      },
      { role: 'user', content: buildPrompt(boundedGoal, JSON.stringify(learningBrief)) },
    ],
  });

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

  const overlongBeforeRevision = getOverlongSessions(roadmap, goal.minutesPerDay);
  const sessionBudgetIssues = overlongBeforeRevision.map((topic) => ({ severity: 'major', code: 'SESSION_OVER_BUDGET', explanation: `“${topic.title}” is estimated at ${topic.estimatedMinutes} minutes, exceeding the learner’s ${goal.minutesPerDay}-minute daily limit.`, suggestedFix: 'Narrow this session to one teachable objective, defer remaining work to a later chunk, and keep its estimate within the daily limit.', relatedTopicKeys: [topic.key] }));
  const instructionalIssues = getJavaBeginnerInstructionIssues(roadmap, goal);
  const initialTotalMinutes = roadmap.topics.reduce((sum, topic) => sum + topic.estimatedMinutes, 0);
  const totalBudgetIssues = initialTotalMinutes > chunkBudgetMinutes
    ? [{ severity: 'major', code: 'CHUNK_OVER_BUDGET', explanation: `The proposed chunk needs ${initialTotalMinutes} minutes, exceeding the available ${chunkBudgetMinutes}-minute chunk budget.`, suggestedFix: 'Reduce the scope or split work into later chunks; do not shrink estimates without reducing the activities.', relatedTopicKeys: roadmap.topics.map((topic) => topic.key) }]
    : [];
  const requiredFixes = [...sessionBudgetIssues, ...instructionalIssues, ...totalBudgetIssues];
  const reviewForRevision = requiredFixes.length
    ? { ...review, approved: false, score: Math.min(review.score, 79), issues: [...review.issues, ...requiredFixes] }
    : review;

  if (!reviewForRevision.approved || reviewForRevision.score < 85 || reviewForRevision.issues.some((issue) => issue.severity === 'critical' || issue.severity === 'major')) {
    const revision = await requestStructured({
      endpoint, headers, model, schemaName: 'personalised_learning_roadmap', schema: chunkRoadmapSchema, fetchImpl,
      messages: [
        {
          role: 'system',
          content: 'You are revising a learning roadmap after an independent quality audit. Fix every critical and major issue, honour the learner’s exact desired outcome, keep each step actionable, and do not add unrelated material. Return only the revised roadmap JSON.',
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
    const revisedValidation = validateRoadmap(normalizeJavaBeginnerContent(guardUnverifiedSongDetails(normalizeRoadmapProposal(revision), boundedGoal), boundedGoal));
    if (!revisedValidation.success) {
      if (process.env.AI_DEBUG === 'true') console.error('[roadmap-generator] Revised structural validation failed:', JSON.stringify(revisedValidation.errors));
      throw new RoadmapGenerationError(502, 'ROADMAP_REVISION_INVALID', 'The revised roadmap failed structural validation. Please try again.');
    }
    roadmap = revisedValidation.data;
    const revisedTotalMinutes = roadmap.topics.reduce((sum, topic) => sum + topic.estimatedMinutes, 0);
    if (revisedTotalMinutes > chunkBudgetMinutes) {
      throw new RoadmapGenerationError(502, 'ROADMAP_CHUNK_OVER_BUDGET', 'The AI could not fit the revised learning chunk into your available time without underestimating the work. Try a shorter planning horizon or generate the chunk again.');
    }
    const overlongAfterRevision = getOverlongSessions(roadmap, goal.minutesPerDay);
    const instructionalIssuesAfterRevision = getJavaBeginnerInstructionIssues(roadmap, goal);
    if (instructionalIssuesAfterRevision.length > 0) {
      throw new RoadmapGenerationError(502, 'ROADMAP_INSTRUCTIONAL_QUALITY_FAILED', 'The AI could not produce a realistic beginner sequence after revision. Try a shorter planning horizon or generate the chunk again.');
    }
    if (overlongAfterRevision.length > 0) {
      throw new RoadmapGenerationError(502, 'ROADMAP_SESSION_OVER_BUDGET', 'The AI could not fit every learning session into your daily time limit. Try a shorter planning horizon or generate the chunk again.');
    }
  }

  return {
    ...roadmap,
    learningBrief: {
      ...learningBrief,
      ...(goal.learnerClarifications ? { learnerClarifications: goal.learnerClarifications } : {}),
    },
  };
}

module.exports = {
  RoadmapGenerationError,
  buildPrompt,
  getProviderEndpoint,
  generateClarifyingQuestions,
  buildReviewPrompt,
  applyRealismFloor,
  applyChunkBudget,
  getOverlongSessions,
  getJavaBeginnerInstructionIssues,
  normalizeJavaBeginnerContent,
  guardUnverifiedSongDetails,
  generateRoadmap,
  isLocalOllama,
  normalizeRoadmapProposal,
  validateReview,
};