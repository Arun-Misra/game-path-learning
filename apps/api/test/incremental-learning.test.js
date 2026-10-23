const assert = require('node:assert/strict');
const test = require('node:test');
const { buildTimeCalibrationContext, buildDeadlineFeasibility, rollForwardRoadmap, buildPriorLearningContext, buildContinuationSummary } = require('../lib/roadmap-service');
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

test('follow-up context preserves four-chunk continuity and uses the latest assessment attempt', () => {
  const active = {
    id: 'roadmap-4', version: 4, title: 'Chunk four', summary: 'Recent work',
    learningBrief: { chunkNumber: 4, estimatedRemainingMinutes: 600, estimateConfidence: 'medium' },
    topics: [{
      title: 'Binary Search', description: 'Search a sorted array.', learningObjectives: ['Implement binary search'],
      estimatedMinutes: 25, position: 0, userProgress: [{ status: 'MASTERED', masteryScore: 94 }],
      assessment: { attempts: [{ score: 62, passed: false, createdAt: new Date('2026-10-21T10:00:00Z') }, { score: 96, passed: true, createdAt: new Date('2026-10-20T10:00:00Z') }] },
    }],
    missions: [{ title: 'Learn: Binary Search', estimatedMinutes: 25, status: 'COMPLETED', topic: { title: 'Binary Search' } }],
  };
  const previous = {
    id: 'roadmap-3', version: 3, title: 'Chunk three', summary: 'Earlier work', learningBrief: { chunkNumber: 3 },
    topics: [{ title: 'Arrays', description: 'Array operations.', learningObjectives: ['Index arrays'], estimatedMinutes: 20, position: 0, userProgress: [{ status: 'MASTERED', masteryScore: 90 }], assessment: { attempts: [{ score: 91, passed: true }] } }],
    missions: [{ title: 'Learn: Arrays', estimatedMinutes: 20, status: 'COMPLETED', topic: { title: 'Arrays' } }],
  };
  const context = JSON.parse(buildPriorLearningContext(active, [active, previous], 5));
  assert.equal(context.priorChunks.length, 2);
  assert.equal(context.topics.length, 2);
  assert.equal(context.topics[0].assessments[0].score, 62);
  assert.equal(context.topics[1].sourceChunkNumber, 3);
  assert.match(context.continuationRules.join(' '), /completion as evidence that an activity was finished, not proof/i);
});

test('follow-up context carries the learner’s session feeling and reflection into the coaching loop', () => {
  const roadmap = {
    id: 'roadmap-1', version: 1, title: 'First chunk', summary: 'Initial practice',
    learningBrief: { chunkNumber: 1 },
    topics: [],
    missions: [{
      title: 'Practice: Chord changes',
      estimatedMinutes: 20,
      status: 'COMPLETED',
      topic: { title: 'Chord changes' },
      completion: {
        evidence: { sessionFeeling: 'STUCK', reflection: 'I can form both chords, but the transition is slow.', actualMinutes: 32, checklist: [{ objective: 'Change chords cleanly', completed: false }, { objective: 'Keep a steady rhythm', completed: true }] },
        completedAt: new Date('2026-10-21T10:00:00Z'),
      },
    }],
  };
  const context = JSON.parse(buildPriorLearningContext(roadmap, [roadmap], 2));
  assert.equal(context.completedActivities[0].sessionFeeling, 'STUCK');
  assert.match(context.completedActivities[0].learnerReflection, /transition is slow/);
  assert.equal(context.completedActivities[0].actualMinutes, 32);
  assert.deepEqual(context.completedActivities[0].checklist, [{ objective: 'Change chords cleanly', completed: false }, { objective: 'Keep a steady rhythm', completed: true }]);
  assert.match(context.continuationRules.join(' '), /stuck means isolate the obstacle and scaffold a retry/i);
});

