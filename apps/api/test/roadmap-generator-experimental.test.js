const assert = require('node:assert/strict');
const test = require('node:test');
const {
  buildLearnerBrief,
  buildMessages,
  fitTopicsToChunk,
  findRepeatedCompletedTopics,
  assertContinuationProgress,
  parseDecision,
  generateRoadmap,
  ExperimentalRoadmapGenerationError,
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
  assert.equal(brief.planningDays, 3);
  assert.equal(brief.minutesAvailablePerWeek, 150);
  assert.equal(brief.daysUntilTarget, 40);
});

test('prompt asks for a concise, single JSON response within the rolling chunk', () => {
  const messages = buildMessages(buildLearnerBrief(goal, new Date('2026-10-22T00:00:00.000Z')));
  const prompt = messages.map((message) => message.content).join('\\n');
  assert.match(prompt, /best Guitar coach and planner/i);
  assert.match(prompt, /40 days/i);
  assert.match(prompt, /30 minutes per day/i);
  assert.match(prompt, /exactly one valid JSON object/i);
  assert.match(prompt, /estimatedRemainingMinutes/i);
  assert.match(prompt, /not a viability decision/i);
  assert.match(prompt, /next 3 study days/i);
  assert.match(prompt, /not the entire curriculum/i);
  assert.match(prompt, /overall goal.*not the length of this chunk/i);
  assert.doesNotMatch(prompt, /generate the plan over 40 days/i);
  assert.doesNotMatch(prompt, /Java|Spanish|robotics|Guitar Fundamentals/i);
  assert.doesNotMatch(prompt, /five phases|exactly three sessions|worked example/i);
});

test('parses valid JSON wrapped in markdown fences or surrounding text', () => {
  const expected = { viable: false, reason: 'Not enough time.' };
  assert.deepEqual(parseDecision('```json\\n' + JSON.stringify(expected) + '\\n```'), expected);
  assert.deepEqual(parseDecision('Here is the decision:\\n' + JSON.stringify(expected)), expected);
});

test('continuation rejects repeated completed topics even when prefixed as review', () => {
  const prior = JSON.stringify({ topics: [
    { title: 'Variables and Basic Conditionals', assessments: [], progress: [{ status: 'MASTERED' }] },
    { title: 'Mastering Repetition with For and While Loops', assessments: [{ score: 92 }], progress: [{ status: 'MASTERED' }] },
  ] });
  assert.deepEqual(
    findRepeatedCompletedTopics([
      { title: 'Review: Variables and Basic Conditionals' },
      { title: 'Mastering Repetition with For and While Loops' },
    ], prior).map((item) => item.title),
    ['Review: Variables and Basic Conditionals', 'Mastering Repetition with For and While Loops'],
  );
  assert.throws(
    () => assertContinuationProgress([{ title: 'Review: Variables and Basic Conditionals' }], { priorLearningContext: prior }),
    (error) => error.code === 'ROADMAP_DUPLICATE_CONTENT',
  );
});

test('continuation allows explicit review when recent evidence shows a learning gap', () => {
  const prior = JSON.stringify({ topics: [
    { title: 'Variables and Basic Conditionals', assessments: [{ score: 62 }], progress: [{ status: 'MASTERED' }] },
  ] });
  assert.deepEqual(
    findRepeatedCompletedTopics([{ title: 'Review: Variables and Basic Conditionals' }], prior),
    [],
  );
  assert.throws(
    () => assertContinuationProgress([{ title: 'Variables and Basic Conditionals' }], { priorLearningContext: prior }),
    (error) => error.code === 'ROADMAP_DUPLICATE_CONTENT',
  );
});

test('continuation allows new topics and safely ignores malformed prior context', () => {
  assert.deepEqual(findRepeatedCompletedTopics([{ title: 'Arrays and Indexing' }], JSON.stringify({ topics: [{ title: 'Variables' }] })), []);
  assert.deepEqual(findRepeatedCompletedTopics([{ title: 'Variables' }], '{invalid'), []);
});

