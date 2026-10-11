





const assert = require('node:assert/strict');
const test = require('node:test');
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

test('incremental chunk budget never exceeds available focused minutes', () => {
  const roadmap = {
    title: 'First chunk',
    summary: 'Start with practical activities.',
    topics: [
      { key: 'a', title: 'A', description: 'Practice A.', learningObjectives: ['Do A'], estimatedMinutes: 300, prerequisiteKeys: [] },
      { key: 'b', title: 'B', description: 'Practice B.', learningObjectives: ['Do B'], estimatedMinutes: 240, prerequisiteKeys: ['a'] },
      { key: 'c', title: 'C', description: 'Practice C.', learningObjectives: ['Do C'], estimatedMinutes: 180, prerequisiteKeys: ['b'] },
    ],
  };
  const bounded = applyChunkBudget(roadmap, 150);
  assert.equal(bounded.estimatedTotalMinutes, 150);
  assert.ok(bounded.topics.reduce((sum, topic) => sum + topic.estimatedMinutes, 0) <= 150);
  assert.ok(bounded.topics.every((topic) => topic.estimatedMinutes >= 5));
  assert.equal(getOverlongSessions(bounded, 30).length, 3);
});

test('session-budget audit identifies overlong sessions instead of silently shortening their estimates', () => {
  const roadmap = { topics: [{ key: 'a', title: 'A', estimatedMinutes: 31 }, { key: 'b', title: 'B', estimatedMinutes: 30 }] };
  assert.deepEqual(getOverlongSessions(roadmap, 30).map((topic) => topic.key), ['a']);
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