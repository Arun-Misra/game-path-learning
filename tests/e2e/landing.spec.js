import { expect, test } from '@playwright/test';

test('desktop landing has the learning story and no horizontal overflow', async ({ page }) => {
  await page.route('**/api/v1/ready', (route) => route.fulfill({ json: { data: { ready: true } } }));
  await page.route('**/api/v1/auth/me', (route) => route.fulfill({ status: 401, json: { error: { code: 'UNAUTHENTICATED', message: 'Sign in required.' } } }));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page).toHaveTitle(/Pathwise/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('.goal-panel-wrap')).toBeVisible();
  await expect(page.locator('.landing-story')).toBeVisible();
  await expect(page.locator('.path-showcase')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1440);
});

test('mobile landing fits viewport and account mode switches to sign-in', async ({ page }) => {
  await page.route('**/api/v1/ready', (route) => route.fulfill({ json: { data: { ready: true } } }));
  await page.route('**/api/v1/auth/me', (route) => route.fulfill({ status: 401, json: { error: { code: 'UNAUTHENTICATED', message: 'Sign in required.' } } }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);

  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('input[name="name"]')).toHaveCount(0);
  await expect(page.locator('input[name="email"]')).toBeVisible();
  await expect(page.locator('input[name="password"]')).toHaveAttribute('placeholder', 'Your password');

  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.locator('input[name="name"]')).toBeVisible();
});

