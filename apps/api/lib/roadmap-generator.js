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
    'Every prerequisite key must refer to another topic key. Do not create cycles or self-dependencies.',
    'Create between 4 and 10 topics. Do not promise mastery by a date; be realistic and focus on measurable milestones.',
    'Keep the plan feasible for the weekly time budget and include practice and feedback, not only theory.',
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

async function generateRoadmap(goal, {
  apiKey = process.env.OPENAI_API_KEY,
  model = process.env.OPENAI_MODEL || 'gpt-4.1-mini',
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!apiKey) {
    throw new RoadmapGenerationError(
      503,
      'ROADMAP_GENERATOR_NOT_CONFIGURED',
      'Roadmap generation is not configured. Add OPENAI_API_KEY to the API environment.',
    );
  }

  let response;
  try {
    response = await fetchImpl('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(60000),
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: 'You are a careful learning designer. Create specific, achievable, skill-agnostic learning plans. Never invent learner credentials or claim guaranteed outcomes.',
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
      }),
    });
  } catch {
    throw new RoadmapGenerationError(
      502,
      'ROADMAP_PROVIDER_UNAVAILABLE',
      'The roadmap generation service could not be reached. Please try again.',
    );
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new RoadmapGenerationError(
        503,
        'ROADMAP_PROVIDER_CONFIGURATION',
        'The roadmap generation provider rejected its credentials or permissions.',
      );
    }
    if (response.status === 429) {
      throw new RoadmapGenerationError(
        503,
        'ROADMAP_PROVIDER_RATE_LIMITED',
        'The roadmap generation service is busy. Please try again shortly.',
      );
    }
    throw new RoadmapGenerationError(
      502,
      'ROADMAP_PROVIDER_ERROR',
      'The roadmap generation service returned an error. Please try again.',
    );
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new RoadmapGenerationError(502, 'ROADMAP_PROVIDER_INVALID_RESPONSE', 'The generation service returned an unreadable response.');
  }

  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new RoadmapGenerationError(502, 'ROADMAP_PROVIDER_INVALID_RESPONSE', 'The generation service returned no roadmap.');
  }

  let proposed;
  try {
    proposed = JSON.parse(content);
  } catch {
    throw new RoadmapGenerationError(502, 'ROADMAP_PROVIDER_INVALID_RESPONSE', 'The generation service returned invalid structured data.');
  }

  const validated = validateRoadmap(proposed);
  if (!validated.success) {
    throw new RoadmapGenerationError(
      502,
      'ROADMAP_PROVIDER_INVALID_ROADMAP',
      'The generated roadmap did not pass validation. Please try generating it again.',
    );
  }

  return validated.data;
}

module.exports = { RoadmapGenerationError, buildPrompt, generateRoadmap };
