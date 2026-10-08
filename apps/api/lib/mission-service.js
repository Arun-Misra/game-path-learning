const { prisma } = require('./prisma');
const { buildWeeklyMissionPlan, addDays, dateInTimeZone } = require('./mission-scheduler');

class MissionServiceError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function utcDate(dateString) {
  return new Date(`${dateString}T00:00:00.000Z`);
}

async function ownedGoal(db, userId, goalId) {
  const goal = await db.learningGoal.findFirst({
    where: { id: goalId, userId },
    select: { id: true, minutesPerDay: true, daysPerWeek: true },
  });
  if (!goal) throw new MissionServiceError(404, 'GOAL_NOT_FOUND', 'Learning goal not found.');
  return goal;
}

async function listMissions({ userId, goalId, from, to, timeZone = 'UTC', db = prisma }) {
  await ownedGoal(db, userId, goalId);
  const startDate = from || dateInTimeZone(new Date(), timeZone);
  const endDate = to || addDays(startDate, 6);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate < startDate) {
    throw new MissionServiceError(400, 'INVALID_DATE_RANGE', 'Provide a valid date range.');
  }

  const [missions, xp] = await Promise.all([
    db.dailyMission.findMany({
      where: {
        userId,
        learningGoalId: goalId,
        scheduledDate: { gte: utcDate(startDate), lte: utcDate(endDate) },
      },
      orderBy: [{ scheduledDate: 'asc' }, { createdAt: 'asc' }],
      include: {
        topic: { select: { id: true, title: true, position: true } },
        completion: true,
      },
    }),
    db.xpTransaction.aggregate({ where: { userId }, _sum: { amount: true } }),
  ]);

  return {
    missions,
    totalXp: xp._sum.amount || 0,
    from: startDate,
    to: endDate,
    timeZone,
  };
}

