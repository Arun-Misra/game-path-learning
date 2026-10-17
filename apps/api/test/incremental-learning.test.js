const assert = require('node:assert/strict');
const test = require('node:test');
const { buildTimeCalibrationContext, rollForwardRoadmap } = require('../lib/roadmap-service');
const { generateInitialRollingMissions } = require('../lib/mission-service');
const {
  applyChunkBudget,
  getOverlongSessions,
  getJavaBeginnerInstructionIssues,
  normalizeJavaBeginnerContent,
  generateClarifyingQuestions,
  guardUnverifiedSongDetails,
} = require('../lib/roadmap-generator');

function responseFor(value) {
  const content = JSON.stringify(value);
  return { ok: true, status: 200, json: async () => ({ message: { content }, choices: [{ message: { content } }] }) };
}

test('budget check preserves honest estimates and reports an over-budget plan instead of compressing it', () => {
  const roadmap = {
    title: 'First chunk',
    summary: 'Start with practical activities.',
    topics: [
      { key: 'a', title: 'A', description: 'Practice A.', learningObjectives: ['Do A'], estimatedMinutes: 300, prerequisiteKeys: [] },
      { key: 'b', title: 'B', description: 'Practice B.', learningObjectives: ['Do B'], estimatedMinutes: 240, prerequisiteKeys: ['a'] },
      { key: 'c', title: 'C', description: 'Practice C.', learningObjectives: ['Do C'], estimatedMinutes: 180, prerequisiteKeys: ['b'] },
    ],
  };
  const checked = applyChunkBudget(roadmap, 150);
  assert.equal(checked.estimatedTotalMinutes, 720);
  assert.equal(checked.budgetMinutes, 150);
  assert.equal(checked.fitsBudget, false);
  assert.deepEqual(checked.topics.map((topic) => topic.estimatedMinutes), [300, 240, 180]);
  assert.equal(getOverlongSessions(checked, 30).length, 3);
});

test('session-budget audit identifies overlong sessions instead of silently shortening their estimates', () => {
  const roadmap = { topics: [{ key: 'a', title: 'A', estimatedMinutes: 31 }, { key: 'b', title: 'B', estimatedMinutes: 30 }] };
  assert.deepEqual(getOverlongSessions(roadmap, 30).map((topic) => topic.key), ['a']);
});

test('learner time calibration uses median ratios after three valid self-reported sessions', () => {
  const history = [
    { evidence: { actualMinutes: 30 }, mission: { title: 'A', estimatedMinutes: 20, topic: { title: 'A' } } },
    { evidence: { actualMinutes: 60 }, mission: { title: 'B', estimatedMinutes: 30, topic: { title: 'B' } } },
    { evidence: { actualMinutes: 40 }, mission: { title: 'C', estimatedMinutes: 40, topic: { title: 'C' } } },
    { evidence: { actualMinutes: 0 }, mission: { title: 'Ignored', estimatedMinutes: 20, topic: { title: 'Ignored' } } },
  ];
  const calibration = buildTimeCalibrationContext(history);
  assert.equal(calibration.sampleCount, 3);
  assert.equal(calibration.medianRatio, 1.5);
  assert.match(calibration.context, /actual time is typically about 50% longer/i);
  assert.match(calibration.context, /Do not blindly multiply every task by the same ratio/i);
});

test('learner time calibration does not change generation prompts before three valid samples', () => {
  const calibration = buildTimeCalibrationContext([
    { evidence: { actualMinutes: 60 }, mission: { title: 'A', estimatedMinutes: 30, topic: { title: 'A' } } },
    { evidence: { actualMinutes: 30 }, mission: { title: 'B', estimatedMinutes: 30, topic: { title: 'B' } } },
  ]);
  assert.equal(calibration.sampleCount, 2);
  assert.equal(calibration.context, '');
});

