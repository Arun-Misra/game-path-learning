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
  const address = server.address();
  return callback(`http://127.0.0.1:${address.port}`);
}

function sessionCookie(response) {
  const header = response.headers.get('set-cookie');
  assert.ok(header, 'expected response to set a session cookie');
  return header.split(';', 1)[0];
}

function proposedRoadmap(title) {
  return {
    title,
    summary: 'A staged plan adapted to the learner’s goal and weekly availability.',
    topics: [
      {
        key: 'fundamentals',
        title: 'Fundamentals',
        description: 'Build the foundations needed for later practice.',
        learningObjectives: ['Explain the key concepts'],
        estimatedMinutes: 30,
        prerequisiteKeys: [],
      },
      {
        key: 'guided-practice',
        title: 'Guided practice',
        description: 'Apply the fundamentals in a practical exercise.',
        learningObjectives: ['Complete a guided practical task'],
        estimatedMinutes: 45,
        prerequisiteKeys: ['fundamentals'],
      },
    ],
  };
}

test('database integration: auth, goals, roadmap versions, activation, and user isolation', {
  skip: !testDatabaseUrl && 'Set TEST_DATABASE_URL to an isolated migrated PostgreSQL test database.',
  timeout: 45000,
}, async (t) => {
  const suffix = randomUUID();
  const firstEmail = `integration-first-${suffix}@example.test`;
  const secondEmail = `integration-second-${suffix}@example.test`;

  try {
    await withServer(t, async (baseUrl) => {
      const register = async (email) => {
        const response = await fetch(`${baseUrl}/api/v1/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password: 'integration-test-password' }),
        });
        assert.equal(response.status, 201);
        return { body: await response.json(), cookie: sessionCookie(response) };
      };

      const first = await register(firstEmail);
      const second = await register(secondEmail);
      assert.equal(first.body.data.user.email, firstEmail);
      assert.equal(second.body.data.user.email, secondEmail);

      const me = await fetch(`${baseUrl}/api/v1/auth/me`, {
        headers: { Cookie: first.cookie },
      });
      assert.equal(me.status, 200);
      assert.equal((await me.json()).data.user.id, first.body.data.user.id);

      const createGoal = await fetch(`${baseUrl}/api/v1/learning-goals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: first.cookie },
        body: JSON.stringify({
          skill: 'Learn guitar fingerstyle',
          outcome: 'Play one complete fingerstyle arrangement',
          experience: 'beginner',
          minutesPerDay: 30,
          daysPerWeek: 5,
          userId: second.body.data.user.id,
        }),
      });
      assert.equal(createGoal.status, 201);
      const goal = (await createGoal.json()).data.goal;
      assert.equal(goal.skill, 'Learn guitar fingerstyle');

      const firstGoals = await fetch(`${baseUrl}/api/v1/learning-goals`, {
        headers: { Cookie: first.cookie },
      });
      assert.equal(firstGoals.status, 200);
      assert.deepEqual((await firstGoals.json()).data.goals.map((item) => item.id), [goal.id]);

      const firstCanRead = await fetch(`${baseUrl}/api/v1/learning-goals/${goal.id}`, {
        headers: { Cookie: first.cookie },
      });
      assert.equal(firstCanRead.status, 200);

      const secondCannotRead = await fetch(`${baseUrl}/api/v1/learning-goals/${goal.id}`, {
        headers: { Cookie: second.cookie },
      });
      assert.equal(secondCannotRead.status, 404);

      const firstDraftResponse = await fetch(`${baseUrl}/api/v1/learning-goals/${goal.id}/roadmaps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: first.cookie },
        body: JSON.stringify(proposedRoadmap('Guitar foundations')),
      });
      assert.equal(firstDraftResponse.status, 201);
      const firstDraft = (await firstDraftResponse.json()).data.roadmap;
      assert.equal(firstDraft.version, 1);
      assert.equal(firstDraft.generationState, 'DRAFT');
      assert.equal(firstDraft.topics.length, 2);
      assert.equal(firstDraft.topics[1].prerequisites[0].prerequisite.title, 'Fundamentals');

      const secondDraftResponse = await fetch(`${baseUrl}/api/v1/learning-goals/${goal.id}/roadmaps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: first.cookie },
        body: JSON.stringify(proposedRoadmap('Guitar foundations revised')),
      });
      assert.equal(secondDraftResponse.status, 201);
      const secondDraft = (await secondDraftResponse.json()).data.roadmap;
      assert.equal(secondDraft.version, 2);

      const activate = await fetch(
        `${baseUrl}/api/v1/learning-goals/${goal.id}/roadmaps/${secondDraft.id}/activate`,
        { method: 'POST', headers: { Cookie: first.cookie } },
      );
      assert.equal(activate.status, 200);
      assert.equal((await activate.json()).data.roadmap.generationState, 'ACTIVE');

      const roadmapsResponse = await fetch(`${baseUrl}/api/v1/learning-goals/${goal.id}/roadmaps`, {
        headers: { Cookie: first.cookie },
      });
      assert.equal(roadmapsResponse.status, 200);
      const roadmaps = (await roadmapsResponse.json()).data.roadmaps;
      assert.deepEqual(roadmaps.map((item) => item.version), [2, 1]);
      assert.equal(roadmaps[0].generationState, 'ACTIVE');
      assert.equal(roadmaps[1].generationState, 'SUPERSEDED');

      const secondCannotListRoadmaps = await fetch(
        `${baseUrl}/api/v1/learning-goals/${goal.id}/roadmaps`,
        { headers: { Cookie: second.cookie } },
      );
      assert.equal(secondCannotListRoadmaps.status, 404);

      const login = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: firstEmail.toUpperCase(), password: 'integration-test-password' }),
      });
      assert.equal(login.status, 200);
      const loginCookie = sessionCookie(login);

      const logout = await fetch(`${baseUrl}/api/v1/auth/logout`, {
        method: 'POST',
        headers: { Cookie: loginCookie },
      });
      assert.equal(logout.status, 204);

      const loggedOutMe = await fetch(`${baseUrl}/api/v1/auth/me`, {
        headers: { Cookie: loginCookie },
      });
      assert.equal(loggedOutMe.status, 401);
    });
  } finally {
    await prisma.user.deleteMany({
      where: { email: { in: [firstEmail, secondEmail] } },
    }).catch(() => {});
    await prisma.$disconnect().catch(() => {});
  }
});
