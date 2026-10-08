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

function buildPrompt(goal) {
  const weeklyMinutes = goal.minutesPerDay * goal.daysPerWeek;
  const target = goal.targetDate
    ? new Date(goal.targetDate).toISOString().slice(0, 10)
    : 'No fixed deadline';

  return [
    'Create a practical, personalised learning roadmap for the learner below.',
    'The skill can be any domain: technical, creative, academic, physical, or professional.',
    'Do not assume a fixed course catalogue. Adapt topics, examples, practice, and outcomes to this learner.',
    'Start at the stated experience level, sequence foundations before dependent skills, and make each topic assessable.',
    'Each topic must include clear learning objectives, an actionable description, and an estimated number of minutes.',
    'Use stable, unique topic keys containing only letters, numbers, dots, underscores, or hyphens.',
    'IMPORTANT: prerequisiteKeys may contain ONLY exact key values from the key fields of topics in THIS response. Never put prior knowledge, generic concepts, or any external key in prerequisiteKeys. Use an empty array when a topic has no prerequisite. Put prerequisite topics earlier in the topics array, and never create cycles or self-dependencies.',
    'Create between 4 and 10 topics. Do not promise mastery by a date; be realistic and focus on measurable milestones.',
    'Keep the plan feasible for the weekly time budget and include practice and feedback, not only theory.',
    'Return valid JSON only, matching this exact structure. Do not wrap it in Markdown fences or add commentary.',
    JSON.stringify(responseSchema),
    '',
    `Skill: ${goal.title}`,
    `Starting experience: ${goal.experienceLevel}`,
    `Desired outcome: ${goal.targetOutcome}`,
    `Available time: ${goal.minutesPerDay} minutes/day, ${goal.daysPerWeek} days/week (${weeklyMinutes} minutes/week)`,
    `Target date: ${target}`,
    '',
    'Return only data matching the required JSON schema.',
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

function isLocalOllama(baseUrl) {
  try {
    const url = new URL(baseUrl);
    return ['localhost', '127.0.0.1', '::1'].includes(url.hostname)
      && url.port === '11434';
  } catch {
    return false;
  }
}

async function generateRoadmap(goal, {
  apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY || '',
  baseUrl = process.env.AI_BASE_URL || process.env.OPENAI_BASE_URL || 'http://127.0.0.1:11434/v1',
  model = process.env.AI_MODEL || process.env.OPENAI_MODEL || 'gemma4:e2b',
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

  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(120000),
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: 'You are a careful learning designer. Create specific, achievable, skill-agnostic learning plans. Never invent learner credentials or claim guaranteed outcomes. prerequisiteKeys must reference only exact key values of other topics in your response; never use generic concepts or external keys. Use [] when there is no prerequisite. Output only valid JSON matching the supplied schema.',
          },
          { role: 'user', content: buildPrompt(goal) },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'personalised_learning_roadmap',
            strict: true,
            schema: responseSchema,
          },
        },
        stream: false,
      }),
    });
  } catch {
    throw new RoadmapGenerationError(
      502,
      'ROADMAP_PROVIDER_UNAVAILABLE',
      'The AI provider could not be reached. If using Ollama, make sure Ollama is running and the selected model has been downloaded.',
    );
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new RoadmapGenerationError(
        503,
        'ROADMAP_PROVIDER_CONFIGURATION',
        'The AI provider rejected its API key or permissions. Check AI_API_KEY and provider access.',
      );
    }
    if (response.status === 429) {
      throw new RoadmapGenerationError(
        503,
        'ROADMAP_PROVIDER_RATE_LIMITED',
        'The AI provider is rate-limited. Please try again shortly.',
      );
    }
    throw new RoadmapGenerationError(
      502,
      'ROADMAP_PROVIDER_ERROR',
      'The AI provider returned an error. Check the configured model name and whether it supports structured JSON output.',
    );
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new RoadmapGenerationError(502, 'ROADMAP_PROVIDER_INVALID_RESPONSE', 'The AI provider returned an unreadable response.');
  }

  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new RoadmapGenerationError(502, 'ROADMAP_PROVIDER_INVALID_RESPONSE', 'The AI provider returned no roadmap.');
  }

  let proposed;
  try {
    proposed = JSON.parse(content);
  } catch {
    throw new RoadmapGenerationError(502, 'ROADMAP_PROVIDER_INVALID_RESPONSE', 'The AI provider returned invalid JSON. Please try generating the roadmap again.');
  }

  const validated = validateRoadmap(normalizeRoadmapProposal(proposed));
  if (!validated.success) {
    throw new RoadmapGenerationError(
      502,
      'ROADMAP_PROVIDER_INVALID_ROADMAP',
      'The generated roadmap did not pass validation. Please try generating it again.',
    );
  }

  return validated.data;
}

module.exports = { RoadmapGenerationError, buildPrompt, generateRoadmap, isLocalOllama, normalizeRoadmapProposal };