test('Java beginner normalization fixes String type claims and flags a missing first program or combined arrays and loops', () => {
  const goal = { title: 'Java DSA', targetOutcome: 'Learn arrays and strings', experienceLevel: 'BEGINNER' };
  const roadmap = { topics: [
    { key: 'basics', title: 'Java basics', description: 'Learn primitive data types (int, boolean, String).', learningObjectives: [] },
    { key: 'combined', title: 'Loops and Introduction to Arrays', description: 'Learn loops and arrays.', estimatedMinutes: 30, learningObjectives: [] },
  ] };
  const normalized = normalizeJavaBeginnerContent(roadmap, goal);
  assert.match(normalized.topics[0].description, /String is a reference type|reference type String/i);
  assert.doesNotMatch(normalized.topics[0].description, /primitive data types \\(int, boolean, String\\)/i);
  assert.deepEqual(getJavaBeginnerInstructionIssues(normalized, goal).map((issue) => issue.code), ['MISSING_FIRST_RUNNABLE_PROGRAM', 'COMBINED_NEW_ARRAYS_AND_LOOPS']);
});

test('AI clarification generator returns validated goal specific questions, uses native Ollama context, and enables thinking', async () => {
  const requests = [];
  const result = await generateClarifyingQuestions({
    title: 'Guitar',
    targetOutcome: 'Play a named song from beginning to end',
    experienceLevel: 'BEGINNER',
    minutesPerDay: 30,
    daysPerWeek: 5,
    originalDescription: 'I have an acoustic guitar.',
  }, {
    baseUrl: 'http://127.0.0.1:11434/v1',
    fetchImpl: async (url, options) => {
      const body = JSON.parse(options.body);
      body.__url = url;
      requests.push(body);
      return responseFor({
        questions: [
          { key: 'starting_ability', question: 'Which chords can you already play?', reason: 'Avoids reteaching known material.', options: ['None yet', 'A few open chords', 'Several songs'] },
          { key: 'arrangement', question: 'Which arrangement do you want?', reason: 'Changes the techniques needed.', options: ['Simple strumming', 'Fingerstyle', 'Specific tutorial'] },
        ],
      });
    },
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].format.properties.questions.items.properties.question.type, 'string');
  assert.equal(requests[0].think, 'medium');
  assert.equal(requests[0].options.num_ctx, 16384);
  assert.equal(requests[0].__url, 'http://127.0.0.1:11434/api/chat');
  assert.equal(result.questions.length, 2);
  assert.equal(result.questions[0].key, 'starting_ability');
});

test('unverified song-specific details are replaced until a trusted reference is supplied', () => {
  const proposal = {
    topics: [
      { key: 'song-chords', title: 'Identify song chords', description: 'Use C G Am F for the song progression.', learningObjectives: ['Learn song chords'] },
      { key: 'song-rhythm', title: 'Song strumming', description: 'Learn the strumming pattern associated with the song.', learningObjectives: ['Play song pattern'] },
    ],
  };
  const guarded = guardUnverifiedSongDetails(proposal, {
    title: 'Guitar',
    targetOutcome: 'Play a named song from beginning to end',
    learnerClarifications: 'Beginner with acoustic guitar; no reference yet.',
  });
  assert.equal(guarded.topics[0].title, 'Find and verify a trusted song reference');
  assert.doesNotMatch(guarded.topics[1].description, /C G Am F|song progression/i);
  const referenced = guardUnverifiedSongDetails(proposal, {
    title: 'Guitar',
    targetOutcome: 'Play a named song from beginning to end',
    learnerClarifications: 'Follow this trusted tutorial: https://example.test/tutorial',
  });
  assert.equal(referenced.topics[0].title, 'Identify song chords');
});