test('retries a duplicate continuation once with explicit topic exclusions', async () => {
  const priorLearningContext = JSON.stringify({ topics: [
    { title: 'Fold a basic paper crane', assessments: [], progress: [{ status: 'COMPLETED' }] },
  ] });
  const outputs = [
    { title: 'Repeat the crane', summary: 'Repeat the same fold.', topics: [
      { key: 'repeat', title: 'Fold a basic paper crane', description: 'Repeat the folds.', learningObjectives: ['Fold a crane.'], estimatedMinutes: 20, prerequisiteKeys: [] },
      { key: 'repeat2', title: 'Practise the paper crane', description: 'Repeat the same fold again.', learningObjectives: ['Fold a crane again.'], estimatedMinutes: 20, prerequisiteKeys: [] },
    ] },
    { title: 'Next origami skills', summary: 'Progress to a new model.', topics: [
      { key: 'base', title: 'Create a stable waterbomb base', description: 'Fold and check a waterbomb base.', learningObjectives: ['Make a symmetrical waterbomb base.'], estimatedMinutes: 20, prerequisiteKeys: [] },
      { key: 'box', title: 'Fold a simple origami box', description: 'Use the base folds to create a small box.', learningObjectives: ['Fold a box that holds its shape.'], estimatedMinutes: 20, prerequisiteKeys: ['base'] },
    ] },
  ];
  const prompts = [];
  let calls = 0;
  const result = await generateRoadmap({ ...goal, title: 'Origami', targetOutcome: 'Learn to fold useful origami models', planningDays: 2, chunkNumber: 2, priorLearningContext }, {
    baseUrl: 'http://127.0.0.1:11434/v1',
    model: 'gemma4:e4b',
    fetchImpl: async (_url, options) => {
      prompts.push(JSON.parse(options.body).messages[0].content);
      return mockResponse(outputs[calls++]);
    },
  });
  assert.equal(calls, 2);
  assert.match(prompts[1], /Fold a basic paper crane/);
  assert.match(prompts[1], /Do not reuse these titles/);
  assert.match(result.title, /Chunk 2/);
  assert.equal(result.topics[0].title, 'Create a stable waterbomb base');
});

