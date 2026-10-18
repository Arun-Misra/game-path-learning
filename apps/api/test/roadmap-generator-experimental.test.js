const assert = require('node:assert/strict');
const test = require('node:test');
const {
  ExperimentalRoadmapGenerationError,
  buildLearnerBrief,
  buildMessages,
  generateRoadmap,
} = require('../lib/roadmap-generator-experimental');

function mockResponse(value) {
  return { ok: true, status: 200, json: async () => ({ message: { content: JSON.stringify(value) } }) };
}
const goal = {
  title: 'Guitar',
  targetOutcome: 'Play three blues songs with clean chord changes.',
  originalDescription: 'Learn acoustic guitar.',
  experienceLevel: 'BEGINNER',
  minutesPerDay: 30,
  daysPerWeek: 5,
  targetDate: '2026-12-01T00:00:00.000Z',
};

test('learner brief contains the goal, starting level, available time, and target horizon', () => {
  const brief = buildLearnerBrief(goal, new Date('2026-10-22T00:00:00.000Z'));
  assert.equal(brief.skill, 'Guitar');
  assert.equal(brief.goal, 'Play three blues songs with clean chord changes.');
  assert.equal(brief.experienceLevel, 'BEGINNER');
  assert.equal(brief.minutesPerDay, 30);
  assert.equal(brief.daysPerWeek, 5);
  assert.equal(brief.minutesAvailablePerWeek, 150);
  assert.equal(brief.daysUntilTarget, 40);
});

test('prompt directly asks the skill coach to plan within the learner time budget and return JSON', () => {
  const messages = buildMessages(buildLearnerBrief(goal, new Date('2026-10-22T00:00:00.000Z')));
  const prompt = messages.map((message) => message.content).join('\\n');
  assert.match(prompt, /best Guitar coach and planner/i);
  assert.match(prompt, /40 days/i);
  assert.match(prompt, /30 minutes per day/i);
  assert.match(prompt, /decide honestly whether the goal is viable/i);
  assert.match(prompt, /Return only valid JSON/i);
  assert.match(prompt, /day-by-day basis/i);
  assert.match(prompt, /Each topic must represent one practice day/i);
  assert.doesNotMatch(prompt, /Java|Spanish|robotics|Guitar Fundamentals/i);
  assert.doesNotMatch(prompt, /five phases|exactly three sessions|worked example/i);
});

test('viable model response is passed through as the roadmap content', async () => {
  const modelOutput = {
    viable: true,
    reason: 'The target is achievable with consistent practice and a realistic progression.',
    estimatedRemainingMinutes: 900,
    estimateConfidence: 'medium',
    roadmap: {
      title: 'A learner shaped guitar plan',
      summary: 'A practical route to the requested performance.',
      topics: [{
        key: 'first-skill',
        title: 'First useful skill',
        description: 'Practise the first concrete skill for this goal.',
        learningObjectives: ['Demonstrate the skill clearly.'],
        estimatedMinutes: 25,
        prerequisiteKeys: [],
      }],
    },
  };
  let request;
  const result = await generateRoadmap(goal, {
    baseUrl: 'http://127.0.0.1:11434/v1',
    model: 'gemma4:e4b',
    now: new Date('2026-10-22T00:00:00.000Z'),
    fetchImpl: async (url, options) => {
      request = { url, body: JSON.parse(options.body) };
      return mockResponse(modelOutput);
    },
  });
  assert.equal(request.url, 'http://127.0.0.1:11434/api/chat');
  assert.equal(request.body.model, 'gemma4:e4b');
  assert.equal(request.body.format, 'json');
  assert.equal(request.body.options.num_ctx, 16384);
  assert.equal(request.body.think, process.env.AI_REASONING_EFFORT || 'medium');
  assert.deepEqual(result.topics, modelOutput.roadmap.topics);
  assert.equal(result.title, modelOutput.roadmap.title);
  assert.equal(result.summary, modelOutput.roadmap.summary);
  assert.equal(result.estimatedRemainingMinutes, 900);
  assert.deepEqual(result.learningBrief.modelOutput, modelOutput);
});

test('model-declared non-viability stops generation and preserves its reason', async () => {
  await assert.rejects(
    generateRoadmap(goal, {
      baseUrl: 'http://127.0.0.1:11434/v1',
      fetchImpl: async () => mockResponse({
        viable: false,
        reason: 'The requested outcome needs substantially more practice time than the deadline allows.',
      }),
    }),
    (error) => {
      assert.ok(error instanceof ExperimentalRoadmapGenerationError);
      assert.equal(error.status, 422);
      assert.equal(error.code, 'ROADMAP_NOT_VIABLE');
      assert.match(error.message, /substantially more practice time/i);
      return true;
    },
  );
});

test('model response without an explicit viability decision is not silently treated as viable', async () => {
  await assert.rejects(
    generateRoadmap(goal, {
      baseUrl: 'http://127.0.0.1:11434/v1',
      fetchImpl: async () => mockResponse({ title: 'Roadmap', summary: 'No viability field', topics: [] }),
    }),
    (error) => error.code === 'ROADMAP_MISSING_VIABILITY_DECISION',
  );
});
