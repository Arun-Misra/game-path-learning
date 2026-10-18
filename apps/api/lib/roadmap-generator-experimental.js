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
function buildMessages(learner) {
  const deadline = Number.isFinite(learner.daysUntilTarget) && learner.daysUntilTarget >= 0
    ? `${learner.daysUntilTarget} days from now (${learner.targetDate})` : 'not specified';
  const planningDays = Number.isInteger(learner.planningDays) ? Math.max(1, learner.planningDays) : 3;
  const scopeInstructions = learner.unrestrictedGeneration
    ? [
      'Plan the complete learning journey for the stated outcome, using the overall deadline as the target horizon when one is provided.',
      'Choose the appropriate number of sessions and the level of detail yourself. Do not limit the plan to planningDays; that field is internal scheduling metadata, not a generation limit.',
      'Use the learner’s availability to make a realistic sequence, and include milestones, prerequisite skills, practice, retrieval, and meaningful application where relevant.',
    ]
    : [
      `Generate only the next ${planningDays} study days for this roadmap chunk, not the entire curriculum through the deadline. The deadline describes the overall goal, not the length of this chunk.`,
      `Keep this chunk focused: plan work for no more than ${planningDays} study days, and ensure every session fits within the learner's daily time budget. Do not invent extra study time.`,
      'Avoid trying to teach the whole skill at once; later chunks will be generated after the learner completes this one.',
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
    '8. Treat time availability as a hard limit. Topic estimatedMinutes must be an integer of at least 5 and no greater than minutesPerDay. Keep the total planned work within the available study days; do not silently compress estimates to make a plan appear feasible.',
    '9. For follow-up chunks, continue from the most recent work. Do not restart the course, repeat completed sessions, or assume completion equals mastery. Use recent assessment attempts, session feelings, reflections, unfinished work, and actual-time evidence to decide what to reinforce or advance.',
    '10. If prior evidence is missing, do not pretend to know the learner’s progress. Start with a brief, relevant retrieval check or a sensible next step based on the supplied starting level.',
    'Return exactly one valid JSON object and nothing else, containing title, summary, estimatedRemainingMinutes, estimateConfidence, and topics. Estimate remaining effort for the overall goal, with honest uncertainty; this estimate is not a viability decision. Each topic needs key, title, description, learningObjectives, estimatedMinutes, and prerequisiteKeys.',
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
  const rawEstimate = decision.estimatedRemainingMinutes ?? roadmap.estimatedRemainingMinutes, estimate = Number(rawEstimate);
  const confidence = ['low', 'medium', 'high'].includes(decision.estimateConfidence) ? decision.estimateConfidence : 'low';
  return {
    title: roadmap.title, summary: roadmap.summary, topics: roadmap.topics,
    estimatedRemainingMinutes: Number.isFinite(estimate) && estimate >= 0 ? estimate : null, estimateConfidence: confidence,
    learningBrief: { modelOutput: decision, estimatedRemainingMinutes: Number.isFinite(estimate) && estimate >= 0 ? estimate : null, estimateConfidence: confidence, generationMode: 'model_first' },
  };
}
module.exports = { ExperimentalRoadmapGenerationError, buildLearnerBrief, buildMessages, getEndpoint, parseDecision, generateRoadmap };