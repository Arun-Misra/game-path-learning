


















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
  const target = goal.targetDate
    ? new Date(goal.targetDate).toISOString().slice(0, 10)
    : 'No fixed deadline';

  return [
    'Design only the next small learning chunk. The desired outcome remains the long-term destination, but this chunk covers only the requested period.',
    'Do not design the entire curriculum or estimate all work needed to reach the final outcome. Later chunks will use observed progress to decide what comes next.',
    '',
    'ENHANCED LEARNING BRIEF:',
    '- Translate the desired outcome into concrete capabilities, prerequisite knowledge, and a final observable deliverable.',
    '- Cover every distinct capability explicitly. A capability mentioned only in the summary does not count as covered.',
    '- For each topic, specify what the learner will do, produce, solve, test, or demonstrate. Avoid vague titles and descriptions such as “learn the basics”, “explore concepts”, or “practice more”.',
    '- Sequence topics so each step produces something that is used by a later step. Explain concrete exercises, implementation, feedback, debugging, or testing when relevant.',
    '- Keep prerequisites proportionate to experience. Do not reteach unrelated foundations or add generic curriculum just because it belongs to the skill.',
    '- End with a capstone or performance task that directly demonstrates the stated outcome, not an unrelated portfolio project.',
    '',
    'SCOPE AND REALISM:',
    'Never use a default 4–8 week timeline for the entire curriculum; generate only the next requested learning chunk.',
    'Treat the total available chunk time as a hard limit. Every activity estimate must fit within the learner’s actual practice budget.',
    'For practice-heavy skills, use deliberate short exercises and observable checkpoints. Do not promise mastery or completion of the entire long-term outcome inside this chunk.',
    'Use previous-chunk evidence to adapt: repeat or simplify when the learner struggles, and progress when they demonstrate readiness.',
    'Do not invent song-specific chords, tabs, lyrics, or exact strumming patterns. If a named arrangement has not been supplied or verified, clearly ask the learner to provide a tutorial, chord chart, or other trusted reference; use generic technique practice until then.',
    '- Avoid duplicate topics, filler, generic motivation, and unrealistic mastery claims.',
    '- Give every topic 1–5 assessable learning objectives and an actionable description.',
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
    'Before responding, verify that the chunk fits the available practice budget and ends with an observable checkpoint. Do not expand it to cover the entire long-term outcome.',
  ].filter(Boolean).join('\n');
}

