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
    json: { data: { recommendation: { action: 'LEARN_TOPIC', title: 'Implement request validation', reason: 'Continue your next step.' } } },
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
  await page.route('**/api/v1/gamification**', (route) => route.fulfill({
    json: { data: { level: { level: 1 }, streak: { current: 0 }, totalXp: 0, achievements: [] } },
  }));

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
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