test('single model request returns a complete roadmap and remaining-effort estimate', async () => {
  const modelOutput = {
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
  let calls = 0;
  let request;
  const result = await generateRoadmap(goal, {
    baseUrl: 'http://127.0.0.1:11434/v1',
    model: 'gemma4:e4b',
    now: new Date('2026-10-22T00:00:00.000Z'),
    fetchImpl: async (url, options) => {
      calls += 1;
      request = { url, body: JSON.parse(options.body) };
      return mockResponse(modelOutput);
    },
  });
  assert.equal(calls, 1);
  assert.equal(request.url, 'http://127.0.0.1:11434/api/chat');
  assert.equal(request.body.model, 'gemma4:e4b');
  assert.equal(request.body.format, 'json');
  assert.equal(request.body.options.num_ctx, Math.max(4096, Math.min(32768, Number.parseInt(process.env.AI_CONTEXT_LENGTH || '16384', 10))));
  assert.equal(request.body.options.num_predict, 3072);
  assert.equal(request.body.think, process.env.AI_REASONING_EFFORT || 'medium');
  assert.deepEqual(result.topics, modelOutput.roadmap.topics);
  assert.equal(result.title, 'First chunk · ' + modelOutput.roadmap.title);
  assert.equal(result.summary, modelOutput.roadmap.summary);
  assert.equal(result.estimatedRemainingMinutes, 900);
  assert.equal(result.learningBrief.modelOutput.roadmap.title, result.title);
  assert.deepEqual(result.learningBrief.modelOutput.roadmap.topics, result.topics);
});

test('uses JSON-only mode for Gemma 4 and schema-constrained format for other local models', async () => {
  let gemmaFormat;
  await generateRoadmap(goal, {
    model: 'gemma4:e4b',
    baseUrl: 'http://127.0.0.1:11434/v1',
    fetchImpl: async (_url, options) => {
      gemmaFormat = JSON.parse(options.body).format;
      return mockResponse({
        estimatedRemainingMinutes: 20, estimateConfidence: 'high',
        roadmap: { title: 'Guitar start', summary: 'Start here.', topics: [] },
      });
    },
  });
  assert.equal(gemmaFormat, 'json');

  let otherFormat;
  await generateRoadmap(goal, {
    model: 'llama3.1',
    baseUrl: 'http://127.0.0.1:11434/v1',
    fetchImpl: async (_url, options) => {
      otherFormat = JSON.parse(options.body).format;
      return mockResponse({ title: 'Guitar start', summary: 'Start here.', topics: [] });
    },
  });
  assert.equal(typeof otherFormat, 'object');
  assert.deepEqual(otherFormat.required, ['title', 'summary', 'topics']);
  assert.equal(Object.hasOwn(otherFormat.properties, 'viable'), false);
});

test('does not make a second request when the model returns malformed JSON', async () => {
  let calls = 0;
  await assert.rejects(
    generateRoadmap(goal, {
      baseUrl: 'http://127.0.0.1:11434/v1',
      fetchImpl: async () => {
        calls += 1;
        return { ok: true, json: async () => ({ message: { content: 'Here is the plan: {"title":' } }) };
      },
    }),
    (error) => error instanceof ExperimentalRoadmapGenerationError && error.code === 'ROADMAP_INVALID_MODEL_JSON',
  );
  assert.equal(calls, 1);
});

test('does not make a second request when valid JSON omits roadmap content', async () => {
  let calls = 0;
  await assert.rejects(
    generateRoadmap(goal, {
      baseUrl: 'http://127.0.0.1:11434/v1',
      fetchImpl: async () => {
        calls += 1;
        return mockResponse({ reason: 'This goal is achievable.' });
      },
    }),
    (error) => error instanceof ExperimentalRoadmapGenerationError
      && error.code === 'ROADMAP_MISSING_CONTENT'
      && /One model request was used/.test(error.message),
  );
  assert.equal(calls, 1);
});

test('roadmap generation does not require or act on a viability decision', async () => {
  const result = await generateRoadmap(goal, {
    baseUrl: 'http://127.0.0.1:11434/v1',
    fetchImpl: async () => mockResponse({
      title: 'A realistic roadmap',
      summary: 'A useful plan for the available time.',
      topics: [{
        key: 'start',
        title: 'Start with the fundamentals',
        description: 'Build the first useful skill.',
        learningObjectives: ['Demonstrate the skill.'],
        estimatedMinutes: 25,
        prerequisiteKeys: [],
      }],
    }),
  });
  assert.equal(result.title, 'First chunk · A realistic roadmap');
  assert.equal(result.topics.length, 1);
  assert.equal(Object.hasOwn(result.learningBrief.modelOutput, 'viable'), false);
});

test('limits generation to the requested rolling chunk and scales the output budget', async () => {
  let requestBody;
  const result = await generateRoadmap({ ...goal, planningDays: 2 }, {
    baseUrl: 'http://127.0.0.1:11434/v1',
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return mockResponse({
        title: 'Next two study days',
        summary: 'A focused chunk, not the full goal plan.',
        topics: [{
          key: 'first-session',
          title: 'First session',
          description: 'Practise one useful skill.',
          learningObjectives: ['Demonstrate the skill.'],
          estimatedMinutes: 25,
          prerequisiteKeys: [],
        }],
      });
    },
  });
  assert.equal(requestBody.options.num_predict, 3072);
  assert.match(requestBody.messages[0].content, /next 2 study days/i);
  assert.match(requestBody.messages[0].content, /not the entire curriculum/i);
  assert.equal(result.topics.length, 1);
});


