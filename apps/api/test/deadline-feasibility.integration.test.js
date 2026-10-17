const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const test = require('node:test');

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (testDatabaseUrl) process.env.DATABASE_URL = testDatabaseUrl;

const app = require('../app');
const { prisma } = require('../lib/prisma');

async function withServer(t, callback) {
  const server = app.listen(0);
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  await new Promise((resolve) => server.once('listening', resolve));
  return callback(`http://127.0.0.1:${server.address().port}`);
}

function sessionCookie(response) {
  const header = response.headers.get('set-cookie');
  assert.ok(header, 'expected registration to create a session cookie');
  return header.split(';', 1)[0];
}

test('roadmap listing recalculates deadline outlook instead of serving stale saved status', {
  skip: !testDatabaseUrl && 'Set TEST_DATABASE_URL to an isolated migrated PostgreSQL test database.',
  timeout: 20000,
}, async (t) => {
  const email = `deadline-outlook-${randomUUID()}@example.test`;
  try {
    await withServer(t, async (baseUrl) => {
      const registerResponse = await fetch(`${baseUrl}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'Deadline-test-password-42!', name: 'Deadline Test' }),
      });
      assert.equal(registerResponse.status, 201);
      const cookie = sessionCookie(registerResponse);

      const goalResponse = await fetch(`${baseUrl}/api/v1/learning-goals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          skill: 'Deadline feasibility test',
          outcome: 'Verify deadline status refreshes',
          experience: 'beginner',
          minutesPerDay: 60,
          daysPerWeek: 7,
        }),
      });
      assert.equal(goalResponse.status, 201);
      const goal = (await goalResponse.json()).data.goal;

      const roadmapResponse = await fetch(`${baseUrl}/api/v1/learning-goals/${goal.id}/roadmaps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          title: 'Deadline test roadmap',
          summary: 'A minimal roadmap used to test live deadline calculations.',
          learningBrief: {
            estimatedRemainingMinutes: 30,
            estimateConfidence: 'high',
            deadlineFeasibility: { status: 'AT_RISK', recommendation: 'This saved value should be replaced.' },
          },
          topics: [
            { key: 'basics', title: 'Basics', description: 'Understand the basics.', learningObjectives: ['Explain the basics'], estimatedMinutes: 15, prerequisiteKeys: [] },
            { key: 'practice', title: 'Practice', description: 'Practise the basics.', learningObjectives: ['Complete a small exercise'], estimatedMinutes: 15, prerequisiteKeys: ['basics'] },
          ],
        }),
      });
      assert.equal(roadmapResponse.status, 201);
      const roadmap = (await roadmapResponse.json()).data.roadmap;

      const tomorrow = new Date();
      tomorrow.setUTCHours(0, 0, 0, 0);
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      await prisma.learningGoal.update({ where: { id: goal.id }, data: { targetDate: tomorrow } });

      const feasibleResponse = await fetch(`${baseUrl}/api/v1/learning-goals/${goal.id}/roadmaps?timeZone=UTC`, {
        headers: { Cookie: cookie },
      });
      assert.equal(feasibleResponse.status, 200);
      const feasible = (await feasibleResponse.json()).data.roadmaps.find((item) => item.id === roadmap.id);
      assert.equal(feasible.learningBrief.deadlineFeasibility.status, 'ON_TRACK');
      assert.notEqual(feasible.learningBrief.deadlineFeasibility.recommendation, 'This saved value should be replaced.');

      const yesterday = new Date();
      yesterday.setUTCHours(0, 0, 0, 0);
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      await prisma.learningGoal.update({ where: { id: goal.id }, data: { targetDate: yesterday } });

      const overdueResponse = await fetch(`${baseUrl}/api/v1/learning-goals/${goal.id}/roadmaps?timeZone=UTC`, {
        headers: { Cookie: cookie },
      });
      assert.equal(overdueResponse.status, 200);
      const overdue = (await overdueResponse.json()).data.roadmaps.find((item) => item.id === roadmap.id);
      assert.equal(overdue.learningBrief.deadlineFeasibility.status, 'DEADLINE_PASSED');
      assert.equal(overdue.learningBrief.deadlineFeasibility.availableMinutes, 0);
    });
  } finally {
    await prisma.user.deleteMany({ where: { email } }).catch(() => {});
    await prisma.$disconnect().catch(() => {});
  }
});
