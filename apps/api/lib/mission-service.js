const { prisma } = require('./prisma');
const { rollForwardRoadmap } = require('./roadmap-service');
const { buildWeeklyMissionPlan, addDays, dateInTimeZone, sessionDayIndexes } = require('./mission-scheduler');

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

  const activeRoadmap = await db.roadmap.findFirst({
    where: { learningGoalId: goalId, generationState: 'ACTIVE' },
    orderBy: { version: 'desc' },
    select: { id: true },
  });
  const [missions, xp] = await Promise.all([
    db.dailyMission.findMany({
      where: {
        userId,
        learningGoalId: goalId,
        ...(activeRoadmap ? { roadmapId: activeRoadmap.id } : {}),
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

async function generateInitialRollingMissions({ userId, goalId, timeZone = 'UTC', now = new Date(), db = prisma }) {
  const goal = await db.learningGoal.findFirst({
    where: { id: goalId, userId },
    select: { id: true, minutesPerDay: true, daysPerWeek: true, targetDate: true },
  });
  if (!goal) throw new MissionServiceError(404, 'GOAL_NOT_FOUND', 'Learning goal not found.');

  const roadmap = await db.roadmap.findFirst({
    where: { learningGoalId: goalId, generationState: 'ACTIVE' },
    orderBy: { version: 'desc' },
    include: { topics: { orderBy: { position: 'asc' }, select: { id: true, title: true, description: true, learningObjectives: true, estimatedMinutes: true, position: true } } },
  });
  if (!roadmap) throw new MissionServiceError(409, 'ACTIVE_ROADMAP_REQUIRED', 'Activate a roadmap before scheduling the first learning sessions.');

  const today = dateInTimeZone(now, timeZone);
  const deadline = goal.targetDate ? goal.targetDate.toISOString().slice(0, 10) : null;
  const existing = await db.dailyMission.findMany({
    where: { userId, learningGoalId: goalId, roadmapId: roadmap.id, scheduledDate: { gte: utcDate(today) }, status: { in: ['SCHEDULED', 'IN_PROGRESS'] } },
    orderBy: [{ scheduledDate: 'asc' }, { createdAt: 'asc' }],
    include: { topic: { select: { id: true, title: true, position: true } }, completion: true },
  });
  if (existing.length > 0) {
    const xp = await db.xpTransaction.aggregate({ where: { userId }, _sum: { amount: true } });
    return { missions: existing, totalXp: xp._sum.amount || 0, from: today, to: existing[existing.length - 1].scheduledDate.toISOString().slice(0, 10), timeZone, alreadyScheduled: true };
  }

  const dayIndexes = new Set(sessionDayIndexes(goal.daysPerWeek));
  const plannedDays = Number.isInteger(roadmap.learningBrief?.planningDays)
    ? Math.min(7, Math.max(1, roadmap.learningBrief.planningDays)) : 3;
  const dates = [];
  for (let offset = 0; offset <= 365 && dates.length < plannedDays; offset += 1) {
    const candidate = addDays(today, offset);
    if (deadline && candidate > deadline) break;
    if (dayIndexes.has(offset % 7)) dates.push(candidate);
  }
  if (dates.length === 0) throw new MissionServiceError(409, 'NO_STUDY_DAYS_BEFORE_DEADLINE', 'There are no study days left before this goal’s target date.');

  const dailyBudget = Math.max(5, Math.floor(goal.minutesPerDay * 0.8));
  const groups = dates.map(() => []);
  let dateIndex = 0;
  let usedMinutes = 0;
  for (const topic of roadmap.topics) {
    if (!Number.isInteger(topic.estimatedMinutes) || topic.estimatedMinutes < 5 || topic.estimatedMinutes > dailyBudget) {
      throw new MissionServiceError(409, 'INITIAL_CHUNK_DAILY_BUDGET_INVALID', 'The first learning chunk contains a session that does not fit the daily time budget. Regenerate a smaller chunk.');
    }
    if (usedMinutes + topic.estimatedMinutes > dailyBudget) {
      dateIndex += 1;
      usedMinutes = 0;
    }
    if (dateIndex >= groups.length) {
      throw new MissionServiceError(409, 'INITIAL_CHUNK_DAILY_BUDGET_INVALID', `The first learning chunk is larger than its ${plannedDays}-study-day schedule can support. Regenerate a smaller chunk.`);
    }
    groups[dateIndex].push(topic);
    usedMinutes += topic.estimatedMinutes;
  }

  const missionRows = [];
  for (let index = 0; index < groups.length; index += 1) {
    for (const topic of groups[index]) {
      missionRows.push({
        userId,
        learningGoalId: goalId,
        roadmapId: roadmap.id,
        topicId: topic.id,
        scheduledDate: utcDate(dates[index]),
        segmentIndex: 0,
        missionType: 'LEARN',
        title: `Learn: ${topic.title}`,
        description: topic.description,
        estimatedMinutes: topic.estimatedMinutes,
        completionCriteria: {
          objectives: Array.isArray(topic.learningObjectives) ? topic.learningObjectives : [],
          instruction: 'Work through the session, practise the topic, and check your result against the learning objectives.',
        },
      });
    }
  }
  if (missionRows.length > 0) await db.dailyMission.createMany({ data: missionRows, skipDuplicates: true });
  const [missions, xp] = await Promise.all([
    db.dailyMission.findMany({
      where: { userId, learningGoalId: goalId, roadmapId: roadmap.id, scheduledDate: { in: dates.map(utcDate) } },
      orderBy: [{ scheduledDate: 'asc' }, { createdAt: 'asc' }],
      include: { topic: { select: { id: true, title: true, position: true } }, completion: true },
    }),
    db.xpTransaction.aggregate({ where: { userId }, _sum: { amount: true } }),
  ]);
  return { missions, totalXp: xp._sum.amount || 0, from: today, to: dates[dates.length - 1], timeZone, alreadyScheduled: false, plannedDays: dates.length, scheduledMinutes: missionRows.reduce((sum, item) => sum + item.estimatedMinutes, 0), availableMinutes: Math.max(5, Math.floor(goal.minutesPerDay)) * dates.length };
}

async function generateWeeklyMissions({ userId, goalId, timeZone = 'UTC', now = new Date(), forceReplan = false, db = prisma }) {
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
          assessment: {
            select: {
              attempts: {
                where: { userId },
                orderBy: { createdAt: 'desc' },
                take: 1,
                select: { score: true },
              },
            },
          },
        },
      },
    },
  });
  if (!roadmap) {
    throw new MissionServiceError(409, 'ACTIVE_ROADMAP_REQUIRED', 'Review and activate a roadmap before generating missions.');
  }

  // Missed sessions should not remain the learner's permanent next action.
  // Expire overdue unfinished sessions, then schedule the still-unfinished topic work
  // into the current week using the existing progress and completed-minute evidence.
  await db.dailyMission.updateMany({
    where: {
      userId,
      learningGoalId: goalId,
      roadmapId: roadmap.id,
      scheduledDate: { lt: start },
      status: { in: ['SCHEDULED', 'IN_PROGRESS'] },
    },
    data: { status: 'EXPIRED' },
  });

  if (forceReplan) {
    const activeSession = await db.dailyMission.findFirst({
      where: {
        userId,
        learningGoalId: goalId,
        roadmapId: roadmap.id,
        scheduledDate: { gte: start, lte: end },
        status: 'IN_PROGRESS',
      },
      select: { id: true, title: true },
    });
    if (activeSession) {
      throw new MissionServiceError(
        409,
        'ACTIVE_SESSION_MUST_FINISH',
        'Finish your in progress session before rebuilding the week. Your current work has been preserved.',
      );
    }

    // Only unstarted sessions are replaced. Completed sessions, evidence, and XP remain untouched.
    await db.dailyMission.deleteMany({
      where: {
        userId,
        learningGoalId: goalId,
        roadmapId: roadmap.id,
        scheduledDate: { gte: start, lte: end },
        status: 'SCHEDULED',
      },
    });
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

  const latestScoreByTopic = new Map(
    roadmap.topics.map((topic) => [topic.id, topic.assessment?.attempts?.[0]?.score ?? null]),
  );
  const completedTopicIds = new Set(
    progress
      .filter((item) => ['COMPLETED', 'MASTERED'].includes(item.status)
        && !(latestScoreByTopic.get(item.topicId) !== null && latestScoreByTopic.get(item.topicId) < 85))
      .map((item) => item.topicId),
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
      estimatedMinutes: latestScoreByTopic.get(topic.id) !== null && latestScoreByTopic.get(topic.id) < 85
        ? Math.min(goal.minutesPerDay, 15)
        : topic.estimatedMinutes - (completedMinutesByTopic.get(topic.id) || 0),
      practiceOnly: latestScoreByTopic.get(topic.id) !== null && latestScoreByTopic.get(topic.id) < 85,
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

async function adaptWeeklyMissions({ userId, goalId, timeZone = 'UTC', now = new Date(), db = prisma }) {
  const result = await generateWeeklyMissions({ userId, goalId, timeZone, now, forceReplan: true, db });
  return { ...result, adapted: true };
}

async function getMissedSessionRecovery({ userId, goalId, timeZone = 'UTC', now = new Date(), db = prisma }) {
  await ownedGoal(db, userId, goalId);
  const today = dateInTimeZone(now, timeZone);
  const start = utcDate(today);
  const end = utcDate(addDays(today, 6));
  const roadmap = await db.roadmap.findFirst({
    where: { learningGoalId: goalId, generationState: 'ACTIVE' },
    orderBy: { version: 'desc' },
    select: { id: true },
  });
  if (!roadmap) {
    throw new MissionServiceError(409, 'ACTIVE_ROADMAP_REQUIRED', 'Activate a roadmap before recovering missed sessions.');
  }

  await db.dailyMission.updateMany({
    where: {
      userId,
      learningGoalId: goalId,
      roadmapId: roadmap.id,
      scheduledDate: { lt: start },
      status: { in: ['SCHEDULED', 'IN_PROGRESS'] },
    },
    data: { status: 'EXPIRED' },
  });

  const [missedCount, missedMissions, currentWeekMissions] = await Promise.all([
    db.dailyMission.count({
      where: { userId, learningGoalId: goalId, roadmapId: roadmap.id, status: 'EXPIRED', recoveredAt: null },
    }),
    db.dailyMission.findMany({
      where: { userId, learningGoalId: goalId, roadmapId: roadmap.id, status: 'EXPIRED', recoveredAt: null },
      orderBy: [{ scheduledDate: 'desc' }, { createdAt: 'desc' }],
      take: 10,
      include: { topic: { select: { id: true, title: true } } },
    }),
    db.dailyMission.findMany({
      where: {
        userId,
        learningGoalId: goalId,
        roadmapId: roadmap.id,
        scheduledDate: { gte: start, lte: end },
        status: { in: ['SCHEDULED', 'IN_PROGRESS'] },
      },
      orderBy: [{ scheduledDate: 'asc' }, { createdAt: 'asc' }],
      include: { topic: { select: { id: true, title: true } } },
    }),
  ]);

  return {
    roadmapId: roadmap.id,
    missedCount,
    missedMissions,
    currentWeekMissions,
    hasCurrentPlan: currentWeekMissions.length > 0,
    canReplan: !currentWeekMissions.some((mission) => mission.status === 'IN_PROGRESS'),
    timeZone,
    weekStartsOn: today,
  };
}

async function recoverMissedSessions({ userId, goalId, timeZone = 'UTC', now = new Date(), db = prisma }) {
  const recovery = await getMissedSessionRecovery({ userId, goalId, timeZone, now, db });
  if (recovery.missedCount === 0) {
    throw new MissionServiceError(409, 'NO_MISSED_SESSIONS', 'There are no missed sessions to recover on the active roadmap.');
  }
  if (!recovery.canReplan) {
    throw new MissionServiceError(
      409,
      'ACTIVE_SESSION_MUST_FINISH',
      'Finish your in progress session before rebuilding the week. Your current work has been preserved.',
    );
  }

  const plan = await generateWeeklyMissions({ userId, goalId, timeZone, now, forceReplan: true, db });
  await db.dailyMission.updateMany({
    where: { userId, learningGoalId: goalId, roadmapId: recovery.roadmapId, status: 'EXPIRED', recoveredAt: null },
    data: { recoveredAt: now },
  });
  return { ...plan, recoveredMissedCount: recovery.missedCount };
}

async function completeMission({ userId, goalId, missionId, evidence, timeZone = 'UTC', db = prisma }) {
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
      : currentTopicProgress?.status === 'COMPLETED' || isTopicComplete
        ? 'COMPLETED'
        : 'IN_PROGRESS';
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

  if (result.alreadyCompleted) return result;

  // Trigger continuation from the server after persisting completion. The client
  // must not be responsible for firing a best-effort background request that can
  // be lost on navigation or refresh. The rolling service decides whether this
  // was the final unfinished session before it calls the model.
  try {
    result.rollingContinuation = await rollForwardRoadmap({
      userId,
      goalId,
      completedDate: result.mission.scheduledDate.toISOString().slice(0, 10),
      timeZone,
      db,
    });
  } catch (error) {
    // Completion and XP are already committed. Preserve that success and return
    // the continuation failure so the UI can show it and let the learner retry.
    result.rollingContinuationError = {
      code: error?.code || 'ROLL_FORWARD_FAILED',
      message: error?.message || 'The next learning chunk could not be prepared.',
    };
  }
  return result;
}

module.exports = { MissionServiceError, listMissions, generateInitialRollingMissions, generateWeeklyMissions, adaptWeeklyMissions, getMissedSessionRecovery, recoverMissedSessions, completeMission };