test('unrestricted initial generation removes prompt and output-token ceilings', async () => {
  const unrestrictedGoal = { ...goal, planningDays: 3, unrestrictedGeneration: true };
  const messages = buildMessages(buildLearnerBrief(unrestrictedGoal, new Date('2026-10-22T00:00:00.000Z')));
  const prompt = messages.map((message) => message.content).join('\\n');
  assert.match(prompt, /complete learning journey/i);
  assert.match(prompt, /not a generation limit/i);
  assert.doesNotMatch(prompt, /Generate only the next 3 study days/i);
  assert.doesNotMatch(prompt, /at most 3 topics/i);

  let localBody;
  await generateRoadmap(unrestrictedGoal, {
    baseUrl: 'http://127.0.0.1:11434/v1',
    model: 'gemma4:e4b',
    fetchImpl: async (_url, options) => {
      localBody = JSON.parse(options.body);
      return mockResponse({ title: 'Full plan', summary: 'Whole journey.', topics: [
        { key: 'one', title: 'One', description: 'Learn.', learningObjectives: ['Do it.'], estimatedMinutes: 20, prerequisiteKeys: [] },
        { key: 'two', title: 'Two', description: 'Practise.', learningObjectives: ['Do it well.'], estimatedMinutes: 20, prerequisiteKeys: ['one'] },
      ] });
    },
  });
  assert.equal(localBody.options.num_predict, -1);

  let hostedBody;
  await generateRoadmap(unrestrictedGoal, {
    baseUrl: 'https://example.test/v1',
    apiKey: 'test-key',
    model: 'test-model',
    fetchImpl: async (_url, options) => {
      hostedBody = JSON.parse(options.body);
      return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({
        title: 'Full plan', summary: 'Whole journey.', topics: [
          { key: 'one', title: 'One', description: 'Learn.', learningObjectives: ['Do it.'], estimatedMinutes: 20, prerequisiteKeys: [] },
          { key: 'two', title: 'Two', description: 'Practise.', learningObjectives: ['Do it well.'], estimatedMinutes: 20, prerequisiteKeys: ['one'] },
        ],
      }) } }] }) };
    },
  });
  assert.equal(Object.hasOwn(hostedBody, 'max_tokens'), false);
});
test('prompt includes prior learning and timing evidence and requires actionable session instructions', () => {
  const priorLearningContext = JSON.stringify({
    nextChunkNumber: 2,
    completedActivities: [{ topic: 'Open chords', sessionFeeling: 'STUCK', learnerReflection: 'Switching is slow.' }],
  });
  const timeCalibrationContext = JSON.stringify({ sampleCount: 3, observedPattern: 'actual time is typically about 20% longer than estimated' });
  const brief = buildLearnerBrief({ ...goal, chunkNumber: 2, priorLearningContext, timeCalibrationContext });
  const prompt = buildMessages(brief).map((message) => message.content).join('\\n');
  assert.equal(brief.chunkNumber, 2);
  assert.equal(brief.priorLearningContext, priorLearningContext);
  assert.equal(brief.timeCalibrationContext, timeCalibrationContext);
  assert.match(prompt, /Switching is slow/);
  assert.match(prompt, /actual time is typically about 20% longer/i);
  assert.match(prompt, /concrete session/i);
  assert.match(prompt, /observable and testable/i);
  assert.match(prompt, /Do not restart the course/i);
});