function buildReviewPrompt(goal, roadmap, learningBrief = null) {
  const planningDays = Number.isInteger(goal.planningDays) ? Math.max(1, Math.min(28, goal.planningDays)) : 7;
  const chunkBudgetMinutes = goal.minutesPerDay * Math.min(goal.daysPerWeek, planningDays);
  return [
    'You are an independent, strict learning-roadmap auditor. Judge the plan against the learner’s actual goal, not against a generic course outline.',
    'Reject a roadmap if it is vague, generic, repetitive, disconnected from the desired outcome, missing a requested capability, poorly sequenced, or unrealistic for the available time.',
    'Check: (1) exact outcome alignment, (2) coverage of each distinct requested capability, (3) concrete actionable work per topic, (4) meaningful step-by-step progression, (5) relevant final deliverable, (6) appropriate prerequisites for experience level, (7) time-budget realism, and (8) no filler/repetition.',
    'CHUNK TIME AUDIT: Independently estimate the focused effort needed for this chunk and judge whether these activities fit the chunk budget. Do not require the entire long-term outcome to fit inside this chunk or apply a whole-course minimum duration to a chunk. For practice-heavy outcomes, preserve deliberate practice cycles and observable checkpoints while staying within the available chunk budget.',
    'Approve only when there are no critical or major issues and score is at least 80. Be specific: each issue should explain the mismatch and give an actionable fix. Do not invent requirements not implied by the goal.',
    learningBrief ? `ENHANCED LEARNING BRIEF TO AUDIT AGAINST:\n${JSON.stringify(learningBrief)}` : '',
    'CHUNK BUDGET: ' + planningDays + ' days, no more than ' + chunkBudgetMinutes + ' focused minutes total.',
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
  const content = payload.choices?.[0]?.message?.content;
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
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(120000),
      body: JSON.stringify({
        model,
        messages,
        max_tokens: schemaName === 'personalised_learning_roadmap' ? 6144 : 4096,
        temperature: 0.2,
        // E4B's hidden reasoning consumes the default 4k Ollama context; reserve tokens for complete structured output.
        reasoning_effort: 'none',
        response_format: {
          type: 'json_schema',
          json_schema: { name: schemaName, strict: true, schema },
        },
        stream: false,
      }),
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

async function generateClarifyingQuestions(goal, { apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY || '', baseUrl = process.env.AI_BASE_URL || process.env.OPENAI_BASE_URL || 'http://127.0.0.1:11434/v1', model = process.env.AI_MODEL || process.env.OPENAI_MODEL || 'gemma4:e4b', fetchImpl = globalThis.fetch } = {}) {
  const endpoint = baseUrl.replace(/\/+$/, '') + '/chat/completions';
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
  const endpoint = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
  if (!apiKey && !isLocalOllama(baseUrl)) {
    throw new RoadmapGenerationError(
      503,
      'ROADMAP_GENERATOR_NOT_CONFIGURED',
      'No AI API key is configured. Set AI_API_KEY for a hosted provider, or run Ollama locally and set AI_BASE_URL and AI_MODEL in the API environment.',
    );
  }

  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  // Stage 1: Use the same E4B model throughout so Ollama does not have to load/swap separate planner and reviewer models.
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

  const planningDays = Number.isInteger(goal.planningDays) ? Math.max(1, Math.min(28, goal.planningDays)) : 7;
  const chunkBudgetMinutes = goal.minutesPerDay * Math.min(goal.daysPerWeek, planningDays);
  const boundedGoal = { ...goal, planningDays, chunkBudgetMinutes };
  const draft = await requestStructured({
    endpoint, headers, model, schemaName: 'personalised_learning_roadmap', schema: responseSchema, fetchImpl,
    messages: [
      {
        role: 'system',
        content: 'You are a learning-path architect. Translate the learner’s exact desired outcome into a small sequence of concrete steps and a directly relevant final deliverable. No generic filler. Return only the requested JSON.',
      },
      { role: 'user', content: buildPrompt(boundedGoal, JSON.stringify(learningBrief)) },
    ],
  });

  const firstValidation = validateRoadmap(guardUnverifiedSongDetails(normalizeRoadmapProposal(draft), boundedGoal));
  if (!firstValidation.success) {
    throw new RoadmapGenerationError(502, 'ROADMAP_PROVIDER_INVALID_ROADMAP', 'The generated roadmap failed structural validation. Please try again.');
  }
  let roadmap = applyChunkBudget(firstValidation.data, chunkBudgetMinutes);

  // The same E4B model audits its plan against the learner's exact outcome and enhanced brief.
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

  if (!review.approved || review.score < 80 || review.issues.some((issue) => issue.severity === 'critical' || issue.severity === 'major')) {
    const revision = await requestStructured({
      endpoint, headers, model, schemaName: 'personalised_learning_roadmap', schema: responseSchema, fetchImpl,
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
            `INDEPENDENT REVIEW AND REQUIRED FIXES:\n${JSON.stringify(review)}`,
            '',
            'Revise the roadmap itself, not just its wording. Return a complete replacement roadmap.',
          ].join('\n'),
        },
      ],
    });
    const revisedValidation = validateRoadmap(guardUnverifiedSongDetails(normalizeRoadmapProposal(revision), boundedGoal));
    if (!revisedValidation.success) {
      throw new RoadmapGenerationError(502, 'ROADMAP_REVISION_INVALID', 'The revised roadmap failed structural validation. Please try again.');
    }
    roadmap = applyChunkBudget(revisedValidation.data, chunkBudgetMinutes);
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
  generateClarifyingQuestions,
  buildReviewPrompt,
  applyRealismFloor,
  applyChunkBudget,
  guardUnverifiedSongDetails,
  generateRoadmap,
  isLocalOllama,
  normalizeRoadmapProposal,
  validateReview,
};