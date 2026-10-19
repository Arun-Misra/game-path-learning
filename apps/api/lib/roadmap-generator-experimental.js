const DEFAULT_BASE_URL = 'http://127.0.0.1:11434/v1';
const DEFAULT_MODEL = 'gemma4:e4b';
const ROADMAP_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' }, summary: { type: 'string' }, reason: { type: 'string' },
    estimatedRemainingMinutes: { type: 'number' },
    estimateConfidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    topics: { type: 'array', items: { type: 'object', properties: {
      key: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' },
      learningObjectives: { type: 'array', items: { type: 'string' } },
      estimatedMinutes: { type: 'number' }, prerequisiteKeys: { type: 'array', items: { type: 'string' } },
    }, required: ['key', 'title', 'description', 'learningObjectives', 'estimatedMinutes', 'prerequisiteKeys'] } },
  },
  required: ['title', 'summary', 'topics'],
};
class ExperimentalRoadmapGenerationError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
function isLocalOllama(baseUrl) {
  try { return ['127.0.0.1', 'localhost', '::1'].includes(new URL(baseUrl).hostname); } catch { return false; }
}
function getEndpoint(baseUrl) {
  return isLocalOllama(baseUrl) ? new URL(baseUrl).origin + '/api/chat' : baseUrl.replace(/\/+$/, '') + '/chat/completions';
}
function getMessageContent(payload) {
  const content = payload?.message?.content ?? payload?.choices?.[0]?.message?.content;
  if (typeof content === 'string' && content.trim()) return content.trim();
  throw new ExperimentalRoadmapGenerationError(502, 'ROADMAP_EMPTY_MODEL_RESPONSE', 'The model did not return a roadmap.');
}
function parseDecision(content) {
  const trimmed = String(content || '').trim();
  // Try each balanced JSON object so a short preamble or markdown fence is harmless.
  for (let start = 0; start < trimmed.length; start += 1) {
    if (trimmed[start] !== '{') continue;
    let depth = 0, inString = false, escaped = false;
    for (let index = start; index < trimmed.length; index += 1) {
      const char = trimmed[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') inString = true;
      else if (char === '{') depth += 1;
      else if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          try {
            const decision = JSON.parse(trimmed.slice(start, index + 1));
            if (decision && typeof decision === 'object' && !Array.isArray(decision)) return decision;
          } catch { /* Try the next balanced object. */ }
          break;
        }
      }
    }
  }
  throw new ExperimentalRoadmapGenerationError(502, 'ROADMAP_INVALID_MODEL_JSON', 'The model response was not valid JSON.');
}
function buildLearnerBrief(goal, now = new Date()) {
  const targetDate = goal.targetDate ? new Date(goal.targetDate) : null;
  const daysUntilTarget = targetDate && Number.isFinite(targetDate.getTime()) ? Math.ceil((targetDate.getTime() - now.getTime()) / 86400000) : null;
  const planningDays = Number.isInteger(goal.planningDays) ? Math.max(1, Math.min(28, goal.planningDays)) : 3;
  const unrestrictedGeneration = goal.unrestrictedGeneration === true;
  return {
    skill: goal.title, goal: goal.targetOutcome || goal.originalDescription || goal.title,
    experienceLevel: goal.experienceLevel || 'UNSPECIFIED', minutesPerDay: Number(goal.minutesPerDay),
    daysPerWeek: Number(goal.daysPerWeek), minutesAvailablePerWeek: Number(goal.minutesPerDay) * Number(goal.daysPerWeek),
    planningDays, unrestrictedGeneration,
    chunkNumber: Number.isInteger(goal.chunkNumber) ? goal.chunkNumber : 1,
    priorLearningContext: typeof goal.priorLearningContext === 'string' && goal.priorLearningContext.trim() ? goal.priorLearningContext : undefined,
    timeCalibrationContext: typeof goal.timeCalibrationContext === 'string' && goal.timeCalibrationContext.trim() ? goal.timeCalibrationContext : undefined,
    targetDate: targetDate && Number.isFinite(targetDate.getTime()) ? targetDate.toISOString().slice(0, 10) : null,
    daysUntilTarget,
    additionalContext: typeof goal.learnerClarifications === 'string' && goal.learnerClarifications.trim() ? goal.learnerClarifications.trim() : undefined,
  };
}