test('initial chunk generation keeps session count and minutes inside the same study-day budget', async () => {
  const chunkGoal = { ...goal, planningDays: 3, daysPerWeek: 7 };
  const modelTopics = [
    { key: 'tune', title: 'Tune and hold the guitar', description: 'Tune the guitar and check each string.', learningObjectives: ['Tune each string accurately.'], estimatedMinutes: 20, prerequisiteKeys: [] },
    { key: 'em', title: 'Form E minor cleanly', description: 'Form Em and pluck each string.', learningObjectives: ['Play a clean Em chord.'], estimatedMinutes: 25, prerequisiteKeys: ['tune'] },
    { key: 'c', title: 'Form C major cleanly', description: 'Form C and check each string.', learningObjectives: ['Play a clean C chord.'], estimatedMinutes: 25, prerequisiteKeys: ['em'] },
    { key: 'transition', title: 'Change between chords', description: 'Practise Em to C.', learningObjectives: ['Change chords cleanly.'], estimatedMinutes: 25, prerequisiteKeys: ['c'] },
    { key: 'song', title: 'Apply the chord changes', description: 'Play a short progression.', learningObjectives: ['Play the progression.'], estimatedMinutes: 25, prerequisiteKeys: ['transition'] },
  ];
  const result = await generateRoadmap(chunkGoal, {
    baseUrl: 'http://127.0.0.1:11434/v1',
    model: 'gemma4:e4b',
    fetchImpl: async () => mockResponse({
      title: '30-Day Beginner Guitar Song Playbook',
      summary: 'A full 30-day plan for beginner guitar.',
      estimatedRemainingMinutes: 750,
      estimateConfidence: 'low',
      topics: modelTopics,
    }),
  });
  assert.equal(result.topics.length, 3);
  assert.equal(result.topics.reduce((sum, item) => sum + item.estimatedMinutes, 0), 70);
  assert.ok(result.topics.every((item) => item.estimatedMinutes <= 30));
  assert.deepEqual(result.topics.map((item) => item.key), ['tune', 'em', 'c']);
  assert.deepEqual(result.topics[2].prerequisiteKeys, ['em']);
  assert.match(result.title, /^First chunk/i);
  assert.doesNotMatch(result.title, /30-Day/i);
  assert.match(result.summary, /^This chunk/i);
  assert.doesNotMatch(result.summary, /30-day plan/i);
  assert.equal(result.estimatedRemainingMinutes, 750);
  assert.equal(result.learningBrief.modelOutput.topics.length, 3);
});

test('chunk generation rejects estimates that cannot fit two complete sessions into the budget', async () => {
  await assert.rejects(
    generateRoadmap({ ...goal, planningDays: 3, daysPerWeek: 7 }, {
      baseUrl: 'http://127.0.0.1:11434/v1',
      fetchImpl: async () => mockResponse({
        title: 'Guitar chunk',
        summary: 'Start playing.',
        topics: [
          { key: 'long', title: 'Too long', description: 'Too long for a day.', learningObjectives: ['Play it.'], estimatedMinutes: 31, prerequisiteKeys: [] },
          { key: 'next', title: 'Next', description: 'Continue.', learningObjectives: ['Do it.'], estimatedMinutes: 20, prerequisiteKeys: ['long'] },
        ],
      }),
    }),
    (error) => error instanceof ExperimentalRoadmapGenerationError && error.code === 'ROADMAP_CHUNK_BUDGET_INVALID',
  );
});

test('chunk topic fitting uses the requested number of study days, not a calendar-day conversion', () => {
  const topics = [
    { key: 'one', estimatedMinutes: 30, prerequisiteKeys: [] },
    { key: 'two', estimatedMinutes: 30, prerequisiteKeys: ['one'] },
    { key: 'three', estimatedMinutes: 30, prerequisiteKeys: ['two'] },
    { key: 'four', estimatedMinutes: 30, prerequisiteKeys: ['three'] },
  ];
  const fitted = fitTopicsToChunk(topics, buildLearnerBrief({ ...goal, planningDays: 3, daysPerWeek: 5 }));
  assert.equal(fitted.length, 3);
  assert.equal(fitted.reduce((sum, topic) => sum + topic.estimatedMinutes, 0), 90);
});