test('rolling generation does not call the model when three upcoming study days are already scheduled', async () => {
  const db = {
    learningGoal: {
      findFirst: async () => ({
        id: 'goal-1',
        title: 'Learn React',
        targetOutcome: 'Build a React app',
        experienceLevel: 'BEGINNER',
        minutesPerDay: 30,
        daysPerWeek: 5,
        targetDate: null,
        originalDescription: 'Learn React',
      }),
    },
    roadmap: { findFirst: async () => ({ id: 'active-roadmap-1' }) },
    dailyMission: {
      findMany: async () => [
        { scheduledDate: new Date('2026-10-21T00:00:00.000Z') },
        { scheduledDate: new Date('2026-10-22T00:00:00.000Z') },
        { scheduledDate: new Date('2026-10-23T00:00:00.000Z') },
      ],
    },
  };

  const result = await rollForwardRoadmap({
    userId: 'user-1',
    goalId: 'goal-1',
    timeZone: 'UTC',
    now: new Date('2026-10-21T10:00:00.000Z'),
    db,
  });

  assert.equal(result.generated, false);
  assert.equal(result.reason, 'ROLLING_WINDOW_FULL');
  assert.equal(result.pendingDays, 3);
});

test('rolling generation waits until every session for the completed date is finished', async () => {
  let pendingDaysQueried = false;
  const db = {
    learningGoal: {
      findFirst: async () => ({
        id: 'goal-1',
        title: 'Learn React',
        targetOutcome: 'Build a React app',
        experienceLevel: 'BEGINNER',
        minutesPerDay: 30,
        daysPerWeek: 5,
        targetDate: null,
        originalDescription: 'Learn React',
      }),
    },
    roadmap: { findFirst: async () => ({ id: 'active-roadmap-1' }) },
    dailyMission: {
      count: async () => 1,
      findMany: async () => { pendingDaysQueried = true; return []; },
    },
  };

  const result = await rollForwardRoadmap({
    userId: 'user-1',
    goalId: 'goal-1',
    completedDate: '2026-10-21',
    timeZone: 'UTC',
    now: new Date('2026-10-21T10:00:00.000Z'),
    db,
  });

  assert.equal(result.generated, false);
  assert.equal(result.reason, 'DAY_NOT_COMPLETE');
  assert.equal(pendingDaysQueried, false);
});

test('initial mission scheduling prepares at most three study dates within the buffered daily budget', async () => {
  const created = [];
  let listCalls = 0;
  const topics = [
    { id: 'topic-1', title: 'Topic one', description: 'Learn one', learningObjectives: ['Explain one'], estimatedMinutes: 20, position: 0 },
    { id: 'topic-2', title: 'Topic two', description: 'Learn two', learningObjectives: ['Explain two'], estimatedMinutes: 20, position: 1 },
    { id: 'topic-3', title: 'Topic three', description: 'Learn three', learningObjectives: ['Explain three'], estimatedMinutes: 20, position: 2 },
  ];
  const db = {
    learningGoal: { findFirst: async () => ({ id: 'goal-1', minutesPerDay: 30, daysPerWeek: 5, targetDate: null }) },
    roadmap: { findFirst: async () => ({ id: 'roadmap-1', topics }) },
    dailyMission: {
      findMany: async (args) => {
        listCalls += 1;
        if (listCalls === 1) return [];
        return created.map((mission) => ({ ...mission, topic: topics.find((topic) => topic.id === mission.topicId), completion: null }));
      },
      createMany: async ({ data }) => { created.push(...data); return { count: data.length }; },
    },
    xpTransaction: { aggregate: async () => ({ _sum: { amount: 0 } }) },
  };

  const result = await generateInitialRollingMissions({
    userId: 'user-1',
    goalId: 'goal-1',
    timeZone: 'UTC',
    now: new Date('2026-10-21T10:00:00.000Z'),
    db,
  });

  assert.equal(result.missions.length, 3);
  assert.equal(new Set(created.map((mission) => mission.scheduledDate.toISOString().slice(0, 10))).size, 3);
  assert.equal(created.reduce((sum, mission) => sum + mission.estimatedMinutes, 0), 60);
  assert.equal(result.availableMinutes, 72);
  assert.ok(created.every((mission) => mission.estimatedMinutes <= 24));
});