// A generated chunk must fit the same budget that the scheduler and UI display.
// Keep the earliest coherent sequence; never shrink individual estimates to make it fit.
function fitTopicsToChunk(topics, learner) {
  if (learner.unrestrictedGeneration) return topics;
  const dailyMinutes = Math.floor(learner.minutesPerDay);
  const practiceDays = learner.planningDays;
  const chunkBudgetMinutes = dailyMinutes * practiceDays;
  let totalMinutes = 0;
  const selected = [];
  for (const topic of topics) {
    const minutes = topic?.estimatedMinutes;
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > dailyMinutes) break;
    if (totalMinutes + minutes > chunkBudgetMinutes) break;
    selected.push(topic);
    totalMinutes += minutes;
  }
  if (selected.length < 2 && topics.length >= 2) {
    throw new ExperimentalRoadmapGenerationError(
      502,
      'ROADMAP_CHUNK_BUDGET_INVALID',
      `The model did not produce at least two complete sessions within the ${chunkBudgetMinutes}-minute budget for this ${learner.planningDays}-day chunk. Please regenerate the chunk.`,
    );
  }
  const includedKeys = new Set(selected.map((topic) => topic.key));
  return selected.map((topic) => ({
    ...topic,
    prerequisiteKeys: (Array.isArray(topic.prerequisiteKeys) ? topic.prerequisiteKeys : [])
      .filter((key) => includedKeys.has(key)),
  }));
}

