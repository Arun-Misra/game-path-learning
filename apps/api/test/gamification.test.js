const assert = require('node:assert/strict');
const test = require('node:test');
const {
  calculateLevel,
  calculateStreak,
  eligibleAchievements,
  localDateKey,
  validTimeZone,
} = require('../lib/gamification');

test('levels advance every 100 XP and report progress to the next level', () => {
  assert.deepEqual(calculateLevel(0), { level: 1, currentLevelXp: 0, xpToNextLevel: 100, totalXp: 0 });
  assert.deepEqual(calculateLevel(99), { level: 1, currentLevelXp: 99, xpToNextLevel: 1, totalXp: 99 });
  assert.deepEqual(calculateLevel(100), { level: 2, currentLevelXp: 0, xpToNextLevel: 100, totalXp: 100 });
  assert.equal(calculateLevel(-10).totalXp, 0);
});

test('streak is based on consecutive local calendar days and tolerates today not yet active', () => {
  const dates = ['2026-10-15', '2026-10-16', '2026-10-17'];
  assert.equal(calculateStreak(dates, { timeZone: 'Asia/Kolkata', now: new Date('2026-10-18T02:00:00Z') }), 3);
  assert.equal(calculateStreak([...dates, '2026-10-18'], { timeZone: 'UTC', now: new Date('2026-10-18T12:00:00Z') }), 4);
  assert.equal(calculateStreak(['2026-10-15'], { timeZone: 'UTC', now: new Date('2026-10-18T12:00:00Z') }), 0);
});

test('timezone conversion handles local date boundaries', () => {
  assert.equal(localDateKey(new Date('2026-10-18T20:00:00Z'), 'Asia/Kolkata'), '2026-10-19');
  assert.equal(validTimeZone('Asia/Kolkata'), true);
  assert.equal(validTimeZone('Mars/Olympus'), false);
  assert.throws(() => calculateStreak([], { timeZone: 'Mars/Olympus' }), /valid IANA time zone/);
});

test('achievement eligibility uses authoritative XP, mission count, and streak metrics', () => {
  const keys = eligibleAchievements({ totalXp: 100, completedMissionCount: 10, currentStreak: 7 }).map(({ key }) => key);
  assert.deepEqual(keys, ['first_mission', 'missions_10', 'xp_100', 'streak_3', 'streak_7']);
  assert.deepEqual(eligibleAchievements({ totalXp: 0, completedMissionCount: 0, currentStreak: 0 }), []);
});
