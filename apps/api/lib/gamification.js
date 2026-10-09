const XP_PER_LEVEL = 100;

const ACHIEVEMENTS = Object.freeze([
  { key: 'first_mission', title: 'First Steps', description: 'Complete your first learning mission.', threshold: 1, metric: 'missions' },
  { key: 'missions_10', title: 'Building Momentum', description: 'Complete 10 learning missions.', threshold: 10, metric: 'missions' },
  { key: 'xp_100', title: 'Century Club', description: 'Earn 100 XP through learning activity.', threshold: 100, metric: 'xp' },
  { key: 'streak_3', title: 'Three-Day Streak', description: 'Learn on three consecutive calendar days.', threshold: 3, metric: 'streak' },
  { key: 'streak_7', title: 'Week of Learning', description: 'Learn on seven consecutive calendar days.', threshold: 7, metric: 'streak' },
]);

function validTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function localDateKey(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function previousDate(dateKey) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function calculateStreak(activityDates, { timeZone = 'UTC', now = new Date() } = {}) {
  if (!validTimeZone(timeZone)) throw new TypeError('Use a valid IANA time zone.');
  const dates = new Set(activityDates);
  const today = localDateKey(now, timeZone);
  let cursor = dates.has(today) ? today : previousDate(today);
  if (!dates.has(cursor)) return 0;
  let streak = 0;
  while (dates.has(cursor)) {
    streak += 1;
    cursor = previousDate(cursor);
  }
  return streak;
}

function calculateLevel(totalXp) {
  const safeXp = Number.isSafeInteger(totalXp) && totalXp > 0 ? totalXp : 0;
  return {
    level: Math.floor(safeXp / XP_PER_LEVEL) + 1,
    currentLevelXp: safeXp % XP_PER_LEVEL,
    xpToNextLevel: XP_PER_LEVEL - (safeXp % XP_PER_LEVEL),
    totalXp: safeXp,
  };
}

function eligibleAchievements({ totalXp, completedMissionCount, currentStreak }) {
  const metrics = { xp: totalXp, missions: completedMissionCount, streak: currentStreak };
  return ACHIEVEMENTS.filter((achievement) => metrics[achievement.metric] >= achievement.threshold);
}

module.exports = { ACHIEVEMENTS, XP_PER_LEVEL, calculateLevel, calculateStreak, eligibleAchievements, localDateKey, validTimeZone };