test('continuation summary separates recent weak checks from the new chunk focus', () => {
  const prior = JSON.stringify({
    topics: [
      { title: 'Binary Search', assessments: [{ score: 62 }, { score: 96 }], progress: [{ status: 'MASTERED' }] },
      { title: 'Arrays', assessments: [{ score: 91 }], progress: [{ status: 'MASTERED' }] },
      { title: 'Binary Search', assessments: [{ score: 96 }], progress: [{ status: 'MASTERED' }] },
    ],
    incompleteActivities: [{ topic: 'Recursion', status: 'IN_PROGRESS' }],
  });
  const summary = buildContinuationSummary(prior, [{ title: 'Recursive search' }, { title: 'Tree traversal' }]);
  assert.match(summary.heading, /builds on your progress/i);
  assert.match(summary.evidence.join(' '), /Binary Search/);
  assert.doesNotMatch(summary.evidence.join(' '), /at or above 85%: Binary Search/);
  assert.match(summary.evidence.join(' '), /unfinished prior sessions: Recursion/i);
  assert.deepEqual(summary.nextFocus, ['Recursive search', 'Tree traversal']);
});

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
  assert.equal(requests[0].options.num_ctx, Math.max(4096, Math.min(32768, Number.parseInt(process.env.AI_CONTEXT_LENGTH || '16384', 10))));
  assert.equal(requests[0].__url, 'http://127.0.0.1:11434/api/chat');
  assert.equal(result.questions.length, 2);
  assert.equal(result.questions[0].key, 'starting_ability');
});

