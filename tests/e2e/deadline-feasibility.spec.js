import { expect, test } from '@playwright/test';

test('deadline outlook explains feasible, over-capacity, and passed-deadline goals on desktop and mobile', async ({ page }) => {
  const goals = [
    { id: 'goal-on-track', skill: 'Java', experience: 'beginner', outcome: 'Build a small Java project', minutesPerDay: 30, daysPerWeek: 5, targetDate: '2026-11-20', status: 'active' },
    { id: 'goal-over-capacity', skill: 'Machine Learning', experience: 'beginner', outcome: 'Train and evaluate a model', minutesPerDay: 30, daysPerWeek: 5, targetDate: '2026-10-24', status: 'active' },
    { id: 'goal-deadline-passed', skill: 'Networking', experience: 'some_experience', outcome: 'Understand routing', minutesPerDay: 45, daysPerWeek: 4, targetDate: '2026-10-20', status: 'active' },
  ];

  const outlooks = {
    'goal-on-track': { status: 'ON_TRACK', targetDate: '2026-11-20', estimatedRemainingMinutes: 60, estimateConfidence: 'high', availableMinutes: 240, availableStudyDays: 10, recommendation: 'The current estimate fits within the available study time. Recheck after each chunk because estimates and pace can change.' },
    'goal-over-capacity': { status: 'OVER_CAPACITY', targetDate: '2026-10-24', estimatedRemainingMinutes: 500, estimateConfidence: 'low', availableMinutes: 48, availableStudyDays: 2, recommendation: 'The estimated remaining work exceeds buffered capacity. Reduce the outcome scope, increase realistic study time, or extend the deadline.' },
    'goal-deadline-passed': { status: 'DEADLINE_PASSED', targetDate: '2026-10-20', estimatedRemainingMinutes: 90, estimateConfidence: 'medium', availableMinutes: 0, availableStudyDays: 0, recommendation: 'The target date has passed. Choose a new date or reduce the goal scope.' },
  };
  const roadmaps = Object.fromEntries(goals.map((goal) => [goal.id, {
    id: `roadmap-${goal.id}`, version: 1, title: `${goal.skill} learning path`, summary: 'Build and demonstrate the target skill.', generationState: 'ACTIVE', topics: [],
    learningBrief: { chunkNumber: 1, planningDays: 3, practiceDays: 3, dailyMinutes: goal.minutesPerDay, plannedDailyMinutes: Math.floor(goal.minutesPerDay * 0.8), availableCapacityMinutes: 90, chunkBudgetMinutes: 72, bufferMinutes: 18, deadlineFeasibility: outlooks[goal.id] },
  }]));

  await page.route('**/api/v1/ready', (route) => route.fulfill({ json: { data: { ready: true } } }));
  await page.route('**/api/v1/auth/me', (route) => route.fulfill({ json: { data: { user: { id: 'user-deadline', name: 'Learner', email: 'learner@example.com' } } } }));
  await page.route('**/api/v1/learning-goals', (route) => route.fulfill({ json: { data: { goals } } }));
  await page.route(/\/api\/v1\/learning-goals\/([^/]+)\/roadmaps$/, (route) => {
    const goalId = route.request().url().match(/learning-goals\/([^/]+)\/roadmaps/)[1];
    return route.fulfill({ json: { data: { roadmaps: [roadmaps[goalId]] } } });
  });
  await page.route(/\/api\/v1\/learning-goals\/([^/]+)\/next-step(?:\?.*)?$/, (route) => route.fulfill({
    json: { data: { recommendation: { action: 'CONTINUE', title: 'Continue learning', reason: 'Keep working toward your goal.' } } },
  }));
  await page.route(/\/api\/v1\/learning-goals\/([^/]+)\/project-milestones$/, (route) => {
    const goalId = route.request().url().match(/learning-goals\/([^/]+)\/project-milestones/)[1];
    return route.fulfill({ json: { data: { roadmapId: roadmaps[goalId].id, deliverable: null, milestones: [] } } });
  });
  await page.route(/\/api\/v1\/learning-goals\/([^/]+)\/missions(?:\?.*)?$/, (route) => route.fulfill({ json: { data: { missions: [], totalXp: 0 } } }));
  await page.route(/\/api\/v1\/learning-goals\/([^/]+)\/missions\/recovery(?:\?.*)?$/, (route) => {
    const goalId = route.request().url().match(/learning-goals\/([^/]+)\/missions\/recovery/)[1];
    return route.fulfill({ json: { data: { roadmapId: roadmaps[goalId].id, missedCount: 0, missedMissions: [], currentWeekMissions: [], hasCurrentPlan: false, canReplan: true, timeZone: 'UTC', weekStartsOn: '2026-10-21' } } });
  });
  await page.route('**/api/v1/gamification**', (route) => route.fulfill({
    json: { data: { level: { level: 1, currentLevelXp: 0, xpToNextLevel: 100 }, currentStreak: 0, completedMissionCount: 0, achievements: [] } },
  }));

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');

  const javaCard = page.getByRole('article').filter({ hasText: 'Java learning path' });
  const mlCard = page.getByRole('article').filter({ hasText: 'Machine Learning learning path' });
  const networkingCard = page.getByRole('article').filter({ hasText: 'Networking learning path' });
  await expect(javaCard.getByText(/Deadline outlook: on track/i)).toBeVisible();
  await expect(javaCard.getByText(/60 min \(high confidence\); buffered capacity: 240 min across 10 study days/i)).toBeVisible();
  await expect(mlCard.getByText(/Deadline outlook: over capacity/i)).toBeVisible();
  await expect(mlCard.getByText(/Reduce the outcome scope, increase realistic study time, or extend the deadline/i)).toBeVisible();
  await expect(networkingCard.getByText(/Deadline outlook: deadline passed/i)).toBeVisible();
  await expect(networkingCard.getByText(/Choose a new date or reduce the goal scope/i)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1440);

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await expect(mlCard.getByText(/Deadline outlook: over capacity/i)).toBeVisible();
  await expect(networkingCard.getByText(/Deadline outlook: deadline passed/i)).toBeVisible();
});
