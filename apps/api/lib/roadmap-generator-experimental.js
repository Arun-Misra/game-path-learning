const DEFAULT_BASE_URL = 'http://127.0.0.1:11434/v1';
const DEFAULT_MODEL = 'gemma4:e4b';
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
  throw new ExperimentalRoadmapGenerationError(502, 'ROADMAP_EMPTY_MODEL_RESPONSE', 'The model did not return a JSON decision.');
}
function parseDecision(content) {
  let decision;
  try { decision = JSON.parse(content); } catch {
    const first = content.indexOf('{'), last = content.lastIndexOf('}');
    if (first < 0 || last <= first) throw new ExperimentalRoadmapGenerationError(502, 'ROADMAP_INVALID_MODEL_JSON', 'The model response was not valid JSON.');
    try { decision = JSON.parse(content.slice(first, last + 1)); } catch {
      throw new ExperimentalRoadmapGenerationError(502, 'ROADMAP_INVALID_MODEL_JSON', 'The model response was not valid JSON.');
    }
  }
  if (!decision || typeof decision !== 'object' || Array.isArray(decision) || typeof decision.viable !== 'boolean') {
    throw new ExperimentalRoadmapGenerationError(502, 'ROADMAP_MISSING_VIABILITY_DECISION', 'The model must return viable as a boolean.');
  }
  return decision;
}
function buildLearnerBrief(goal, now = new Date()) {
  const targetDate = goal.targetDate ? new Date(goal.targetDate) : null;
  const daysUntilTarget = targetDate && Number.isFinite(targetDate.getTime()) ? Math.ceil((targetDate.getTime() - now.getTime()) / 86400000) : null;
  return {
    skill: goal.title, goal: goal.targetOutcome || goal.originalDescription || goal.title,
    experienceLevel: goal.experienceLevel || 'UNSPECIFIED', minutesPerDay: Number(goal.minutesPerDay),
    daysPerWeek: Number(goal.daysPerWeek), minutesAvailablePerWeek: Number(goal.minutesPerDay) * Number(goal.daysPerWeek),
    targetDate: targetDate && Number.isFinite(targetDate.getTime()) ? targetDate.toISOString().slice(0, 10) : null,
    daysUntilTarget,
    additionalContext: typeof goal.learnerClarifications === 'string' && goal.learnerClarifications.trim() ? goal.learnerClarifications.trim() : undefined,
  };
}
function buildMessages(learner) {
  const days = Number.isFinite(learner.daysUntilTarget) && learner.daysUntilTarget >= 0 ? learner.daysUntilTarget : 'not specified';
  const system = [
    `You are the best ${learner.skill} coach and planner.`,
    `Plan how this learner can reach their goal in ${days} days, practising ${learner.minutesPerDay} minutes per day, ${learner.daysPerWeek} days per week.`,
    `The learner's current level is ${learner.experienceLevel}.`,
    'Decide honestly whether the goal is viable within this time and practice availability.',
    'Return only valid JSON. If not viable, return viable:false and a brief reason.',
    'If viable, return viable:true, a reason, estimatedRemainingMinutes, estimateConfidence, and roadmap with title, summary, and topics. Each topic needs key, title, description, learningObjectives, estimatedMinutes, and prerequisiteKeys.',
    'Choose the structure and sequence yourself. Make it realistic for this learner and goal.',
    'Generate the plan on a day-by-day basis, not as broad multi-day modules. Each topic must represent one practice day and specify that day\'s focus, concrete activities/objectives, and estimatedMinutes within the learner\'s daily time budget. Order the days so skills build on earlier days and revisit previously learned material when useful.',
  ].join(' ');
  return [{ role: 'system', content: system }, { role: 'user', content: JSON.stringify(learner) }];
}
async function generateRoadmap(goal, { apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY || '', baseUrl = process.env.AI_BASE_URL || process.env.OPENAI_BASE_URL || DEFAULT_BASE_URL, model = process.env.AI_MODEL || process.env.OPENAI_MODEL || DEFAULT_MODEL, fetchImpl = globalThis.fetch, now = new Date() } = {}) {
  const localOllama = isLocalOllama(baseUrl);
  if (!apiKey && !localOllama) throw new ExperimentalRoadmapGenerationError(503, 'ROADMAP_GENERATOR_NOT_CONFIGURED', 'No AI API key is configured.');
  const learner = buildLearnerBrief(goal, now), endpoint = getEndpoint(baseUrl), headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = 'Bearer ' + apiKey;
  const contextLength = Number.parseInt(process.env.AI_CONTEXT_LENGTH || '16384', 10), reasoningEffort = process.env.AI_REASONING_EFFORT || 'medium';
  const messages = buildMessages(learner);
  const body = localOllama
    ? { model, messages, format: 'json', think: reasoningEffort, options: { num_ctx: Number.isFinite(contextLength) ? Math.max(4096, Math.min(32768, contextLength)) : 16384, num_predict: 8192, temperature: 0.4 }, stream: false }
    : { model, messages, max_tokens: 8192, temperature: 0.4, reasoning_effort: reasoningEffort, response_format: { type: 'json_object' }, stream: false };
  let response;
  try { response = await fetchImpl(endpoint, { method: 'POST', headers, signal: AbortSignal.timeout(240000), body: JSON.stringify(body) }); } catch {
    throw new ExperimentalRoadmapGenerationError(502, 'ROADMAP_PROVIDER_UNAVAILABLE', 'The AI provider could not be reached. Check that the selected model is running.');
  }
  if (!response.ok) throw new ExperimentalRoadmapGenerationError(502, 'ROADMAP_PROVIDER_ERROR', 'The AI provider returned an error while generating the roadmap.');
  let payload;
  try { payload = await response.json(); } catch { throw new ExperimentalRoadmapGenerationError(502, 'ROADMAP_INVALID_PROVIDER_RESPONSE', 'The AI provider returned an unreadable response.'); }
  const decision = parseDecision(getMessageContent(payload));
  if (!decision.viable) throw new ExperimentalRoadmapGenerationError(422, 'ROADMAP_NOT_VIABLE', typeof decision.reason === 'string' && decision.reason.trim() ? decision.reason.trim() : 'The model judged this goal not viable.');
  const roadmap = decision.roadmap && typeof decision.roadmap === 'object' ? decision.roadmap : decision;
  if (typeof roadmap.title !== 'string' || typeof roadmap.summary !== 'string' || !Array.isArray(roadmap.topics)) throw new ExperimentalRoadmapGenerationError(502, 'ROADMAP_MISSING_CONTENT', 'The model judged the goal viable but did not return a roadmap.');
  const rawEstimate = decision.estimatedRemainingMinutes ?? roadmap.estimatedRemainingMinutes, estimate = Number(rawEstimate);
  const confidence = ['low', 'medium', 'high'].includes(decision.estimateConfidence) ? decision.estimateConfidence : 'low';
  return {
    title: roadmap.title, summary: roadmap.summary, topics: roadmap.topics,
    estimatedRemainingMinutes: Number.isFinite(estimate) && estimate >= 0 ? estimate : null, estimateConfidence: confidence,
    learningBrief: { viability: { viable: true, reason: typeof decision.reason === 'string' ? decision.reason : '' }, modelOutput: decision, estimatedRemainingMinutes: Number.isFinite(estimate) && estimate >= 0 ? estimate : null, estimateConfidence: confidence, generationMode: 'model_first' },
  };
}
module.exports = { ExperimentalRoadmapGenerationError, buildLearnerBrief, buildMessages, getEndpoint, parseDecision, generateRoadmap };