test('unverified song-specific details are replaced until a trusted reference is supplied', () => {
  const proposal = {
    topics: [
      { key: 'song-chords', title: 'Identify song chords', description: 'Use C G Am F for the song progression.', learningObjectives: ['Learn song chords'] },
      { key: 'song-rhythm', title: 'Song strumming', description: 'Learn the strumming pattern associated with the song.', learningObjectives: ['Play song pattern'] },
      { key: 'first-chord', title: "Mastering the Song's First Chord", description: "Form the song's first chord (e.g., G) and strum it cleanly.", learningObjectives: ['Play the first chord'] },
      { key: 'song-phrase', title: 'Play a phrase from the song', description: 'Combine two chords into a short musical phrase from the song.', learningObjectives: ['Play the phrase'] },
    ],
  };
  const guarded = guardUnverifiedSongDetails(proposal, {
    title: 'Guitar',
    targetOutcome: 'Play a named song from beginning to end',
    learnerClarifications: 'Beginner with acoustic guitar; no reference yet.',
  });
  assert.equal(guarded.topics[0].title, 'Find a trusted song reference and learn one open chord');
  assert.doesNotMatch(guarded.topics[1].description, /C G Am F|song progression/i);
  assert.equal(guarded.topics[1].title, 'Learn a second open chord and practise the change');
  assert.equal(guarded.topics[2].title, 'Build a steady strumming pulse and apply verified song details');
  assert.equal(guarded.topics[3].title, 'Build a steady strumming pulse and apply verified song details');
  assert.doesNotMatch(guarded.topics[3].description, /musical phrase from the song/i);
  const referenced = guardUnverifiedSongDetails(proposal, {
    title: 'Guitar',
    targetOutcome: 'Play a named song from beginning to end',
    learnerClarifications: 'Follow this trusted tutorial: https://example.test/tutorial',
  });
  assert.equal(referenced.topics[0].title, 'Identify song chords');
  const genericOnly = guardUnverifiedSongDetails({
    topics: [
      { key: 'setup', title: 'Tuning and posture', description: 'Tune the guitar and practise posture.' },
      { key: 'first-chord', title: 'Master the Em chord', description: 'Form Em and check each string.' },
      { key: 'second-chord', title: 'Learn C major', description: 'Practise the C major chord shape.' },
    ],
  }, {
    title: 'Guitar',
    targetOutcome: 'Play a named song from beginning to end',
    learnerClarifications: 'Beginner with acoustic guitar; no reference yet.',
  });
  assert.match(genericOnly.topics[2].title, /trusted song reference/i);
  const missingSecondChord = guardUnverifiedSongDetails({
    topics: [
      { key: 'first', title: 'Find a trusted song reference and learn one open chord', description: 'Choose a reference and practise one chord.' },
      { key: 'transition', title: 'Smooth chord transitions', description: 'Practise changing between the two chords.' },
      { key: 'rhythm', title: 'Steady strumming', description: 'Keep a steady rhythm while changing chords.' },
    ],
  }, {
    title: 'Guitar',
    targetOutcome: 'Play a named song from beginning to end',
    learnerClarifications: 'Beginner with acoustic guitar; no reference yet.',
  });
  assert.match(missingSecondChord.topics[1].title, /second open chord/i);
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

test('rolling generation waits until every prior session is finished before superseding its roadmap', async () => {
  let pendingQueried = false;
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
    roadmap: { findFirst: async () => ({ id: 'active-roadmap-1', learningBrief: { planningDays: 7 } }) },
    dailyMission: {
      count: async () => 1,
      findMany: async () => { pendingQueried = true; return []; },
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
  assert.equal(result.reason, 'CHUNK_HAS_UNFINISHED_SESSIONS');
  assert.equal(result.remainingLessons, 1);
  assert.equal(pendingQueried, false);
});

test('initial mission scheduling prepares at most three study dates within learner availability', async () => {
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
  assert.equal(result.availableMinutes, 90);
  assert.ok(created.every((mission) => mission.estimatedMinutes <= 30));
});


test('initial mission scheduling prepares all seven study days for a weekly roadmap', async () => {
  const created = [];
  let listCalls = 0;
  const topics = Array.from({ length: 7 }, (_, index) => ({
    id: 'week-topic-' + index,
    title: 'Week topic ' + index,
    description: 'Practise week topic ' + index,
    learningObjectives: ['Demonstrate week topic ' + index],
    estimatedMinutes: 20,
    position: index,
  }));
  const db = {
    learningGoal: { findFirst: async () => ({ id: 'goal-1', minutesPerDay: 30, daysPerWeek: 7, targetDate: null }) },
    roadmap: { findFirst: async () => ({ id: 'roadmap-week', learningBrief: { planningDays: 7 }, topics }) },
    dailyMission: {
      findMany: async () => {
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
    now: new Date('2026-10-26T10:00:00.000Z'),
    db,
  });

  assert.equal(result.plannedDays, 7);
  assert.equal(new Set(created.map((mission) => mission.scheduledDate.toISOString().slice(0, 10))).size, 7);
  assert.equal(created.length, 7);
  assert.ok(created.every((mission) => mission.estimatedMinutes <= 30));
});

test('weekly rolling generation waits for the active week to finish even when fewer than three days remain', async () => {
  const db = {
    learningGoal: {
      findFirst: async () => ({
        id: 'goal-week', title: 'Java', targetOutcome: 'Practise Java',
        experienceLevel: 'BEGINNER', minutesPerDay: 30, daysPerWeek: 7,
        targetDate: null, originalDescription: 'Practise Java',
      }),
    },
    roadmap: { findFirst: async () => ({ id: 'weekly-roadmap', learningBrief: { planningDays: 7 } }) },
    dailyMission: {
      findMany: async () => [
        { scheduledDate: new Date('2026-10-30T00:00:00.000Z') },
        { scheduledDate: new Date('2026-10-31T00:00:00.000Z') },
      ],
    },
  };
  const result = await rollForwardRoadmap({
    userId: 'user-week', goalId: 'goal-week', timeZone: 'UTC',
    now: new Date('2026-10-29T10:00:00.000Z'), db,
  });
  assert.equal(result.generated, false);
  assert.equal(result.reason, 'ROLLING_WINDOW_FULL');
  assert.equal(result.pendingDays, 2);
});

test('deadline feasibility compares remaining effort with learner study availability', () => {
  const goal = {
    minutesPerDay: 60,
    daysPerWeek: 7,
    targetDate: new Date('2026-10-24T00:00:00.000Z'),
  };
  const now = new Date('2026-10-21T10:00:00.000Z');
  const onTrack = buildDeadlineFeasibility({ goal, estimatedRemainingMinutes: 100, estimateConfidence: 'high', now, timeZone: 'UTC' });
  assert.equal(onTrack.status, 'ON_TRACK');
  assert.equal(onTrack.availableStudyDays, 4);
  assert.equal(onTrack.availableMinutes, 240);
  assert.equal(onTrack.marginMinutes, 140);

  const atRisk = buildDeadlineFeasibility({ goal, estimatedRemainingMinutes: 225, estimateConfidence: 'medium', now, timeZone: 'UTC' });
  assert.equal(atRisk.status, 'AT_RISK');

  const overCapacity = buildDeadlineFeasibility({ goal, estimatedRemainingMinutes: 500, estimateConfidence: 'low', now, timeZone: 'UTC' });
  assert.equal(overCapacity.status, 'OVER_CAPACITY');
  assert.equal(overCapacity.shortfallMinutes, 260);
  assert.equal(overCapacity.requiredMinutesPerStudyDay, 125);
  assert.equal(overCapacity.additionalMinutesPerStudyDay, 65);
  assert.equal(overCapacity.additionalStudyDaysRequired, 5);
  assert.equal(overCapacity.estimatedExtensionCalendarDays, 5);
  assert.match(overCapacity.recommendation, /260 minutes over available capacity/);
  assert.match(overCapacity.recommendation, /125 minutes per study day/);
  assert.match(overCapacity.recommendation, /reduce the outcome scope/i);
});

test('deadline feasibility is explicit when there is no deadline or the estimate is unavailable', () => {
  const now = new Date('2026-10-21T10:00:00.000Z');
  assert.equal(buildDeadlineFeasibility({ goal: { targetDate: null }, estimatedRemainingMinutes: 100, now }).status, 'NO_DEADLINE');
  assert.equal(buildDeadlineFeasibility({ goal: { targetDate: new Date('2026-10-24T00:00:00.000Z'), daysPerWeek: 5, minutesPerDay: 60 }, now }).status, 'ESTIMATING');
  assert.equal(buildDeadlineFeasibility({ goal: { targetDate: new Date('2026-10-20T00:00:00.000Z'), daysPerWeek: 5, minutesPerDay: 60 }, estimatedRemainingMinutes: 100, now }).status, 'DEADLINE_PASSED');
});

test('a completed rolling generation is returned idempotently for the same goal and trigger date', async () => {
  const generatedRoadmap = { id: 'roadmap-next', title: 'Next chunk', topics: [] };
  const existingMissions = [{ id: 'mission-next', scheduledDate: new Date('2026-10-22T00:00:00.000Z'), status: 'SCHEDULED' }];
  let missionCountCalled = false;
  const db = {
    learningGoal: {
      findFirst: async () => ({
        id: 'goal-1', title: 'Learn React', targetOutcome: 'Build an app',
        experienceLevel: 'BEGINNER', minutesPerDay: 60, daysPerWeek: 7,
        targetDate: null, originalDescription: 'Learn React',
      }),
    },
    roadmap: {
      findFirst: async ({ where }) => where.id === 'roadmap-next' ? generatedRoadmap : { id: 'active-roadmap-2' },
    },
    roadmapGenerationRun: {
      findUnique: async () => ({
        id: 'run-1', status: 'COMPLETED', resultRoadmapId: 'roadmap-next',
        leaseExpiresAt: new Date('2026-10-21T12:00:00.000Z'),
      }),
    },
    dailyMission: {
      count: async () => { missionCountCalled = true; throw new Error('should return the saved generation first'); },
      findMany: async () => existingMissions,
    },
  };

  const result = await rollForwardRoadmap({
    userId: 'user-1', goalId: 'goal-1', completedDate: '2026-10-21',
    now: new Date('2026-10-21T10:00:00.000Z'), db,
  });
  assert.equal(result.generated, false);
  assert.equal(result.reason, 'ALREADY_GENERATED');
  assert.equal(result.roadmap.id, 'roadmap-next');
  assert.equal(result.missions[0].id, 'mission-next');
  assert.equal(missionCountCalled, false);
});

test('a live rolling-generation lease prevents a duplicate cross-instance generation attempt', async () => {
  const db = {
    learningGoal: {
      findFirst: async () => ({
        id: 'goal-1', title: 'Learn React', targetOutcome: 'Build an app',
        experienceLevel: 'BEGINNER', minutesPerDay: 60, daysPerWeek: 7,
        targetDate: null, originalDescription: 'Learn React',
      }),
    },
    roadmap: { findFirst: async () => ({ id: 'active-roadmap-1' }) },
    roadmapGenerationRun: {
      findUnique: async () => ({
        id: 'run-1', status: 'GENERATING',
        leaseExpiresAt: new Date('2026-10-21T11:00:00.000Z'),
      }),
    },
    dailyMission: { count: async () => { throw new Error('should not count sessions while another worker owns the lease'); } },
  };

  const result = await rollForwardRoadmap({
    userId: 'user-1', goalId: 'goal-1', completedDate: '2026-10-21',
    now: new Date('2026-10-21T10:00:00.000Z'), db,
  });
  assert.equal(result.generated, false);
  assert.equal(result.reason, 'GENERATION_IN_PROGRESS');
});