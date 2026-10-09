const { prisma } = require('./prisma');
const {
  ACHIEVEMENTS,
  calculateLevel,
  calculateStreak,
  eligibleAchievements,
  localDateKey,
  validTimeZone,
} = require('./gamification');

class GamificationServiceError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'GamificationServiceError';
    this.status = status;
    this.code = code;
  }
}

async function getGamificationSummary({ userId, timeZone = 'UTC', now = new Date() }) {
  if (!validTimeZone(timeZone)) {
    throw new GamificationServiceError(400, 'INVALID_TIME_ZONE', 'Use a valid IANA time zone.');
  }

  const [xpAggregate, completionCount, completions, storedAchievements] = await Promise.all([
    prisma.xpTransaction.aggregate({ where: { userId }, _sum: { amount: true } }),
    prisma.missionCompletion.count({ where: { userId } }),
    prisma.missionCompletion.findMany({
      where: { userId },
      select: { completedAt: true },
      orderBy: { completedAt: 'desc' },
    }),
    prisma.userAchievement.findMany({ where: { userId }, orderBy: { unlockedAt: 'asc' } }),
  ]);

  const totalXp = Math.max(0, xpAggregate._sum.amount || 0);
  const activityDates = [...new Set(completions.map(({ completedAt }) => localDateKey(completedAt, timeZone)))];
  const currentStreak = calculateStreak(activityDates, { timeZone, now });
  const eligible = eligibleAchievements({ totalXp, completedMissionCount: completionCount, currentStreak });
  const storedKeys = new Set(storedAchievements.map(({ achievementKey }) => achievementKey));
  const newlyUnlocked = eligible.filter(({ key }) => !storedKeys.has(key));

  if (newlyUnlocked.length) {
    await prisma.$transaction(newlyUnlocked.map(({ key }) => prisma.userAchievement.upsert({
      where: { userId_achievementKey: { userId, achievementKey: key } },
      create: { userId, achievementKey: key },
      update: {},
    })));
  }

  const achievementRows = await prisma.userAchievement.findMany({
    where: { userId },
    orderBy: { unlockedAt: 'asc' },
  });
  const definitions = new Map(ACHIEVEMENTS.map((achievement) => [achievement.key, achievement]));
  const achievements = achievementRows
    .map((row) => ({ ...definitions.get(row.achievementKey), unlockedAt: row.unlockedAt }))
    .filter((achievement) => achievement.key);

  return {
    level: calculateLevel(totalXp),
    currentStreak,
    completedMissionCount: completionCount,
    activityDates,
    achievements,
    newlyUnlocked: achievements.filter(({ key }) => newlyUnlocked.some((item) => item.key === key)),
    timeZone,
    asOfDate: localDateKey(now, timeZone),
  };
}

module.exports = { GamificationServiceError, getGamificationSummary };