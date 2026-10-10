


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

test('database integration: auth, goals, roadmaps, assessments, missions, rewards, and user isolation', {
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

      const disposableDraftResponse = await fetch(`${baseUrl}/api/v1/learning-goals/${goal.id}/roadmaps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: first.cookie },
        body: JSON.stringify(proposedRoadmap('Temporary draft to delete')),
      });
      assert.equal(disposableDraftResponse.status, 201);
      const disposableDraft = (await disposableDraftResponse.json()).data.roadmap;
      assert.equal(disposableDraft.version, 3);

      const deleteDraftResponse = await fetch(
        `${baseUrl}/api/v1/learning-goals/${goal.id}/roadmaps/${disposableDraft.id}`,
        { method: 'DELETE', headers: { Cookie: first.cookie } },
      );
      assert.equal(deleteDraftResponse.status, 200);
      assert.deepEqual((await deleteDraftResponse.json()).data, { id: disposableDraft.id, deleted: true });

      const otherUserCannotDeleteDraft = await fetch(
        `${baseUrl}/api/v1/learning-goals/${goal.id}/roadmaps/${firstDraft.id}`,
        { method: 'DELETE', headers: { Cookie: second.cookie } },
      );
      assert.equal(otherUserCannotDeleteDraft.status, 404);

      const activate = await fetch(
        `${baseUrl}/api/v1/learning-goals/${goal.id}/roadmaps/${secondDraft.id}/activate`,
        { method: 'POST', headers: { Cookie: first.cookie } },
      );
      assert.equal(activate.status, 200);
      assert.equal((await activate.json()).data.roadmap.generationState, 'ACTIVE');

      const activeRoadmapDelete = await fetch(
        `${baseUrl}/api/v1/learning-goals/${goal.id}/roadmaps/${secondDraft.id}`,
        { method: 'DELETE', headers: { Cookie: first.cookie } },
      );
      assert.equal(activeRoadmapDelete.status, 409);
      assert.equal((await activeRoadmapDelete.json()).error.code, 'ROADMAP_NOT_DELETABLE');

      const assessmentQuestions = Array.from({ length: 5 }, (_, index) => ({
        key: `assessment-question-${index + 1}`,
        prompt: `Question ${index + 1}: choose the correct option.`,
        options: ['Correct option', 'Wrong option B', 'Wrong option C', 'Wrong option D'],
        answerIndex: 0,
        explanation: 'The first option is correct.',
      }));
      await prisma.topicAssessment.create({
        data: {
          topicId: secondDraft.topics[0].id,
          title: 'Guitar fundamentals check',
          instructions: 'Answer every question.',
          questions: assessmentQuestions,
        },
      });

      const assessmentResponse = await fetch(
        `${baseUrl}/api/v1/learning-goals/${goal.id}/assessments/${secondDraft.topics[0].id}`,
        { headers: { Cookie: first.cookie } },
      );
      assert.equal(assessmentResponse.status, 200);
      const assessmentData = (await assessmentResponse.json()).data;
      assert.equal(assessmentData.assessment.questions.length, 5);
      assert.equal('answerIndex' in assessmentData.assessment.questions[0], false);
      assert.equal('explanation' in assessmentData.assessment.questions[0], false);

      const otherUserAssessmentResponse = await fetch(
        `${baseUrl}/api/v1/learning-goals/${goal.id}/assessments/${secondDraft.topics[0].id}`,
        { headers: { Cookie: second.cookie } },
      );
      assert.equal(otherUserAssessmentResponse.status, 404);

      const attemptResponse = await fetch(
        `${baseUrl}/api/v1/learning-goals/${goal.id}/assessments/${secondDraft.topics[0].id}/attempts`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: first.cookie },
          body: JSON.stringify({
            answers: assessmentQuestions.map((question) => ({ key: question.key, answerIndex: 0 })),
          }),
        },
      );
      assert.equal(attemptResponse.status, 201);
      const attemptData = (await attemptResponse.json()).data;
      assert.equal(attemptData.attempt.score, 100);
      assert.equal(attemptData.attempt.passed, true);
      assert.equal(attemptData.topicProgress.status, 'MASTERED');

      const roadmapsResponse = await fetch(`${baseUrl}/api/v1/learning-goals/${goal.id}/roadmaps`, {
        headers: { Cookie: first.cookie },
      });
      assert.equal(roadmapsResponse.status, 200);
      const roadmaps = (await roadmapsResponse.json()).data.roadmaps;
      assert.deepEqual(roadmaps.map((item) => item.version), [2, 1]);
      assert.equal(roadmaps[0].generationState, 'ACTIVE');
      assert.equal(roadmaps[1].generationState, 'DRAFT');

      const secondCannotListRoadmaps = await fetch(
        `${baseUrl}/api/v1/learning-goals/${goal.id}/roadmaps`,
        { headers: { Cookie: second.cookie } },
      );
      assert.equal(secondCannotListRoadmaps.status, 404);

      const generatedMissionsResponse = await fetch(
        `${baseUrl}/api/v1/learning-goals/${goal.id}/missions/generate?timeZone=UTC`,
        { method: 'POST', headers: { Cookie: first.cookie } },
      );
      assert.equal(generatedMissionsResponse.status, 201);
      const generatedMissions = (await generatedMissionsResponse.json()).data;
      assert.equal(generatedMissions.missions.length, 2);
      assert.ok(generatedMissions.missions.every((mission) => mission.estimatedMinutes <= 30));

      const firstMission = generatedMissions.missions[0];
      const completeFirstMission = async (mission) => fetch(
        `${baseUrl}/api/v1/learning-goals/${goal.id}/missions/${mission.id}/complete`,
        { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: first.cookie }, body: JSON.stringify({}) },
      );
      const firstCompletionResponse = await completeFirstMission(firstMission);
      assert.equal(firstCompletionResponse.status, 200);
      const firstCompletion = (await firstCompletionResponse.json()).data;
      assert.equal(firstCompletion.xpAwarded, 16);
      assert.equal(firstCompletion.totalXp, 16);

      const duplicateCompletionResponse = await completeFirstMission(firstMission);
      assert.equal(duplicateCompletionResponse.status, 200);
      const duplicateCompletion = (await duplicateCompletionResponse.json()).data;
      assert.equal(duplicateCompletion.alreadyCompleted, true);
      assert.equal(duplicateCompletion.xpAwarded, 0);

      const secondMissionResponse = await completeFirstMission(generatedMissions.missions[1]);
      assert.equal(secondMissionResponse.status, 200);
      assert.equal((await secondMissionResponse.json()).data.totalXp, 29);

      const secondUserCannotListMissions = await fetch(
        `${baseUrl}/api/v1/learning-goals/${goal.id}/missions`,
        { headers: { Cookie: second.cookie } },
      );
      assert.equal(secondUserCannotListMissions.status, 404);

      const gamificationResponse = await fetch(
        `${baseUrl}/api/v1/gamification?timeZone=Asia%2FKolkata`,
        { headers: { Cookie: first.cookie } },
      );
      assert.equal(gamificationResponse.status, 200);
      const gamification = (await gamificationResponse.json()).data;
      assert.equal(gamification.level.totalXp, 29);
      assert.equal(gamification.completedMissionCount, 2);
      assert.equal(gamification.currentStreak, 1);
      assert.ok(gamification.achievements.some((item) => item.key === 'first_mission'));
      assert.ok(gamification.newlyUnlocked.some((item) => item.key === 'first_mission'));

      const gamificationAgain = await fetch(
        `${baseUrl}/api/v1/gamification?timeZone=Asia%2FKolkata`,
        { headers: { Cookie: first.cookie } },
      );
      const repeatedSummary = (await gamificationAgain.json()).data;
      assert.equal(repeatedSummary.achievements.filter((item) => item.key === 'first_mission').length, 1);
      assert.deepEqual(repeatedSummary.newlyUnlocked, []);

      const otherUserGamification = await fetch(
        `${baseUrl}/api/v1/gamification?timeZone=UTC`,
        { headers: { Cookie: second.cookie } },
      );
      assert.equal(otherUserGamification.status, 200);
      const otherSummary = (await otherUserGamification.json()).data;
      assert.equal(otherSummary.level.totalXp, 0);
      assert.equal(otherSummary.completedMissionCount, 0);
      assert.deepEqual(otherSummary.achievements, []);

      const invalidTimeZone = await fetch(
        `${baseUrl}/api/v1/gamification?timeZone=Mars%2FOlympus`,
        { headers: { Cookie: first.cookie } },
      );
      assert.equal(invalidTimeZone.status, 400);

      const disposableGoalResponse = await fetch(`${baseUrl}/api/v1/learning-goals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: first.cookie },
        body: JSON.stringify({ skill: 'Disposable goal', outcome: 'Verify goal deletion', experience: 'beginner', minutesPerDay: 30, daysPerWeek: 3 }),
      });
      assert.equal(disposableGoalResponse.status, 201);
      const disposableGoal = (await disposableGoalResponse.json()).data.goal;

      const learningBrief = {
        outcomeRestatement: 'Build and test a small, working result.',
        capabilities: [{ capability: 'Build the result', importance: 'required', evidenceOfSuccess: 'The result works in a repeatable test.' }],
        prerequisiteKnowledge: ['Basic computer use'],
        assumptions: ['Use a local development environment; no cloud hosting was requested.'],
        finalDeliverable: 'A working result with an automated test.',
        outOfScope: ['Cloud deployment'],
      };
      const disposableGoalRoadmap = await fetch(`${baseUrl}/api/v1/learning-goals/${disposableGoal.id}/roadmaps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: first.cookie },
        body: JSON.stringify({ ...proposedRoadmap('Disposable goal roadmap'), learningBrief }),
      });
      assert.equal(disposableGoalRoadmap.status, 201);
      const briefRoadmap = (await disposableGoalRoadmap.json()).data.roadmap;
      assert.deepEqual(briefRoadmap.learningBrief, learningBrief);
      assert.equal(briefRoadmap.learningBriefConfirmedAt, null);

      const activationWithoutConfirmation = await fetch(
        `${baseUrl}/api/v1/learning-goals/${disposableGoal.id}/roadmaps/${briefRoadmap.id}/activate`,
        { method: 'POST', headers: { Cookie: first.cookie }, body: JSON.stringify({}) },
      );
      assert.equal(activationWithoutConfirmation.status, 409);
      assert.equal((await activationWithoutConfirmation.json()).error.code, 'LEARNING_BRIEF_CONFIRMATION_REQUIRED');

      const activationWithConfirmation = await fetch(
        `${baseUrl}/api/v1/learning-goals/${disposableGoal.id}/roadmaps/${briefRoadmap.id}/activate`,
        { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: first.cookie }, body: JSON.stringify({ confirmLearningBrief: true }) },
      );
      assert.equal(activationWithConfirmation.status, 200);
      const confirmedBriefRoadmap = (await activationWithConfirmation.json()).data.roadmap;
      assert.equal(confirmedBriefRoadmap.generationState, 'ACTIVE');
      assert.ok(confirmedBriefRoadmap.learningBriefConfirmedAt);

      const otherUserCannotDeleteGoal = await fetch(`${baseUrl}/api/v1/learning-goals/${disposableGoal.id}`, {
        method: 'DELETE', headers: { Cookie: second.cookie },
      });
      assert.equal(otherUserCannotDeleteGoal.status, 404);

      const deleteGoalResponse = await fetch(`${baseUrl}/api/v1/learning-goals/${disposableGoal.id}`, {
        method: 'DELETE', headers: { Cookie: first.cookie },
      });
      assert.equal(deleteGoalResponse.status, 200);
      assert.deepEqual((await deleteGoalResponse.json()).data, { id: disposableGoal.id, deleted: true });

      const deletedGoalLookup = await fetch(`${baseUrl}/api/v1/learning-goals/${disposableGoal.id}`, {
        headers: { Cookie: first.cookie },
      });
      assert.equal(deletedGoalLookup.status, 404);

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