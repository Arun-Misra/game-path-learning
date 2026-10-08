const assert = require('node:assert/strict');
const test = require('node:test');
const {
  RoadmapGenerationError,
  buildPrompt,
  generateRoadmap,
  isLocalOllama,
} = require('../lib/roadmap-generator');

const goal = {
  title: 'Learn digital illustration',
  targetOutcome: 'Create a polished character illustration',
  experienceLevel: 'BEGINNER',
  minutesPerDay: 30,
  daysPerWeek: 4,
  targetDate: null,
};

function validProposal() {
  return {
    title: 'Digital illustration path',
    summary: 'Learn drawing fundamentals and produce a finished character illustration.',
    topics: [
      {
        key: 'shapes',
        title: 'Shape and form',
        description: 'Observe and construct simple forms.',
        learningObjectives: ['Construct a drawing from simple forms'],
        estimatedMinutes: 30,
        prerequisiteKeys: [],
      },
      {
        key: 'character',
        title: 'Character drawing',
        description: 'Apply shape knowledge to a character sketch.',
        learningObjectives: ['Create a character sketch'],
        estimatedMinutes: 45,
        prerequisiteKeys: ['shapes'],
      },
    ],
  };
}

test('prompt includes the learner skill, outcome, available time, and JSON schema', () => {
  const prompt = buildPrompt(goal);
  assert.match(prompt, /Learn digital illustration/);
  assert.match(prompt, /Create a polished character illustration/);
  assert.match(prompt, /30 minutes\/day, 4 days\/week/);
  assert.match(prompt, /"prerequisiteKeys"/);
  assert.match(prompt, /valid JSON only/);
});

test('recognises local Ollama endpoints so they do not require an API key', () => {
  assert.equal(isLocalOllama('http://127.0.0.1:11434/v1'), true);
  assert.equal(isLocalOllama('http://localhost:11434/v1'), true);
  assert.equal(isLocalOllama('https://integrate.api.nvidia.com/v1'), false);
  assert.equal(isLocalOllama('http://127.0.0.1:3000/v1'), false);
});

test('hosted generation refuses to call provider when API key is missing', async () => {
  await assert.rejects(
    generateRoadmap(goal, {
      apiKey: '',
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      fetchImpl: async () => assert.fail('fetch should not run'),
    }),
    (error) => error instanceof RoadmapGenerationError
      && error.status === 503
      && error.code === 'ROADMAP_GENERATOR_NOT_CONFIGURED',
  );
});

test('generation requests structured output from a configured hosted provider and validates it', async () => {
  let request;
  const result = await generateRoadmap(goal, {
    apiKey: 'test-key',
    baseUrl: 'https://integrate.api.nvidia.com/v1/',
    model: 'test-model',
    fetchImpl: async (url, options) => {
      request = { url, options, body: JSON.parse(options.body) };
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: JSON.stringify(validProposal()) } }] }),
      };
    },
  });

  assert.equal(request.url, 'https://integrate.api.nvidia.com/v1/chat/completions');
  assert.equal(request.options.headers.Authorization, 'Bearer test-key');
  assert.equal(request.body.model, 'test-model');
  assert.equal(request.body.response_format.json_schema.strict, true);
  assert.equal(request.body.stream, false);
  assert.equal(result.topics.length, 2);
  assert.equal(result.topics[1].position, 1);
  assert.equal(result.estimatedTotalMinutes, 75);
});

test('local Ollama generation works without a hosted API key', async () => {
  let request;
  const result = await generateRoadmap(goal, {
    apiKey: '',
    baseUrl: 'http://127.0.0.1:11434/v1',
    model: 'gemma4:e2b',
    fetchImpl: async (url, options) => {
      request = { url, options, body: JSON.parse(options.body) };
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: JSON.stringify(validProposal()) } }] }),
      };
    },
  });

  assert.equal(request.url, 'http://127.0.0.1:11434/v1/chat/completions');
  assert.equal(request.options.headers.Authorization, undefined);
  assert.equal(request.body.model, 'gemma4:e2b');
  assert.equal(result.topics.length, 2);
});

test('generation rejects invalid provider output instead of persisting it', async () => {
  await assert.rejects(
    generateRoadmap(goal, {
      apiKey: '',
      baseUrl: 'http://localhost:11434/v1',
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                ...validProposal(),
                topics: validProposal().topics.map((topic) => ({
                  ...topic,
                  prerequisiteKeys: ['missing-topic'],
                })),
              }),
            },
          }],
        }),
      }),
    }),
    (error) => error instanceof RoadmapGenerationError
      && error.code === 'ROADMAP_PROVIDER_INVALID_ROADMAP',
  );
});

test('provider rate limits are reported as retryable service errors', async () => {
  await assert.rejects(
    generateRoadmap(goal, {
      apiKey: 'test-key',
      baseUrl: 'https://example-provider.invalid/v1',
      fetchImpl: async () => ({ ok: false, status: 429 }),
    }),
    (error) => error instanceof RoadmapGenerationError
      && error.status === 503
      && error.code === 'ROADMAP_PROVIDER_RATE_LIMITED',
  );
});