function normalizeTopicTitle(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/^\s*(?:(?:learn|review|apply|practice|revise|recall|retrieve)\s*:\s*)+/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function findRepeatedCompletedTopics(topics, priorLearningContext) {
  if (!Array.isArray(topics) || !priorLearningContext) return [];
  let prior;
  try { prior = JSON.parse(priorLearningContext); } catch { return []; }
  const previousTopics = Array.isArray(prior.topics) ? prior.topics : [];
  const previousByTitle = new Map();
  for (const topic of previousTopics) {
    const normalizedTitle = normalizeTopicTitle(topic.title);
    if (!normalizedTitle) continue;
    const existing = previousByTitle.get(normalizedTitle) || [];
    existing.push(topic);
    previousByTitle.set(normalizedTitle, existing);
  }

  return topics.flatMap((topic) => {
    const normalizedTitle = normalizeTopicTitle(topic.title);
    const previous = previousByTitle.get(normalizedTitle) || [];
    if (!normalizedTitle || previous.length === 0) return [];
    const learningGapExists = previous.some((oldTopic) => {
      const attempts = Array.isArray(oldTopic.assessments) ? oldTopic.assessments : [];
      const latestScore = attempts.length > 0 && Number.isFinite(Number(attempts[0].score))
        ? Number(attempts[0].score) : null;
      const progress = Array.isArray(oldTopic.progress) ? oldTopic.progress : [];
      const notMastered = progress.some((item) => String(item.status || '').toUpperCase() !== 'MASTERED');
      return (latestScore !== null && latestScore < 85) || notMastered;
    });
    const isExplicitReview = /\b(review|retriev|recall|revis|reinforc|remediat|practice)\b/i.test(topic.title || '');
    if (isExplicitReview && learningGapExists) return [];
    return [{ title: topic.title, previousTitle: previous[0].title }];
  });
}

function assertContinuationProgress(topics, learner) {
  const repeated = findRepeatedCompletedTopics(topics, learner.priorLearningContext);
  if (repeated.length) {
    const titles = repeated.slice(0, 3).map((item) => item.title).join(', ');
    throw new ExperimentalRoadmapGenerationError(
      502,
      'ROADMAP_DUPLICATE_CONTENT',
      `The proposed continuation repeats recent material without evidence that it needs review (${titles}). No new chunk was activated; regenerate the next chunk.`,
    );
  }
}

function buildMessages(learner) {
  const deadline = Number.isFinite(learner.daysUntilTarget) && learner.daysUntilTarget >= 0
    ? `${learner.daysUntilTarget} days from now (${learner.targetDate})` : 'not specified';
  const planningDays = Number.isInteger(learner.planningDays) ? Math.max(1, learner.planningDays) : 3;
  const practiceDays = planningDays;
  const chunkBudgetMinutes = Math.floor(learner.minutesPerDay) * practiceDays;
  const scopeInstructions = learner.unrestrictedGeneration
    ? [
      'Plan the complete learning journey for the stated outcome, using the overall deadline as the target horizon when one is provided.',
      'Choose the appropriate number of sessions and the level of detail yourself. Do not limit the plan to planningDays; that field is internal scheduling metadata, not a generation limit.',
      'Use the learner’s availability to make a realistic sequence, and include milestones, prerequisite skills, practice, retrieval, and meaningful application where relevant.',
    ]
    : [
      `Generate only the next ${planningDays} study days of this roadmap chunk, not the entire curriculum through the deadline. The deadline describes the overall goal, not the length of this chunk.`,
      `This chunk has ${practiceDays} planned study days and a hard total budget of ${chunkBudgetMinutes} minutes. Every session must be 5 to ${Math.floor(learner.minutesPerDay)} minutes, and all session estimates added together must not exceed ${chunkBudgetMinutes} minutes.`,
      'Return only the first coherent sequence of sessions that fits this chunk. Do not include later work just because it belongs in the overall journey; later chunks are generated after this one is completed.',
      'The title and summary must describe this short chunk, not claim that the full deadline-length journey is included. Do not put the overall deadline duration in the chunk title.',
    ];
  const system = [
    `You are the best ${learner.skill} coach and planner: an exceptional, practical coach who plans for this specific learner, not a generic syllabus generator.`,
    `The learner's overall goal deadline is ${deadline}; they can practise ${learner.minutesPerDay} minutes per day, on ${learner.daysPerWeek} days per week.`,
    `The learner's current level is ${learner.experienceLevel}. This is chunk ${learner.chunkNumber || 1}.`,
    ...scopeInstructions,
    'QUALITY BAR — follow these instructions literally:',
    '1. Make a realistic coaching plan, not a list of broad subject headings. Every topic must describe a concrete session the learner can actually do today.',
    '2. Sequence sessions based on prerequisites and the stated outcome. Introduce a manageable amount of new material, then make the learner retrieve and use it. Revisit earlier skills only when it serves retention, fluency, a demonstrated gap, or integration.',
    '3. In each topic description, write a compact actionable session guide: what to start with, the specific practice activity, what to repeat or vary, and how to check the result. Use time allocations that add up to estimatedMinutes when useful. The learner should not need to ask what to do next.',
    '4. Each learning objective must be observable and testable (something the learner can perform, explain, build, play, solve, or demonstrate), not a vague phrase such as “understand the basics”. Include a tangible end-of-session result where appropriate.',
    '5. Choose practice methods native to this learner’s skill and outcome; never copy a template from an unrelated domain. Use focused repetitions and cumulative application for performance skills, runnable or buildable work and tests for technical skills, and retrieval plus applied problems for conceptual skills. These are adaptable principles, not mandatory templates.',
    '6. Avoid fake precision, filler, motivational padding, generic “research/watch/read about” tasks, oversized sessions, and repeating the same lesson structure mechanically. Prefer one useful, well-scoped activity over several shallow activities.',
    '7. Never invent source-specific facts, song chords/tabs, APIs, or other details that are not supported by the input. When exact details are unknown, state how to verify them and provide a safe practical alternative.',
    '8. Treat time availability as a hard limit. Topic estimatedMinutes must be an integer of at least 5 and no greater than minutesPerDay. Keep the total planned work within the chunk budget; do not silently compress estimates to make a plan appear feasible.',
    '9. For follow-up chunks, continue from the most recent work. Do not restart the course, repeat completed sessions, or assume completion equals mastery. Use recent assessment attempts, session feelings, reflections, unfinished work, and actual-time evidence to decide what to reinforce or advance.',
    '10. If prior evidence is missing, do not pretend to know the learner’s progress. Start with a brief, relevant retrieval check or a sensible next step based on the supplied starting level.',
    'Return exactly one valid JSON object and nothing else, containing title, summary, estimatedRemainingMinutes, estimateConfidence, and topics. Estimate remaining effort for the overall goal with honest uncertainty; do not confuse that estimate with this chunk’s workload. This is not a viability decision. Each topic needs key, title, description, learningObjectives, estimatedMinutes, and prerequisiteKeys.',
    'Choose the structure and sequence yourself. Make the plan specific to the goal, current ability, time budget, and evidence rather than forcing a fixed curriculum.',
  ].join(' ');
  return [
    { role: 'system', content: system },
    { role: 'user', content: JSON.stringify(learner) },
  ];
}
async function generateRoadmap(goal, { apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY || '', baseUrl = process.env.AI_BASE_URL || process.env.OPENAI_BASE_URL || DEFAULT_BASE_URL, model = process.env.AI_MODEL || process.env.OPENAI_MODEL || DEFAULT_MODEL, fetchImpl = globalThis.fetch, now = new Date() } = {}) {
  const localOllama = isLocalOllama(baseUrl);
  if (!apiKey && !localOllama) throw new ExperimentalRoadmapGenerationError(503, 'ROADMAP_GENERATOR_NOT_CONFIGURED', 'No AI API key is configured.');
  const learner = buildLearnerBrief(goal, now), endpoint = getEndpoint(baseUrl), headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = 'Bearer ' + apiKey;
  const contextLength = Number.parseInt(process.env.AI_CONTEXT_LENGTH || '16384', 10), reasoningEffort = process.env.AI_REASONING_EFFORT || 'medium';
  const messages = buildMessages(learner);
  // Gemma 4 supports JSON-only mode, not schema-constrained output.
  const ollamaFormat = /gemma4/i.test(model) ? 'json' : ROADMAP_SCHEMA;
  // Full-plan generation has no artificial output-token ceiling. Rolling chunks remain bounded.
  const numPredict = learner.unrestrictedGeneration ? -1 : (learner.planningDays <= 1 ? 2048 : learner.planningDays <= 3 ? 3072 : learner.planningDays <= 7 ? 6144 : 8192);
  const body = localOllama
    ? { model, messages, format: ollamaFormat, think: reasoningEffort, options: { num_ctx: Number.isFinite(contextLength) ? Math.max(4096, Math.min(32768, contextLength)) : 16384, num_predict: numPredict, temperature: 0.4 }, stream: false }
    : { model, messages, ...(learner.unrestrictedGeneration ? {} : { max_tokens: numPredict }), temperature: 0.4, reasoning_effort: reasoningEffort, response_format: { type: 'json_object' }, stream: false };
  let response;
  try {
    response = await fetchImpl(endpoint, { method: 'POST', headers, signal: AbortSignal.timeout(240000), body: JSON.stringify(body) });
  } catch {
    throw new ExperimentalRoadmapGenerationError(502, 'ROADMAP_PROVIDER_UNAVAILABLE', 'The AI provider could not be reached. Check that the selected model is running.');
  }
  if (!response.ok) throw new ExperimentalRoadmapGenerationError(502, 'ROADMAP_PROVIDER_ERROR', 'The AI provider returned an error while generating the roadmap.');
  let payload;
  try { payload = await response.json(); } catch {
    throw new ExperimentalRoadmapGenerationError(502, 'ROADMAP_INVALID_PROVIDER_RESPONSE', 'The AI provider returned an unreadable response.');
  }
  // Exactly one provider call per generation; don't silently pay for a repair generation.
  const decision = parseDecision(getMessageContent(payload));
  const roadmap = decision.roadmap && typeof decision.roadmap === 'object' ? decision.roadmap : decision;
  if (typeof roadmap.title !== 'string' || typeof roadmap.summary !== 'string' || !Array.isArray(roadmap.topics)) {
    throw new ExperimentalRoadmapGenerationError(502, 'ROADMAP_MISSING_CONTENT', 'The model returned JSON but omitted the roadmap title, summary, or topics. One model request was used; no repair retry was made.');
  }
  const topics = fitTopicsToChunk(roadmap.topics, learner);
  if (!learner.unrestrictedGeneration) assertContinuationProgress(topics, learner);
  const rawEstimate = decision.estimatedRemainingMinutes ?? roadmap.estimatedRemainingMinutes, estimate = Number(rawEstimate);
  const confidence = ['low', 'medium', 'high'].includes(decision.estimateConfidence) ? decision.estimateConfidence : 'low';
  const title = learner.unrestrictedGeneration ? roadmap.title : `${learner.chunkNumber === 1 ? 'First chunk' : `Chunk ${learner.chunkNumber}`} · ${roadmap.title.replace(/^\s*\d+\s*[- ]?\s*day(?:s)?\s+/i, '')}`;
  const summary = learner.unrestrictedGeneration ? roadmap.summary : roadmap.summary
    .replace(/\b(?:this|a|the)\s+(?:(?:focused|full|complete|entire)\s+)?\d+\s*[- ]?\s*day(?:s)?\s+(?:plan|roadmap|learning path|journey)\b/gi, 'This chunk')
    .replace(/^This chunk for\b/i, 'This chunk focused on');
  const effectiveModelOutput = decision.roadmap && typeof decision.roadmap === 'object'
    ? { ...decision, roadmap: { ...roadmap, title, summary, topics } }
    : { ...decision, title, summary, topics };
  return {
    title, summary, topics,
    estimatedRemainingMinutes: Number.isFinite(estimate) && estimate >= 0 ? estimate : null, estimateConfidence: confidence,
    learningBrief: { modelOutput: effectiveModelOutput, estimatedRemainingMinutes: Number.isFinite(estimate) && estimate >= 0 ? estimate : null, estimateConfidence: confidence, generationMode: learner.unrestrictedGeneration ? 'model_first_full_plan' : 'model_first_chunk' },
  };
}
module.exports = { ExperimentalRoadmapGenerationError, buildLearnerBrief, buildMessages, fitTopicsToChunk, normalizeTopicTitle, findRepeatedCompletedTopics, assertContinuationProgress, getEndpoint, parseDecision, generateRoadmap };