test('dashboard New learning goal reveals a visible form and keeps dark surfaces coherent', async ({ page }) => {
  const goal = {
    id: 'goal-test-1',
    skill: 'Java and DSA',
    experience: 'beginner',
    outcome: 'Solve binary search problems confidently',
    minutesPerDay: 30,
    daysPerWeek: 5,
    status: 'active',
  };
  await page.route('**/api/v1/ready', (route) => route.fulfill({ json: { data: { ready: true } } }));
  await page.route('**/api/v1/auth/me', (route) => route.fulfill({
    json: { data: { user: { id: 'user-test-1', name: 'Learner', email: 'learner@example.com' } } },
  }));
  await page.route('**/api/v1/learning-goals', (route) => route.fulfill({ json: { data: { goals: [goal] } } }));
  await page.route('**/api/v1/learning-goals/goal-test-1/roadmaps', (route) => route.fulfill({ json: { data: { roadmaps: [] } } }));
  await page.route('**/api/v1/learning-goals/goal-test-1/next-step**', (route) => route.fulfill({ json: { data: { recommendation: { action: 'CREATE_ROADMAP', title: 'Build your path', reason: 'Start with a roadmap.' } } } }));
  await page.route('**/api/v1/learning-goals/goal-test-1/missions**', (route) => route.fulfill({ json: { data: { missions: [], totalXp: 0 } } }));
  await page.route(/\/api\/v1\/learning-goals\/goal-test-1\/missions\/recovery(?:\?.*)?$/, (route) => route.fulfill({ json: { data: { roadmapId: null, missedCount: 0, missedMissions: [], currentWeekMissions: [], hasCurrentPlan: false, canReplan: false, timeZone: 'UTC', weekStartsOn: '2026-10-21' } } }));
  await page.route('**/api/v1/learning-goals/goal-test-1/project-milestones', (route) => route.fulfill({ json: { data: { roadmapId: null, deliverable: null, milestones: [] } } }));
  await page.route('**/api/v1/gamification**', (route) => route.fulfill({
    json: { data: { level: { level: 1 }, streak: { current: 0 }, totalXp: 0, achievements: [] } },
  }));

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.locator('.learning-sidebar')).toBeVisible();
  await page.getByRole('button', { name: /New learning goal/ }).click();

  const goalCreate = page.locator('.dashboard-goal-create');
  await expect(goalCreate).toBeVisible();
  await expect(goalCreate).toHaveClass(/is-visible/);
  await expect(goalCreate.locator('input[name="skill"]')).toBeVisible();
  await expect(goalCreate.locator('textarea[name="outcome"]')).toBeVisible();
  await expect(goalCreate.locator('button[type="submit"]')).toContainText('Save my learning goal');
  expect(await goalCreate.evaluate((node) => getComputedStyle(node).opacity)).toBe('1');
  expect(await page.locator('#learning-goals .bg-white').evaluateAll((nodes) =>
    nodes.every((node) => getComputedStyle(node).backgroundColor !== 'rgb(255, 255, 255)'),
  )).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1440);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(goalCreate.locator('input[name="skill"]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('mission player requires a reflection and persists it with completion evidence', async ({ page }) => {
  const goal = {
    id: 'goal-test-1',
    skill: 'Java',
    experience: 'some_experience',
    outcome: 'Build a Java REST API',
    minutesPerDay: 30,
    daysPerWeek: 5,
    status: 'active',
  };
  const mission = {
    id: 'mission-test-1',
    title: 'Practice: REST endpoint validation',
    description: 'Validate a request and check the response.',
    estimatedMinutes: 25,
    scheduledDate: '2026-10-20',
    missionType: 'PRACTICE',
    status: 'SCHEDULED',
    completionCriteria: {
      instruction: 'Validate an example request and verify its response.',
      objectives: ['Reject malformed input', 'Explain the returned status code'],
    },
    topic: { id: 'topic-test-1', title: 'REST endpoint validation' },
  };
  let savedEvidence;
  await page.route('**/api/v1/ready', (route) => route.fulfill({ json: { data: { ready: true } } }));
  await page.route('**/api/v1/auth/me', (route) => route.fulfill({
    json: { data: { user: { id: 'user-test-1', name: 'Learner', email: 'learner@example.com' } } },
  }));
  await page.route('**/api/v1/learning-goals', (route) => route.fulfill({ json: { data: { goals: [goal] } } }));
  await page.route('**/api/v1/learning-goals/goal-test-1/roadmaps', (route) => route.fulfill({
    json: { data: { roadmaps: [{
      id: 'roadmap-test-1',
      version: 1,
      title: 'Java REST API',
      summary: 'Build and test an API.',
      generationState: 'ACTIVE',
      topics: [{
        id: 'topic-test-1',
        title: 'REST endpoint validation',
        description: 'Validate request input.',
        learningObjectives: ['Reject malformed input'],
        estimatedMinutes: 30,
        position: 0,
        prerequisites: [],
      }],
    }] } },
  }));
  await page.route('**/api/v1/learning-goals/goal-test-1/next-step**', (route) => route.fulfill({ json: { data: { recommendation: { action: 'CONTINUE_MISSION', title: 'Practice: REST endpoint validation', reason: 'Continue your next session.' } } } }));
  await page.route('**/api/v1/learning-goals/goal-test-1/project-milestones', (route) => route.fulfill({ json: { data: { roadmapId: 'roadmap-test-1', deliverable: null, milestones: [] } } }));
  await page.route('**/api/v1/learning-goals/goal-test-1/missions/generate**', (route) => route.fulfill({
    json: { data: { missions: [mission], totalXp: 0 } },
  }));
  await page.route('**/api/v1/learning-goals/goal-test-1/missions?**', (route) => route.fulfill({
    json: { data: { missions: [], totalXp: 0 } },
  }));
  await page.route(/\/api\/v1\/learning-goals\/goal-test-1\/missions\/recovery(?:\?.*)?$/, (route) => route.fulfill({ json: { data: { roadmapId: 'roadmap-test-1', missedCount: 0, missedMissions: [], currentWeekMissions: [], hasCurrentPlan: false, canReplan: true, timeZone: 'UTC', weekStartsOn: '2026-10-21' } } }));
  await page.route('**/api/v1/learning-goals/goal-test-1/missions/mission-test-1/complete', async (route) => {
    const body = route.request().postDataJSON();
    savedEvidence = body.evidence;
    await route.fulfill({
      json: { data: { mission: { completedAt: '2026-10-20T12:00:00.000Z' }, xpAwarded: 15, totalXp: 15, alreadyCompleted: false } },
    });
  });
  await page.route('**/api/v1/gamification**', (route) => route.fulfill({
    json: { data: { level: { level: 1 }, streak: { current: 0 }, totalXp: 15, achievements: [] } },
  }));

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Plan this week' }).click();
  await expect(page.getByText('This week’s missions')).toBeVisible();
  await page.getByRole('button', { name: 'Open session' }).click();
  await expect(page.getByText('Success checklist')).toBeVisible();
  await expect(page.getByText('Reject malformed input')).toBeVisible();

  const reflection = page.getByPlaceholder('What did you practise, what result did you get, or what can you now explain?');
  await expect(page.getByRole('button', { name: 'Complete session' })).toBeDisabled();
  await reflection.fill('I rejected invalid input and verified the expected status code.');
  await page.getByRole('button', { name: 'Complete session' }).click();
  await expect(page.getByText('Session completed · XP already recorded')).toBeVisible();
  expect(savedEvidence.reflection).toBe('I rejected invalid input and verified the expected status code.');
  expect(savedEvidence.missionType).toBe('PRACTICE');
});
test('project milestones require evidence and persist progress', async ({ page }) => {
  const goal = {
    id: 'goal-test-1',
    skill: 'Java',
    experience: 'some_experience',
    outcome: 'Build a Java REST API',
    minutesPerDay: 30,
    daysPerWeek: 5,
    status: 'active',
  };
  const roadmap = {
    id: 'roadmap-test-1',
    version: 1,
    title: 'Java REST API',
    summary: 'Build and test an API.',
    generationState: 'ACTIVE',
    learningBrief: {
      finalDeliverable: 'A tested API with request validation.',
      capabilities: [{ capability: 'Implement request validation', evidenceOfSuccess: 'Invalid requests return clear errors.' }],
    },
    topics: [{
      id: 'topic-test-1',
      title: 'Request validation',
      description: 'Validate request input.',
      learningObjectives: ['Reject malformed input'],
      estimatedMinutes: 30,
      position: 0,
      prerequisites: [],
    }],
  };
  const firstMilestone = {
    id: 'milestone-test-1',
    roadmapId: roadmap.id,
    title: 'Implement request validation',
    description: 'Reject malformed requests and return clear errors.',
    successCriteria: ['Invalid requests return clear errors.', 'Record what you tested.'],
    position: 0,
    status: 'PLANNED',
    evidence: null,
    completedAt: null,
  };
  const finalMilestone = {
    id: 'milestone-test-2',
    roadmapId: roadmap.id,
    title: 'Deliver and verify the final result',
    description: 'Bring the work together into the confirmed deliverable.',
    successCriteria: ['Demonstrate the final API.', 'Save verification evidence.'],
    position: 1,
    status: 'PLANNED',
    evidence: null,
    completedAt: null,
  };
  let savedMilestones = [];
  await page.route('**/api/v1/ready', (route) => route.fulfill({ json: { data: { ready: true } } }));
  await page.route('**/api/v1/auth/me', (route) => route.fulfill({
    json: { data: { user: { id: 'user-test-1', name: 'Learner', email: 'learner@example.com' } } },
  }));
  await page.route('**/api/v1/learning-goals', (route) => route.fulfill({ json: { data: { goals: [goal] } } }));
  await page.route('**/api/v1/learning-goals/goal-test-1/roadmaps', (route) => route.fulfill({
    json: { data: { roadmaps: [roadmap] } },
  }));
  await page.route('**/api/v1/learning-goals/goal-test-1/next-step**', (route) => route.fulfill({
    json: { data: {
      recommendation: { action: 'LEARN_TOPIC', title: 'Implement request validation', reason: 'Continue your next step.' },
      masterySummary: {
        totalTopics: 2, masteredCount: 1, completedCount: 0, inProgressCount: 1, notStartedCount: 0,
        dueReviewCount: 1, needsPracticeCount: 1, averageAssessmentScore: 72,
        topics: [
          { id: 'topic-test-1', title: 'Request validation', position: 0, status: 'IN_PROGRESS', latestAssessmentScore: 65, latestAssessmentAt: '2026-10-19T12:00:00.000Z', lastActivityAt: '2026-10-19T12:00:00.000Z', daysSinceActivity: 1, reviewIntervalDays: null, reviewDue: false, needsPractice: true },
          { id: 'topic-test-2', title: 'HTTP basics', position: 1, status: 'MASTERED', latestAssessmentScore: 79, latestAssessmentAt: '2026-09-01T12:00:00.000Z', lastActivityAt: '2026-09-01T12:00:00.000Z', daysSinceActivity: 50, reviewIntervalDays: 7, reviewDue: true, needsPractice: true },
        ],
      },
    } },
  }));
  await page.route('**/api/v1/learning-goals/goal-test-1/project-milestones', (route) => route.fulfill({
    json: { data: { roadmapId: roadmap.id, deliverable: roadmap.learningBrief.finalDeliverable, milestones: savedMilestones } },
  }));
  await page.route('**/api/v1/learning-goals/goal-test-1/project-milestones/generate', async (route) => {
    savedMilestones = [firstMilestone, finalMilestone];
    await route.fulfill({ status: 201, json: { data: { roadmapId: roadmap.id, milestones: savedMilestones, alreadyGenerated: false } } });
  });
  await page.route('**/api/v1/learning-goals/goal-test-1/project-milestones/milestone-test-1', async (route) => {
    const body = route.request().postDataJSON();
    savedMilestones = savedMilestones.map((item) => item.id === firstMilestone.id
      ? { ...item, status: body.status, evidence: body.evidence, completedAt: body.status === 'COMPLETED' ? '2026-10-21T00:00:00.000Z' : null }
      : item);
    await route.fulfill({ json: { data: { milestone: savedMilestones[0] } } });
  });
  await page.route('**/api/v1/learning-goals/goal-test-1/missions**', (route) => route.fulfill({
    json: { data: { missions: [], totalXp: 0 } },
  }));
  await page.route(/\/api\/v1\/learning-goals\/goal-test-1\/missions\/recovery(?:\?.*)?$/, (route) => route.fulfill({ json: { data: { roadmapId: 'roadmap-test-1', missedCount: 0, missedMissions: [], currentWeekMissions: [], hasCurrentPlan: false, canReplan: true, timeZone: 'UTC', weekStartsOn: '2026-10-21' } } }));
  await page.route('**/api/v1/gamification**', (route) => route.fulfill({
    json: { data: { level: { level: 1 }, streak: { current: 0 }, totalXp: 0, achievements: [] } },
  }));

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.getByText('Mastery snapshot')).toBeVisible();
  await expect(page.getByText('Reviews due')).toBeVisible();
  await expect(page.getByText('HTTP basics', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Project milestones' })).toBeVisible();
  await page.getByRole('button', { name: 'Create project plan' }).click();
  await expect(page.getByRole('heading', { name: 'Implement request validation' })).toBeVisible();
  await expect(page.getByText('0 / 2 done')).toBeVisible();
  await page.getByPlaceholder('What did you build, test, or demonstrate? Add links or test results if useful.').first().fill(
    'Implemented request validation and verified malformed requests return the expected error response.',
  );
  await page.getByRole('button', { name: 'Save note' }).first().click();
  await expect(page.getByText('Milestone progress saved.')).toBeVisible();
  expect(savedMilestones[0].evidence).toContain('verified malformed requests');
  await page.getByRole('button', { name: 'Start milestone' }).first().click();
  await expect(page.getByText('in progress', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Complete with evidence' }).first().click();
  await expect(page.getByText('Milestone completed with evidence saved.')).toBeVisible();
  await expect(page.getByText('Evidence saved:')).toBeVisible();
  expect(savedMilestones[0].status).toBe('COMPLETED');
  expect(savedMilestones[0].evidence).toContain('verified malformed requests');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1440);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('missed session recovery replans unfinished work without losing completed rewards', async ({ page }) => {
  const goal = {
    id: 'goal-test-1',
    skill: 'Java',
    experience: 'some_experience',
    outcome: 'Build a Java REST API',
    minutesPerDay: 30,
    daysPerWeek: 5,
    status: 'active',
  };
  const roadmap = {
    id: 'roadmap-test-1',
    version: 1,
    title: 'Java REST API',
    summary: 'Build and test an API.',
    generationState: 'ACTIVE',
    topics: [{
      id: 'topic-test-1',
      title: 'Request validation',
      description: 'Validate request input.',
      learningObjectives: ['Reject malformed input'],
      estimatedMinutes: 30,
      position: 0,
      prerequisites: [],
    }],
  };
  const expiredMission = {
    id: 'mission-expired-1',
    title: 'Missed practice session',
    description: 'This work needs a fresh plan.',
    estimatedMinutes: 20,
    scheduledDate: '2026-10-10T00:00:00.000Z',
    missionType: 'PRACTICE',
    status: 'EXPIRED',
    completionCriteria: { instruction: 'Practise request validation.' },
    topic: { id: 'topic-test-1', title: 'Request validation' },
  };
  const recoveredMission = {
    id: 'mission-recovered-1',
    title: 'Recovery: practise request validation',
    description: 'Resume unfinished work with a fresh session.',
    estimatedMinutes: 20,
    scheduledDate: '2026-10-21T00:00:00.000Z',
    missionType: 'PRACTICE',
    status: 'SCHEDULED',
    completionCriteria: { instruction: 'Practise request validation.', objectives: ['Reject malformed input'] },
    topic: { id: 'topic-test-1', title: 'Request validation' },
  };
  let recoveryData = {
    roadmapId: roadmap.id,
    missedCount: 1,
    missedMissions: [expiredMission],
    currentWeekMissions: [],
    hasCurrentPlan: false,
    canReplan: true,
    timeZone: 'UTC',
    weekStartsOn: '2026-10-21',
  };
  await page.route('**/api/v1/ready', (route) => route.fulfill({ json: { data: { ready: true } } }));
  await page.route('**/api/v1/auth/me', (route) => route.fulfill({
    json: { data: { user: { id: 'user-test-1', name: 'Learner', email: 'learner@example.com' } } },
  }));
  await page.route('**/api/v1/learning-goals', (route) => route.fulfill({ json: { data: { goals: [goal] } } }));
  await page.route('**/api/v1/learning-goals/goal-test-1/roadmaps', (route) => route.fulfill({
    json: { data: { roadmaps: [roadmap] } },
  }));
  await page.route('**/api/v1/learning-goals/goal-test-1/next-step**', (route) => route.fulfill({
    json: { data: { recommendation: { action: 'CONTINUE_MISSION', title: 'Continue practice', reason: 'Resume your next session.' }, masterySummary: null } },
  }));
  await page.route('**/api/v1/learning-goals/goal-test-1/missions?**', (route) => route.fulfill({
    json: { data: { missions: [], totalXp: 42 } },
  }));
  await page.route(/\/api\/v1\/learning-goals\/goal-test-1\/missions\/recovery(?:\?.*)?$/, (route) => route.fulfill({ json: { data: recoveryData } }));
  await page.route('**/api/v1/learning-goals/goal-test-1/missions/recovery/replan**', async (route) => {
    recoveryData = { ...recoveryData, missedCount: 0, missedMissions: [], currentWeekMissions: [recoveredMission], hasCurrentPlan: true };
    await route.fulfill({
      status: 201,
      json: { data: { missions: [recoveredMission], totalXp: 42, from: '2026-10-21', to: '2026-10-27', timeZone: 'UTC', recoveredMissedCount: 1 } },
    });
  });
  await page.route('**/api/v1/learning-goals/goal-test-1/project-milestones', (route) => route.fulfill({
    json: { data: { roadmapId: roadmap.id, deliverable: null, milestones: [] } },
  }));
  await page.route('**/api/v1/gamification**', (route) => route.fulfill({
    json: { data: { level: { level: 1 }, currentStreak: 0, completedMissionCount: 3, totalXp: 42, achievements: [] } },
  }));

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Missed session recovery' })).toBeVisible();
  await expect(page.getByText('Missed practice session')).toBeVisible();
  await page.getByRole('button', { name: 'Create recovery plan' }).click();
  await expect(page.getByText('Recovery plan rebuilt. 1 missed session accounted for; completed sessions and XP were preserved.')).toBeVisible();
  await expect(page.getByText('This week’s missions')).toBeVisible();
  await expect(page.getByText('Recovery: practise request validation')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Missed session recovery' })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1440);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('adaptive dashboard responds differently to a learner needing practice and one due for review', async ({ page }) => {
  const goal = {
    id: 'goal-profile-1',
    skill: 'Data Structures',
    experience: 'some_experience',
    outcome: 'Solve interview problems',
    minutesPerDay: 30,
    daysPerWeek: 5,
    status: 'active',
  };
  const roadmap = {
    id: 'roadmap-profile-1',
    version: 1,
    title: 'Data Structures path',
    summary: 'Build reliable problem solving.',
    generationState: 'ACTIVE',
    topics: [],
  };
  const profiles = {
    needsPractice: {
      recommendation: {
        action: 'REINFORCE_TOPIC',
        title: 'Reinforce: Arrays',
        reason: 'Your latest assessment was 54%. Practise before moving on.',
      },
      masterySummary: {
        totalTopics: 2, masteredCount: 0, completedCount: 1, inProgressCount: 1, notStartedCount: 0,
        dueReviewCount: 0, needsPracticeCount: 1, averageAssessmentScore: 54,
        topics: [
          { id: 'arrays', title: 'Arrays', position: 0, status: 'COMPLETED', latestAssessmentScore: 54, latestAssessmentAt: '2026-10-20T12:00:00.000Z', lastActivityAt: '2026-10-20T12:00:00.000Z', daysSinceActivity: 1, reviewIntervalDays: null, reviewDue: false, needsPractice: true, scoreTrend: 'DECLINING' },
          { id: 'hashing', title: 'Hashing', position: 1, status: 'IN_PROGRESS', latestAssessmentScore: null, latestAssessmentAt: null, lastActivityAt: null, daysSinceActivity: null, reviewIntervalDays: null, reviewDue: false, needsPractice: false, scoreTrend: 'UNKNOWN' },
        ],
      },
    },
    dueReview: {
      recommendation: {
        action: 'REVIEW_TOPIC',
        title: 'Refresh: Binary Search',
        reason: 'Your latest assessment remains strong, but it is time for retrieval practice.',
      },
      masterySummary: {
        totalTopics: 2, masteredCount: 1, completedCount: 1, inProgressCount: 0, notStartedCount: 0,
        dueReviewCount: 1, needsPracticeCount: 0, averageAssessmentScore: 97,
        topics: [
          { id: 'binary-search', title: 'Binary Search', position: 0, status: 'MASTERED', latestAssessmentScore: 97, latestAssessmentAt: '2026-08-01T12:00:00.000Z', lastActivityAt: '2026-08-01T12:00:00.000Z', daysSinceActivity: 81, reviewIntervalDays: 30, reviewDue: true, needsPractice: false, scoreTrend: 'STABLE' },
          { id: 'sorting', title: 'Sorting', position: 1, status: 'COMPLETED', latestAssessmentScore: 97, latestAssessmentAt: '2026-08-01T12:00:00.000Z', lastActivityAt: '2026-08-01T12:00:00.000Z', daysSinceActivity: 81, reviewIntervalDays: null, reviewDue: false, needsPractice: false, scoreTrend: 'STABLE' },
        ],
      },
    },
  };
  let activeProfile = 'needsPractice';
  await page.route('**/api/v1/ready', (route) => route.fulfill({ json: { data: { ready: true } } }));
  await page.route('**/api/v1/auth/me', (route) => route.fulfill({
    json: { data: { user: { id: 'user-profile-1', name: 'Learner', email: 'learner@example.com' } } },
  }));
  await page.route('**/api/v1/learning-goals', (route) => route.fulfill({ json: { data: { goals: [goal] } } }));
  await page.route('**/api/v1/learning-goals/goal-profile-1/roadmaps', (route) => route.fulfill({
    json: { data: { roadmaps: [roadmap] } },
  }));
  await page.route('**/api/v1/learning-goals/goal-profile-1/next-step**', (route) => route.fulfill({
    json: { data: profiles[activeProfile] },
  }));
  await page.route('**/api/v1/learning-goals/goal-profile-1/project-milestones', (route) => route.fulfill({
    json: { data: { roadmapId: roadmap.id, deliverable: null, milestones: [] } },
  }));
  await page.route('**/api/v1/learning-goals/goal-profile-1/missions?**', (route) => route.fulfill({
    json: { data: { missions: [], totalXp: 0 } },
  }));
  await page.route(/\/api\/v1\/learning-goals\/goal-profile-1\/missions\/recovery(?:\?.*)?$/, (route) => route.fulfill({
    json: { data: { roadmapId: roadmap.id, missedCount: 0, missedMissions: [], currentWeekMissions: [], hasCurrentPlan: false, canReplan: true, timeZone: 'UTC', weekStartsOn: '2026-10-21' } },
  }));
  await page.route('**/api/v1/gamification**', (route) => route.fulfill({
    json: { data: { level: { level: 1 }, streak: { current: 0 }, totalXp: 0, achievements: [] } },
  }));

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.getByText('Reinforce: Arrays', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Needs practice', { exact: true })).toBeVisible();
  await expect(page.getByText('54%', { exact: true })).toBeVisible();

  activeProfile = 'dueReview';
  await page.reload();
  await expect(page.getByText('Refresh: Binary Search', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Reviews due', { exact: true })).toBeVisible();
  await expect(page.getByText('Binary Search', { exact: true })).toBeVisible();
  await expect(page.getByText('97%', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1440);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('each saved learning goal shows its own adaptive next step', async ({ page }) => {
  const goals = [
    { id: 'goal-arrays', skill: 'Data Structures', experience: 'some_experience', outcome: 'Solve interview problems', minutesPerDay: 30, daysPerWeek: 5, status: 'active' },
    { id: 'goal-web', skill: 'Web Development', experience: 'beginner', outcome: 'Build a full stack app', minutesPerDay: 45, daysPerWeek: 4, status: 'active' },
  ];
  const roadmaps = {
    'goal-arrays': { id: 'roadmap-arrays', version: 1, title: 'Data Structures path', summary: 'Practice core structures.', generationState: 'ACTIVE', topics: [] },
    'goal-web': { id: 'roadmap-web', version: 1, title: 'Web Development path', summary: 'Build and test an app.', generationState: 'ACTIVE', topics: [] },
  };
  const recommendations = {
    'goal-arrays': {
      recommendation: { action: 'REINFORCE_TOPIC', title: 'Reinforce: Arrays', reason: 'Your latest assessment was 54%. Practise before moving on.' },
      masterySummary: { totalTopics: 1, masteredCount: 0, completedCount: 1, inProgressCount: 0, notStartedCount: 0, dueReviewCount: 0, needsPracticeCount: 1, averageAssessmentScore: 54, topics: [{ id: 'arrays', title: 'Arrays', position: 0, status: 'COMPLETED', latestAssessmentScore: 54, latestAssessmentAt: '2026-10-20T12:00:00.000Z', lastActivityAt: '2026-10-20T12:00:00.000Z', daysSinceActivity: 1, reviewIntervalDays: null, reviewDue: false, needsPractice: true, scoreTrend: 'DECLINING' }] },
    },
    'goal-web': {
      recommendation: { action: 'REVIEW_TOPIC', title: 'Refresh: HTML semantics', reason: 'Your latest assessment is strong, and retrieval review is due.' },
      masterySummary: { totalTopics: 1, masteredCount: 1, completedCount: 0, inProgressCount: 0, notStartedCount: 0, dueReviewCount: 1, needsPracticeCount: 0, averageAssessmentScore: 97, topics: [{ id: 'html', title: 'HTML semantics', position: 0, status: 'MASTERED', latestAssessmentScore: 97, latestAssessmentAt: '2026-08-01T12:00:00.000Z', lastActivityAt: '2026-08-01T12:00:00.000Z', daysSinceActivity: 81, reviewIntervalDays: 30, reviewDue: true, needsPractice: false, scoreTrend: 'STABLE' }] },
    },
  };
  await page.route('**/api/v1/ready', (route) => route.fulfill({ json: { data: { ready: true } } }));
  await page.route('**/api/v1/auth/me', (route) => route.fulfill({ json: { data: { user: { id: 'user-multi', name: 'Learner', email: 'learner@example.com' } } } }));
  await page.route('**/api/v1/learning-goals', (route) => route.fulfill({ json: { data: { goals } } }));
  await page.route(/\/api\/v1\/learning-goals\/([^/]+)\/roadmaps$/, (route) => {
    const goalId = route.request().url().match(/learning-goals\/([^/]+)\/roadmaps/)[1];
    return route.fulfill({ json: { data: { roadmaps: [roadmaps[goalId]] } } });
  });
  await page.route(/\/api\/v1\/learning-goals\/([^/]+)\/next-step(?:\?.*)?$/, (route) => {
    const goalId = route.request().url().match(/learning-goals\/([^/]+)\/next-step/)[1];
    return route.fulfill({ json: { data: recommendations[goalId] } });
  });
  await page.route(/\/api\/v1\/learning-goals\/([^/]+)\/project-milestones$/, (route) => {
    const goalId = route.request().url().match(/learning-goals\/([^/]+)\/project-milestones/)[1];
    return route.fulfill({ json: { data: { roadmapId: roadmaps[goalId].id, deliverable: null, milestones: [] } } });
  });
  await page.route(/\/api\/v1\/learning-goals\/([^/]+)\/missions(?:\?.*)?$/, (route) => route.fulfill({ json: { data: { missions: [], totalXp: 0 } } }));
  await page.route(/\/api\/v1\/learning-goals\/([^/]+)\/missions\/recovery(?:\?.*)?$/, (route) => {
    const goalId = route.request().url().match(/learning-goals\/([^/]+)\/missions\/recovery/)[1];
    return route.fulfill({ json: { data: { roadmapId: roadmaps[goalId].id, missedCount: 0, missedMissions: [], currentWeekMissions: [], hasCurrentPlan: false, canReplan: true, timeZone: 'UTC', weekStartsOn: '2026-10-21' } } });
  });
  await page.route('**/api/v1/gamification**', (route) => route.fulfill({ json: { data: { level: { level: 1 }, streak: { current: 0 }, totalXp: 0, achievements: [] } } }));

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.getByText('2 goals saved')).toBeVisible();
  await expect(page.getByText('Reinforce: Arrays', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Refresh: HTML semantics', { exact: true }).first()).toBeVisible();
  const arraysCard = page.getByRole('article').filter({ hasText: 'Data Structures' });
  const webCard = page.getByRole('article').filter({ hasText: 'Web Development' });
  await expect(arraysCard.getByText('Reinforce: Arrays')).toBeVisible();
  await expect(webCard.getByText('Refresh: HTML semantics')).toBeVisible();
  await expect(arraysCard.getByText('54%', { exact: true })).toBeVisible();
  await expect(webCard.getByText('97%', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('assessment retake refreshes topic mastery and the next recommendation', async ({ page }) => {
  const goal = { id: 'goal-retake', skill: 'Data Structures', experience: 'some_experience', outcome: 'Solve interview problems', minutesPerDay: 30, daysPerWeek: 5, status: 'active' };
  let latestScore = 54;
  let attemptCount = 0;
  const roadmap = {
    id: 'roadmap-retake',
    version: 1,
    title: 'Data Structures path',
    summary: 'Practice and verify core topics.',
    generationState: 'ACTIVE',
    topics: [
      {
        id: 'topic-arrays',
        title: 'Arrays',
        description: 'Understand indexed collections.',
        learningObjectives: ['Read and update elements'],
        estimatedMinutes: 30,
        position: 0,
        prerequisites: [],
        userProgress: [{ status: latestScore >= 85 ? 'MASTERED' : 'COMPLETED', masteryScore: latestScore / 100, attempts: attemptCount, lastActivityAt: '2026-10-20T12:00:00.000Z' }],
        assessment: { attempts: [{ score: latestScore, passed: latestScore >= 70, createdAt: '2026-10-20T12:00:00.000Z' }] },
      },
      {
        id: 'topic-hashing',
        title: 'Hashing',
        description: 'Use hash maps to solve lookup problems.',
        learningObjectives: ['Choose an appropriate hash map'],
        estimatedMinutes: 30,
        position: 1,
        prerequisites: [],
        userProgress: [],
        assessment: { attempts: [] },
      },
    ],
  };
  const refreshRoadmap = () => ({
    ...roadmap,
    topics: roadmap.topics.map((topic) => topic.id === 'topic-arrays' ? {
      ...topic,
      userProgress: [{ status: latestScore >= 85 ? 'MASTERED' : 'COMPLETED', masteryScore: latestScore / 100, attempts: attemptCount, lastActivityAt: '2026-10-21T00:00:00.000Z' }],
      assessment: { attempts: [{ score: latestScore, passed: latestScore >= 70, createdAt: '2026-10-21T00:00:00.000Z' }] },
    } : topic),
  });
  await page.route('**/api/v1/ready', (route) => route.fulfill({ json: { data: { ready: true } } }));
  await page.route('**/api/v1/auth/me', (route) => route.fulfill({ json: { data: { user: { id: 'user-retake', name: 'Learner', email: 'learner@example.com' } } } }));
  await page.route('**/api/v1/learning-goals', (route) => route.fulfill({ json: { data: { goals: [goal] } } }));
  await page.route('**/api/v1/learning-goals/goal-retake/roadmaps', (route) => route.fulfill({ json: { data: { roadmaps: [refreshRoadmap()] } } }));
  await page.route('**/api/v1/learning-goals/goal-retake/next-step**', (route) => {
    const low = latestScore < 85;
    return route.fulfill({ json: { data: {
      recommendation: low
        ? { action: 'REINFORCE_TOPIC', title: 'Reinforce: Arrays', reason: 'Your latest assessment was 54%. Practise before moving on.' }
        : { action: 'LEARN_TOPIC', title: 'Start: Hashing', reason: 'Arrays now have mastery evidence. Continue to the next topic.' },
      masterySummary: {
        totalTopics: 2, masteredCount: latestScore >= 85 ? 1 : 0, completedCount: latestScore >= 85 ? 0 : 1, inProgressCount: 0, notStartedCount: 1,
        dueReviewCount: 0, needsPracticeCount: latestScore < 85 ? 1 : 0, averageAssessmentScore: latestScore,
        topics: [
          { id: 'topic-arrays', title: 'Arrays', position: 0, status: latestScore >= 85 ? 'MASTERED' : 'COMPLETED', latestAssessmentScore: latestScore, latestAssessmentAt: '2026-10-21T00:00:00.000Z', lastActivityAt: '2026-10-21T00:00:00.000Z', daysSinceActivity: 0, reviewIntervalDays: null, reviewDue: false, needsPractice: latestScore < 85, scoreTrend: 'IMPROVING', previousAssessmentScore: 54 },
          { id: 'topic-hashing', title: 'Hashing', position: 1, status: 'NOT_STARTED', latestAssessmentScore: null, latestAssessmentAt: null, lastActivityAt: null, daysSinceActivity: null, reviewIntervalDays: null, reviewDue: false, needsPractice: false, scoreTrend: 'UNKNOWN', previousAssessmentScore: null },
        ],
      },
    } } });
  });
  await page.route('**/api/v1/learning-goals/goal-retake/assessments/topic-arrays/generate', (route) => route.fulfill({
    status: attemptCount === 0 ? 201 : 200,
    json: { data: { alreadyExisted: attemptCount > 0, assessment: {
      id: 'assessment-arrays',
      title: 'Arrays understanding check',
      instructions: 'Choose the best answer.',
      questions: [{ key: 'q1', prompt: 'Which option demonstrates correct array access?', options: ['Incorrect access', 'Correct indexed access'] }],
    } } },
  }));
  await page.route('**/api/v1/learning-goals/goal-retake/assessments/topic-arrays/attempts', async (route) => {
    attemptCount += 1;
    latestScore = attemptCount === 1 ? 54 : 92;
    await route.fulfill({ status: 201, json: { data: {
      attempt: { id: `attempt-${attemptCount}`, score: latestScore, correctCount: attemptCount === 1 ? 0 : 1, questionCount: 1, passed: latestScore >= 70, createdAt: '2026-10-21T00:00:00.000Z' },
      feedback: [{ key: 'q1', correct: latestScore >= 70, explanation: 'Use the array index to access the element.' }],
      topicProgress: { status: latestScore >= 85 ? 'MASTERED' : 'COMPLETED', masteryScore: latestScore / 100 },
    } } });
  });
  let missionState = [{
    id: 'mission-retake',
    topicId: 'topic-arrays',
    scheduledDate: '2026-10-21',
    status: 'SCHEDULED',
    missionType: 'LEARN',
    title: 'Learn: Arrays',
    description: 'Work through array fundamentals.',
    estimatedMinutes: 15,
    completionCriteria: { instruction: 'Explain array access.' },
    topic: { id: 'topic-arrays', title: 'Arrays', position: 0 },
    completion: null,
  }];
  await page.route('**/api/v1/learning-goals/goal-retake/missions?**', (route) => route.fulfill({ json: { data: { missions: missionState, totalXp: 0 } } }));
  await page.route('**/api/v1/learning-goals/goal-retake/missions/adapt?**', async (route) => {
    missionState = [{
      ...missionState[0],
      id: 'mission-retake-practice',
      missionType: 'PRACTICE',
      title: 'Practice: Arrays',
      description: 'Targeted practice after your latest assessment: review array access.',
    }];
    await route.fulfill({ status: 201, json: { data: { missions: missionState, totalXp: 0, adapted: true } } });
  });
  await page.route(/\/api\/v1\/learning-goals\/goal-retake\/missions\/recovery(?:\?.*)?$/, (route) => route.fulfill({ json: { data: { roadmapId: roadmap.id, missedCount: 0, missedMissions: [], currentWeekMissions: [], hasCurrentPlan: false, canReplan: true, timeZone: 'UTC', weekStartsOn: '2026-10-21' } } }));
  await page.route('**/api/v1/learning-goals/goal-retake/project-milestones', (route) => route.fulfill({ json: { data: { roadmapId: roadmap.id, deliverable: null, milestones: [] } } }));
  await page.route('**/api/v1/gamification**', (route) => route.fulfill({ json: { data: { level: { level: 1 }, streak: { current: 0 }, totalXp: 0, achievements: [] } } }));

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.getByText('Reinforce: Arrays', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Take assessment' }).first().click();
  await page.getByLabel('Incorrect access').check();
  await page.getByRole('button', { name: 'Submit assessment' }).click();
  await expect(page.getByText('Score: 54% · Keep practising')).toBeVisible();
  await expect(page.getByText('Reinforce: Arrays', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Adapt this week' })).toBeVisible();
  await page.getByRole('button', { name: 'Adapt this week' }).click();
  await expect(page.getByText(/This week's plan for Data Structures now reflects your latest assessment/)).toBeVisible();
  await expect(page.getByText('Practice: Arrays', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Reload assessment' }).first().click();
  await page.getByLabel('Correct indexed access').check();
  await page.getByRole('button', { name: 'Submit assessment' }).click();
  await expect(page.getByText('Score: 92% · Passed')).toBeVisible();
  await expect(page.getByText('Start: Hashing', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Latest check: 92%')).toBeVisible();
  await expect(page.getByText('Demonstrated understanding', { exact: true }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1440);
});