async function generateWeeklyMissions({ userId, goalId, timeZone = 'UTC', now = new Date(), db = prisma }) {
  const goal = await ownedGoal(db, userId, goalId);
  const startDate = dateInTimeZone(now, timeZone);
  const endDate = addDays(startDate, 6);
  const start = utcDate(startDate);
  const end = utcDate(endDate);

  const roadmap = await db.roadmap.findFirst({
    where: { learningGoalId: goalId, generationState: 'ACTIVE' },
    orderBy: { version: 'desc' },
    include: {
      topics: {
        orderBy: { position: 'asc' },
        select: {
          id: true,
          title: true,
          description: true,
          learningObjectives: true,
          estimatedMinutes: true,
          position: true,
        },
      },
    },
  });
  if (!roadmap) {
    throw new MissionServiceError(409, 'ACTIVE_ROADMAP_REQUIRED', 'Review and activate a roadmap before generating missions.');
  }

  const existing = await db.dailyMission.findMany({
    where: {
      userId,
      learningGoalId: goalId,
      roadmapId: roadmap.id,
      scheduledDate: { gte: start, lte: end },
      status: { in: ['SCHEDULED', 'IN_PROGRESS'] },
    },
    orderBy: [{ scheduledDate: 'asc' }, { createdAt: 'asc' }],
    include: { topic: { select: { id: true, title: true, position: true } }, completion: true },
  });
  if (existing.length > 0) {
    const [weekMissions, summary] = await Promise.all([
      db.dailyMission.findMany({
        where: {
          userId,
          learningGoalId: goalId,
          roadmapId: roadmap.id,
          scheduledDate: { gte: start, lte: end },
        },
        orderBy: [{ scheduledDate: 'asc' }, { createdAt: 'asc' }],
        include: { topic: { select: { id: true, title: true, position: true } }, completion: true },
      }),
      db.xpTransaction.aggregate({ where: { userId }, _sum: { amount: true } }),
    ]);
    return {
      missions: weekMissions,
      totalXp: summary._sum.amount || 0,
      from: startDate,
      to: endDate,
      timeZone,
      alreadyScheduled: true,
    };
  }

  const [progress, completedMissions] = await Promise.all([
    db.userTopicProgress.findMany({
      where: { userId, topicId: { in: roadmap.topics.map((topic) => topic.id) } },
      select: { topicId: true, status: true },
    }),
    db.dailyMission.findMany({
      where: { userId, roadmapId: roadmap.id, status: 'COMPLETED' },
      select: { topicId: true, estimatedMinutes: true },
    }),
  ]);

  const completedTopicIds = new Set(
    progress.filter((item) => ['COMPLETED', 'MASTERED'].includes(item.status)).map((item) => item.topicId),
  );
  const completedMinutesByTopic = new Map();
  for (const mission of completedMissions) {
    completedMinutesByTopic.set(
      mission.topicId,
      (completedMinutesByTopic.get(mission.topicId) || 0) + mission.estimatedMinutes,
    );
  }

  const remainingTopics = roadmap.topics
    .filter((topic) => !completedTopicIds.has(topic.id))
    .map((topic) => ({
      ...topic,
      estimatedMinutes: topic.estimatedMinutes - (completedMinutesByTopic.get(topic.id) || 0),
    }))
    .filter((topic) => topic.estimatedMinutes >= 5);

  if (remainingTopics.length === 0) {
    const summary = await db.xpTransaction.aggregate({ where: { userId }, _sum: { amount: true } });
    return {
      missions: [],
      totalXp: summary._sum.amount || 0,
      from: startDate,
      to: endDate,
      timeZone,
      message: 'All topics in the active roadmap have already been completed.',
    };
  }

  const plan = buildWeeklyMissionPlan({
    topics: remainingTopics,
    minutesPerDay: goal.minutesPerDay,
    daysPerWeek: goal.daysPerWeek,
    startDate,
    timeZone,
  });
  if (!plan.success) {
    throw new MissionServiceError(400, 'MISSION_SCHEDULE_INVALID', 'The available schedule could not be validated.');
  }

  if (plan.data.missions.length === 0) {
    return {
      missions: [],
      totalXp: 0,
      from: startDate,
      to: endDate,
      timeZone,
      message: 'All topics in the active roadmap have already been scheduled or completed.',
    };
  }

  await db.dailyMission.createMany({
    data: plan.data.missions.map((mission) => ({
      userId,
      learningGoalId: goalId,
      roadmapId: roadmap.id,
      topicId: mission.topicId,
      scheduledDate: utcDate(mission.scheduledDate),
      segmentIndex: mission.segmentIndex,
      missionType: mission.missionType,
      title: mission.title,
      description: mission.description,
      estimatedMinutes: mission.estimatedMinutes,
      completionCriteria: mission.completionCriteria,
    })),
    skipDuplicates: true,
  });

  const [missions, xp] = await Promise.all([
    db.dailyMission.findMany({
      where: {
        userId,
        learningGoalId: goalId,
        roadmapId: roadmap.id,
        scheduledDate: { gte: start, lte: end },
      },
      orderBy: [{ scheduledDate: 'asc' }, { createdAt: 'asc' }],
      include: { topic: { select: { id: true, title: true, position: true } }, completion: true },
    }),
    db.xpTransaction.aggregate({ where: { userId }, _sum: { amount: true } }),
  ]);

  return {
    missions,
    totalXp: xp._sum.amount || 0,
    from: startDate,
    to: endDate,
    timeZone,
    alreadyScheduled: false,
    scheduledMinutes: plan.data.scheduledMinutes,
    availableMinutes: plan.data.availableMinutes,
  };
}

