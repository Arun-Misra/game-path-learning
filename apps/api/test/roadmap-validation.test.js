const assert = require('node:assert/strict');
const test = require('node:test');
const { validatePrerequisiteGraph, validateRoadmap } = require('../lib/roadmap-validation');

function topic(key, prerequisiteKeys = [], overrides = {}) {
  return {
    key,
    title: `Topic ${key}`,
    description: `Learn the core ideas of ${key}.`,
    learningObjectives: [`Explain ${key}`],
    estimatedMinutes: 30,
    prerequisiteKeys,
    ...overrides,
  };
}

function roadmap(topics) {
  return {
    title: 'A personalised learning path',
    summary: 'A staged plan tailored to the learner goal and available time.',
    topics,
  };
}

test('accepts a valid prerequisite graph and returns stable positions and total duration', () => {
  const result = validateRoadmap(roadmap([
    topic('foundations'),
    topic('practice', ['foundations'], { estimatedMinutes: 45 }),
  ]));

  assert.equal(result.success, true);
  assert.deepEqual(result.data.topics.map((item) => item.position), [0, 1]);
  assert.equal(result.data.estimatedTotalMinutes, 75);
});

test('rejects prerequisite references to unknown topics', () => {
  const errors = validatePrerequisiteGraph([
    topic('foundations'),
    topic('practice', ['missing']),
  ]);

  assert.ok(errors.some((error) => error.code === 'UNKNOWN_PREREQUISITE'));
});

test('rejects self-dependencies and duplicate prerequisite edges', () => {
  const errors = validatePrerequisiteGraph([
    topic('foundations', ['foundations', 'foundations']),
    topic('practice'),
  ]);

  assert.ok(errors.some((error) => error.code === 'SELF_PREREQUISITE'));
  assert.ok(errors.some((error) => error.code === 'DUPLICATE_PREREQUISITE'));
});

test('rejects circular prerequisite chains', () => {
  const errors = validatePrerequisiteGraph([
    topic('a', ['c']),
    topic('b', ['a']),
    topic('c', ['b']),
  ]);

  assert.ok(errors.some((error) => error.code === 'PREREQUISITE_CYCLE'));
});

test('rejects duplicate topic keys', () => {
  const errors = validatePrerequisiteGraph([
    topic('same'),
    topic('same'),
  ]);

  assert.ok(errors.some((error) => error.code === 'DUPLICATE_TOPIC_KEY'));
});

test('rejects malformed or undersized roadmaps', () => {
  const result = validateRoadmap(roadmap([topic('only-one')]));
  assert.equal(result.success, false);
  assert.ok(result.errors.some((error) => error.code === 'INVALID_FIELD'));
});

test('supports skill-agnostic objectives and bounded topic durations', () => {
  const valid = validateRoadmap(roadmap([
    topic('listen', [], { title: 'Recognise musical intervals', estimatedMinutes: 20 }),
    topic('practice', ['listen'], { title: 'Sing intervals accurately', estimatedMinutes: 50 }),
  ]));
  assert.equal(valid.success, true);

  const invalid = validateRoadmap(roadmap([
    topic('listen', [], { estimatedMinutes: 2 }),
    topic('practice', ['listen']),
  ]));
  assert.equal(invalid.success, false);
});

test('accepts a complete roadmap with more than forty sessions', () => {
  const topics = Array.from({ length: 45 }, (_, index) => topic(`session-${index + 1}`, index === 0 ? [] : [`session-${index}`]));
  const result = validateRoadmap(roadmap(topics));
  assert.equal(result.success, true);
  assert.equal(result.data.topics.length, 45);
});
