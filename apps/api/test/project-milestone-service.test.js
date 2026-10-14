const assert = require('node:assert/strict');
const test = require('node:test');
const { buildMilestoneDrafts, ProjectMilestoneServiceError } = require('../lib/project-milestone-service');

test('builds project milestones from confirmed brief capabilities and final deliverable', () => {
  const milestones = buildMilestoneDrafts({
    learningBrief: {
      finalDeliverable: 'A working API with validated requests and integration tests.',
      capabilities: [
        { capability: 'Implement the API', importance: 'required', evidenceOfSuccess: 'GET and POST endpoints return expected results.' },
        { capability: 'Validate requests', importance: 'required', evidenceOfSuccess: 'Malformed requests receive a clear error response.' },
      ],
    },
    topics: [],
  });

  assert.equal(milestones.length, 3);
  assert.equal(milestones[0].title, 'Implement the API');
  assert.match(milestones[0].description, /GET and POST endpoints/);
  assert.deepEqual(milestones[0].successCriteria, [
    'GET and POST endpoints return expected results.',
    'Record what you built, tested, or demonstrated.',
  ]);
  assert.equal(milestones[2].title, 'Deliver and verify the final result');
  assert.match(milestones[2].description, /working API/);
  assert.deepEqual(milestones.map((item) => item.position), [0, 1, 2]);
});

test('falls back to roadmap topics when the brief has no capability list', () => {
  const milestones = buildMilestoneDrafts({
    learningBrief: { finalDeliverable: 'A working prototype', capabilities: [] },
    topics: [{ title: 'Build the core', description: 'Implement the central behavior.', learningObjectives: ['Run the core behavior', 'Test an edge case'] }],
  });

  assert.equal(milestones.length, 2);
  assert.equal(milestones[0].title, 'Build the core');
  assert.deepEqual(milestones[0].successCriteria, ['Run the core behavior', 'Test an edge case']);
});

test('refuses to invent a final deliverable when the learning brief is missing it', () => {
  assert.throws(
    () => buildMilestoneDrafts({ learningBrief: { capabilities: [] }, topics: [] }),
    (error) => error instanceof ProjectMilestoneServiceError && error.code === 'LEARNING_BRIEF_REQUIRED',
  );
});