async function completeMission({ userId, goalId, missionId, evidence, db = prisma }) {
  const result = await db.$transaction(async (tx) => {
    await ownedGoal(tx, userId, goalId);
    const mission = await tx.dailyMission.findFirst({
      where: { id: missionId, userId, learningGoalId: goalId },
      include: {
        topic: {
          include: { prerequisites: { select: { prerequisiteId: true } } },
        },
        completion: true,
      },
    });
    if (!mission) throw new MissionServiceError(404, 'MISSION_NOT_FOUND', 'Mission not found.');
    if (mission.status === 'COMPLETED') {
      const existingXp = await tx.xpTransaction.findUnique({ where: { missionId } });
      return { mission, xpAwarded: 0, totalXp: null, alreadyCompleted: true, xpTransaction: existingXp };
    }
    if (!['SCHEDULED', 'IN_PROGRESS'].includes(mission.status)) {
      throw new MissionServiceError(409, 'MISSION_NOT_COMPLETABLE', 'This mission is no longer available to complete.');
    }

    const prerequisiteIds = mission.topic.prerequisites.map((item) => item.prerequisiteId);
    if (prerequisiteIds.length > 0) {
      const prerequisiteProgress = await tx.userTopicProgress.findMany({
        where: { userId, topicId: { in: prerequisiteIds } },
        select: { topicId: true, status: true },
      });
      const completedPrerequisites = new Set(
        prerequisiteProgress.filter((item) => ['COMPLETED', 'MASTERED'].includes(item.status)).map((item) => item.topicId),
      );
      const missing = prerequisiteIds.filter((id) => !completedPrerequisites.has(id));
      if (missing.length > 0) {
        throw new MissionServiceError(409, 'PREREQUISITES_INCOMPLETE', 'Complete the prerequisite topics before this mission.');
      }
    }

    const claimed = await tx.dailyMission.updateMany({
      where: { id: missionId, userId, status: { in: ['SCHEDULED', 'IN_PROGRESS'] } },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
    if (claimed.count !== 1) {
      throw new MissionServiceError(409, 'MISSION_ALREADY_CLAIMED', 'This mission has already been completed.');
    }

    const completedAt = new Date();
    const completion = await tx.missionCompletion.create({
      data: { userId, missionId, completedAt, evidence: evidence === undefined ? undefined : evidence },
    });
    const xpAwarded = Math.min(60, 10 + Math.ceil(mission.estimatedMinutes / 5));
    const xpTransaction = await tx.xpTransaction.create({
      data: {
        userId,
        missionId,
        amount: xpAwarded,
        reason: `Completed mission: ${mission.title}`,
        idempotencyKey: `mission-completion:${missionId}`,
      },
    });

    const completedTopicMinutes = await tx.dailyMission.aggregate({
      where: { userId, roadmapId: mission.roadmapId, topicId: mission.topicId, status: 'COMPLETED' },
      _sum: { estimatedMinutes: true },
    });
    const isTopicComplete = (completedTopicMinutes._sum.estimatedMinutes || 0) >= mission.topic.estimatedMinutes;
    const currentTopicProgress = await tx.userTopicProgress.findUnique({
      where: { userId_topicId: { userId, topicId: mission.topicId } },
      select: { status: true },
    });
    const topicStatus = currentTopicProgress?.status === 'MASTERED'
      ? 'MASTERED'
      : isTopicComplete ? 'COMPLETED' : 'IN_PROGRESS';
    await tx.userTopicProgress.upsert({
      where: { userId_topicId: { userId, topicId: mission.topicId } },
      create: {
        userId,
        topicId: mission.topicId,
        status: topicStatus,
        attempts: 1,
        lastActivityAt: completedAt,
      },
      update: {
        status: topicStatus,
        attempts: { increment: 1 },
        lastActivityAt: completedAt,
      },
    });

    const total = await tx.xpTransaction.aggregate({ where: { userId }, _sum: { amount: true } });
    return {
      mission: { ...mission, status: 'COMPLETED', completedAt, completion },
      xpAwarded,
      totalXp: total._sum.amount || 0,
      alreadyCompleted: false,
      xpTransaction,
    };
  });

  return result;
}

module.exports = { MissionServiceError, listMissions, generateWeeklyMissions, completeMission };