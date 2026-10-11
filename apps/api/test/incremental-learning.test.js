const assert = require('node:assert/strict');
const test = require('node:test');
const {
  applyChunkBudget,
  generateClarifyingQuestions,
  guardUnverifiedSongDetails,
} = require('../lib/roadmap-generator');

function responseFor(value) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content: JSON.stringify(value) } }] }),
  };
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
  assert.equal(bounded.topics.reduce((sum, topic) => sum + topic.estimatedMinutes, 0), 150);
  assert.ok(bounded.topics.every((topic) => topic.estimatedMinutes >= 5));
});

test('AI clarification generator returns validated goal specific questions', async () => {
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
      requests.push(JSON.parse(options.body));
      return responseFor({
        questions: [
          { key: 'starting_ability', question: 'Which chords can you already play?', reason: 'Avoids reteaching known material.', options: ['None yet', 'A few open chords', 'Several songs'] },
          { key: 'arrangement', question: 'Which arrangement do you want?', reason: 'Changes the techniques needed.', options: ['Simple strumming', 'Fingerstyle', 'Specific tutorial'] },
        ],
      });
    },
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].response_format.json_schema.name, 'learning_clarification_questions');
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
