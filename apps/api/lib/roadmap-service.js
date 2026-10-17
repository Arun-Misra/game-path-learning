const { prisma } = require('./prisma');
const { validateRoadmap } = require('./roadmap-validation');
const { generateRoadmap, generateClarifyingQuestions } = require('./roadmap-generator');
const { addDays, dateInTimeZone, sessionDayIndexes } = require('./mission-scheduler');

const rollingGenerationLocks = new Set();

class RoadmapServiceError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function getValidatedRoadmap(input) {
  const result = validateRoadmap(input);
  if (!result.success) {
    throw new RoadmapServiceError(400, 'INVALID_ROADMAP', 'The proposed roadmap is invalid.');
  }
  return result.data;
}

function buildTimeCalibrationContext(completions) {
  const samples = (Array.isArray(completions) ? completions : []).flatMap((item) => {
    const actualMinutes = Number(item?.evidence?.actualMinutes);
    const estimatedMinutes = Number(item?.mission?.estimatedMinutes);
    if (!Number.isInteger(actualMinutes) || actualMinutes < 1 || actualMinutes > 480
      || !Number.isFinite(estimatedMinutes) || estimatedMinutes < 1) return [];
    return [{
      title: item.mission.topic?.title || item.mission.title || 'Learning session',
      estimatedMinutes,
      actualMinutes,
      ratio: actualMinutes / estimatedMinutes,
    }];
  });
  const sortedRatios = samples.map((sample) => sample.ratio).sort((a, b) => a - b);
  const middle = Math.floor(sortedRatios.length / 2);
  const medianRatio = sortedRatios.length === 0 ? null
    : sortedRatios.length % 2 === 0
      ? (sortedRatios[middle - 1] + sortedRatios[middle]) / 2
      : sortedRatios[middle];
  const roundedMedianRatio = medianRatio === null ? null : Math.round(medianRatio * 100) / 100;
  if (samples.length < 3) {
    return { context: '', sampleCount: samples.length, medianRatio: roundedMedianRatio };
  }

  const examples = samples.slice(0, 8).map((sample) => ({
    topic: sample.title,
    estimatedMinutes: sample.estimatedMinutes,
    actualMinutes: sample.actualMinutes,
  }));
  const differencePercent = Math.round((roundedMedianRatio - 1) * 100);
  const trend = differencePercent > 0
    ? `actual time is typically about ${differencePercent}% longer than estimated`
    : differencePercent < 0
      ? `actual time is typically about ${Math.abs(differencePercent)}% shorter than estimated`
      : 'actual time is broadly matching estimates';
  return {
    context: JSON.stringify({
      sampleCount: samples.length,
      medianActualToEstimatedRatio: roundedMedianRatio,
      observedPattern: trend,
      recentExamples: examples,
      instruction: 'Use this learner-specific evidence when estimating future work. Do not blindly multiply every task by the same ratio; account for task type and complexity, and keep the plan within the reserved daily and chunk budgets by narrowing scope when necessary.',
    }),
    sampleCount: samples.length,
    medianRatio: roundedMedianRatio,
  };
}

function buildDeadlineFeasibility({ goal, estimatedRemainingMinutes, estimateConfidence = 'low', now = new Date(), timeZone = 'UTC' }) {
  const targetDate = goal?.targetDate ? new Date(goal.targetDate).toISOString().slice(0, 10) : null;
  if (!targetDate) return { status: 'NO_DEADLINE', targetDate: null, estimateConfidence, recommendation: 'Set a target date if you want Pathwise to estimate schedule feasibility.' };

  const today = dateInTimeZone(now, timeZone);
  const daysRemaining = dateDistanceInDays(today, targetDate);
  if (daysRemaining < 0) {
    return { status: 'DEADLINE_PASSED', targetDate, daysRemaining: 0, availableStudyDays: 0, availableMinutes: 0, estimatedRemainingMinutes: Number.isInteger(estimatedRemainingMinutes) ? estimatedRemainingMinutes : null, estimateConfidence, recommendation: 'The target date has passed. Choose a new date or reduce the goal scope.' };
  }
  if (!Number.isInteger(estimatedRemainingMinutes) || estimatedRemainingMinutes < 1) {
    return { status: 'ESTIMATING', targetDate, daysRemaining, availableStudyDays: 0, availableMinutes: 0, estimatedRemainingMinutes: null, estimateConfidence, recommendation: 'Pathwise does not yet have a reliable remaining-effort estimate for this goal.' };
  }

  const studyDayIndexes = new Set(sessionDayIndexes(goal.daysPerWeek));
  let availableStudyDays = 0;
  for (let offset = 0; offset <= daysRemaining; offset += 1) {
    if (studyDayIndexes.has(offset % 7)) availableStudyDays += 1;
  }
  const plannedDailyMinutes = Math.max(10, Math.floor(goal.minutesPerDay * 0.8));
  const availableMinutes = availableStudyDays * plannedDailyMinutes;
  const marginMinutes = availableMinutes - estimatedRemainingMinutes;
  const status = marginMinutes < 0
    ? 'OVER_CAPACITY'
    : marginMinutes < estimatedRemainingMinutes * 0.15
      ? 'AT_RISK'
      : 'ON_TRACK';
  const recommendation = status === 'OVER_CAPACITY'
    ? 'The estimated remaining work exceeds buffered capacity. Reduce the outcome scope, increase realistic study time, or extend the deadline.'
    : status === 'AT_RISK'
      ? 'The goal may fit, but there is little room for delays. Keep the scope focused and review progress after the next chunk.'
      : 'The current estimate fits within the available study time. Recheck after each chunk because estimates and pace can change.';
  return {
    status,
    targetDate,
    daysRemaining,
    availableStudyDays,
    plannedDailyMinutes,
    availableMinutes,
    estimatedRemainingMinutes,
    marginMinutes,
    estimateConfidence: ['low', 'medium', 'high'].includes(estimateConfidence) ? estimateConfidence : 'low',
    recommendation,
  };
}

async function getRoadmapWithTopics(db, roadmapId) {
  return db.roadmap.findUnique({
    where: { id: roadmapId },
    include: {
      topics: {
        orderBy: { position: 'asc' },
        include: {
          prerequisites: {
            include: { prerequisite: { select: { id: true, title: true, position: true } } },
          },
        },
      },
    },
  });
}

async function createRoadmapDraft({ userId, goalId, input, db = prisma }) {
  const roadmapData = getValidatedRoadmap(input);
  const learningBrief = input?.learningBrief && typeof input.learningBrief === 'object' && !Array.isArray(input.learningBrief)
    ? input.learningBrief
    : null;

  const roadmapId = await db.$transaction(async (tx) => {
    const goal = await tx.learningGoal.findFirst({
      where: { id: goalId, userId },
      select: { id: true },
    });
    if (!goal) {
      throw new RoadmapServiceError(404, 'GOAL_NOT_FOUND', 'Learning goal not found.');
    }

    const latest = await tx.roadmap.findFirst({
      where: { learningGoalId: goalId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });

    const roadmap = await tx.roadmap.create({
      data: {
        learningGoalId: goalId,
        version: (latest?.version || 0) + 1,
        title: roadmapData.title,
        summary: roadmapData.summary,
        ...(learningBrief ? { learningBrief } : {}),
        generationState: 'DRAFT',
      },
      select: { id: true },
    });

    const topicIds = new Map();
    for (const topic of roadmapData.topics) {
      const createdTopic = await tx.roadmapTopic.create({
        data: {
          roadmapId: roadmap.id,
          title: topic.title,
          description: topic.description,
          learningObjectives: topic.learningObjectives,
          estimatedMinutes: topic.estimatedMinutes,
          position: topic.position,
        },
        select: { id: true },
      });
      topicIds.set(topic.key, createdTopic.id);
    }

    const edges = [];
    for (const topic of roadmapData.topics) {
      for (const prerequisiteKey of topic.prerequisiteKeys) {
        edges.push({
          topicId: topicIds.get(topic.key),
          prerequisiteId: topicIds.get(prerequisiteKey),
        });
      }
    }
    if (edges.length > 0) {
      await tx.topicPrerequisite.createMany({ data: edges });
    }

    return roadmap.id;
  });

  return getRoadmapWithTopics(db, roadmapId);
}

async function getClarifyingQuestions({ userId, goalId, db = prisma, questionGenerator = generateClarifyingQuestions }) {
  const goal = await db.learningGoal.findFirst({ where: { id: goalId, userId }, select: { id: true, title: true, originalDescription: true, targetOutcome: true, experienceLevel: true, minutesPerDay: true, daysPerWeek: true } });
  if (!goal) throw new RoadmapServiceError(404, 'GOAL_NOT_FOUND', 'Learning goal not found.');
  try { return await questionGenerator(goal); }
  catch (error) { if (error && Number.isInteger(error.status) && error.code) throw error; throw new RoadmapServiceError(502, 'CLARIFICATION_QUESTIONS_FAILED', 'Personalisation questions could not be generated. Please try again.'); }
}

async function generateRoadmapDraft({ userId, goalId, clarifications = '', planningDays = 3, answers = [], timeZone = 'UTC', now = new Date(), db = prisma, generator = generateRoadmap }) {
  const goal = await db.learningGoal.findFirst({
    where: { id: goalId, userId },
    select: {
      id: true,
      title: true,
      targetOutcome: true,
      experienceLevel: true,
      minutesPerDay: true,
      daysPerWeek: true,
      targetDate: true,
      originalDescription: true,
    },
  });

  if (!goal) {
    throw new RoadmapServiceError(404, 'GOAL_NOT_FOUND', 'Learning goal not found.');
  }
  const normalizedPlanningDays = Number.isInteger(planningDays) ? Math.max(1, Math.min(28, planningDays)) : 3;
  const timingHistory = await db.missionCompletion.findMany({
    where: { userId, mission: { is: { learningGoalId: goalId } } },
    orderBy: { completedAt: 'desc' },
    take: 30,
    select: {
      evidence: true,
      mission: {
        select: {
          title: true,
          estimatedMinutes: true,
          topic: { select: { title: true } },
        },
      },
    },
  });
  const timeCalibration = buildTimeCalibrationContext(timingHistory);
  const activeRoadmap = await db.roadmap.findFirst({ where: { learningGoalId: goalId, generationState: 'ACTIVE' }, orderBy: { version: 'desc' }, include: { topics: { orderBy: { position: 'asc' }, select: { id: true, title: true, description: true, learningObjectives: true, estimatedMinutes: true, position: true, userProgress: { where: { userId }, select: { status: true, masteryScore: true, attempts: true } }, assessment: { include: { attempts: { where: { userId }, orderBy: { createdAt: 'desc' }, take: 2, select: { score: true, passed: true } } } } } }, missions: { where: { userId }, select: { title: true, estimatedMinutes: true, status: true, topic: { select: { title: true } } }, orderBy: { scheduledDate: 'desc' }, take: 50 } } });
  const chunkNumber = activeRoadmap ? Number(activeRoadmap.learningBrief?.chunkNumber || 1) + 1 : 1;
  const priorLearningContext = activeRoadmap ? JSON.stringify({
    nextChunkNumber: chunkNumber,
    previousChunk: { id: activeRoadmap.id, title: activeRoadmap.title, summary: activeRoadmap.summary, chunkNumber: activeRoadmap.learningBrief?.chunkNumber || 1, estimatedRemainingMinutes: activeRoadmap.learningBrief?.estimatedRemainingMinutes, estimateConfidence: activeRoadmap.learningBrief?.estimateConfidence },
    continuationRules: [
      'Continue from the latest chunk; do not restart from the beginning.',
      'Treat completed topics as taught; use mastery/assessment evidence to decide whether to advance or review.',
      'Continue incomplete activities where appropriate instead of repeating the whole chunk.',
      'Repeat prior material only for a demonstrated gap or purposeful spaced practice.',
    ],
    completedActivities: activeRoadmap.missions.filter((item) => item.status === 'COMPLETED').map((item) => ({ title: item.title, topic: item.topic.title, minutes: item.estimatedMinutes })),
    incompleteActivities: activeRoadmap.missions.filter((item) => item.status !== 'COMPLETED').map((item) => ({ title: item.title, topic: item.topic.title, status: item.status })),
    topics: activeRoadmap.topics.map((topic) => ({
      title: topic.title,
      description: topic.description,
      learningObjectives: topic.learningObjectives,
      estimatedMinutes: topic.estimatedMinutes,
      position: topic.position,
      progress: topic.userProgress,
      assessments: topic.assessment?.attempts || [],
    })),
  }) : '';
  const safeAnswers = Array.isArray(answers) ? answers.filter((item) => item && typeof item.question === 'string' && typeof item.answer === 'string').slice(0, 4) : [];
  const answerText = safeAnswers.map((item) => item.question + ': ' + item.answer).join('\n');
  const combinedClarifications = [typeof clarifications === 'string' ? clarifications.trim() : '', answerText].filter(Boolean).join('\n');

  let proposed;
  try {
    proposed = await generator({ ...goal, learnerClarifications: combinedClarifications, planningDays: normalizedPlanningDays, chunkNumber, priorLearningContext, timeCalibrationContext: timeCalibration.context });
  } catch (error) {
    if (process.env.AI_DEBUG === 'true') {
      console.error('[roadmap-service] Roadmap generation failed:', JSON.stringify({
        status: error?.status || 502,
        code: error?.code || 'ROADMAP_GENERATION_FAILED',
        message: error?.message || 'Unknown generation error',
      }));
    }
    if (error && Number.isInteger(error.status) && error.code) throw error;
    throw new RoadmapServiceError(502, 'ROADMAP_GENERATION_FAILED', 'The roadmap could not be generated. Please try again.');
  }

  const brief = proposed.learningBrief && typeof proposed.learningBrief === 'object' ? proposed.learningBrief : {};
  const practiceDays = Math.ceil(goal.daysPerWeek * normalizedPlanningDays / 7);
  const plannedDailyMinutes = Math.max(10, Math.floor(goal.minutesPerDay * 0.8));
  proposed.learningBrief = {
    ...brief,
    chunkNumber,
    planningDays: normalizedPlanningDays,
    practiceDays,
    dailyMinutes: goal.minutesPerDay,
    plannedDailyMinutes,
    daysPerWeek: goal.daysPerWeek,
    availableCapacityMinutes: goal.minutesPerDay * practiceDays,
    chunkBudgetMinutes: plannedDailyMinutes * practiceDays,
    bufferMinutes: (goal.minutesPerDay - plannedDailyMinutes) * practiceDays,
    deadlineFeasibility: buildDeadlineFeasibility({ goal, estimatedRemainingMinutes: brief.estimatedRemainingMinutes, estimateConfidence: brief.estimateConfidence, now, timeZone }),
    timeCalibrationSampleCount: timeCalibration.sampleCount,
    ...(timeCalibration.medianRatio === null ? {} : { medianActualToEstimatedRatio: timeCalibration.medianRatio }),
    learnerAnswers: safeAnswers,
    priorChunkId: activeRoadmap?.id || null,
  };
  return createRoadmapDraft({ userId, goalId, input: proposed, db });
}

function utcDate(dateString) {
  return new Date(`${dateString}T00:00:00.000Z`);
}

function dateDistanceInDays(from, to) {
  return Math.round((utcDate(to).getTime() - utcDate(from).getTime()) / 86400000);
}

async function getCompletedRollingGeneration({ db, run, goalId }) {
  if (!run?.resultRoadmapId) return { generated: false, reason: 'ALREADY_GENERATED' };
  const roadmap = await db.roadmap.findFirst({
    where: { id: run.resultRoadmapId, learningGoalId: goalId },
    include: { topics: { orderBy: { position: 'asc' } } },
  });
  const missions = await db.dailyMission.findMany({
    where: { learningGoalId: goalId, roadmapId: run.resultRoadmapId },
    orderBy: [{ scheduledDate: 'asc' }, { createdAt: 'asc' }],
    include: { topic: { select: { id: true, title: true, position: true } } },
  });
  return { generated: false, reason: 'ALREADY_GENERATED', roadmap, missions, pendingDays: new Set(missions.filter((item) => ['SCHEDULED', 'IN_PROGRESS'].includes(item.status)).map((item) => item.scheduledDate.toISOString().slice(0, 10))).size };
}

async function rollForwardRoadmap({ userId, goalId, completedDate, timeZone = 'UTC', now = new Date(), db = prisma }) {
  const lockKey = `${userId}:${goalId}`;
  if (rollingGenerationLocks.has(lockKey)) {
    return { generated: false, reason: 'GENERATION_IN_PROGRESS' };
  }
  rollingGenerationLocks.add(lockKey);
  let generationRunId = null;
  try {
    const goal = await db.learningGoal.findFirst({
      where: { id: goalId, userId },
      select: { id: true, title: true, targetOutcome: true, experienceLevel: true, minutesPerDay: true, daysPerWeek: true, targetDate: true, originalDescription: true },
    });
    if (!goal) throw new RoadmapServiceError(404, 'GOAL_NOT_FOUND', 'Learning goal not found.');
    const currentActiveRoadmap = await db.roadmap.findFirst({
      where: { learningGoalId: goalId, generationState: 'ACTIVE' },
      select: { id: true },
    });
    if (!currentActiveRoadmap) throw new RoadmapServiceError(409, 'ACTIVE_ROADMAP_REQUIRED', 'Activate the initial roadmap before generating continuation sessions.');

    const today = dateInTimeZone(now, timeZone);
    const deadline = goal.targetDate ? goal.targetDate.toISOString().slice(0, 10) : null;
    if (deadline && deadline < today) return { generated: false, reason: 'DEADLINE_PASSED' };

    const triggerDate = utcDate(completedDate || today);
    let existingGenerationRun = null;
    if (db.roadmapGenerationRun) {
      existingGenerationRun = await db.roadmapGenerationRun.findUnique({
        where: { learningGoalId_triggerDate: { learningGoalId: goalId, triggerDate } },
      });
      if (existingGenerationRun?.status === 'COMPLETED') {
        return getCompletedRollingGeneration({ db, run: existingGenerationRun, goalId });
      }
      if (existingGenerationRun?.status === 'GENERATING' && existingGenerationRun.leaseExpiresAt > now) {
        return { generated: false, reason: 'GENERATION_IN_PROGRESS' };
      }
    }

    if (completedDate) {
      const unfinishedOnCompletedDate = await db.dailyMission.count({
        where: { userId, learningGoalId: goalId, scheduledDate: utcDate(completedDate), status: { in: ['SCHEDULED', 'IN_PROGRESS'] } },
      });
      if (unfinishedOnCompletedDate > 0) return { generated: false, reason: 'DAY_NOT_COMPLETE' };
    }

    const pending = await db.dailyMission.findMany({
      where: { userId, learningGoalId: goalId, scheduledDate: { gte: utcDate(today) }, status: { in: ['SCHEDULED', 'IN_PROGRESS'] } },
      select: { scheduledDate: true },
      orderBy: { scheduledDate: 'asc' },
    });
    const pendingDates = [...new Set(pending.map((item) => item.scheduledDate.toISOString().slice(0, 10)))];
    if (pendingDates.length >= 3) return { generated: false, reason: 'ROLLING_WINDOW_FULL', pendingDays: pendingDates.length };

    const planningDays = Math.min(2, 3 - pendingDates.length);
    if (planningDays < 1) return { generated: false, reason: 'ROLLING_WINDOW_FULL', pendingDays: pendingDates.length };

    const lastPendingDate = pendingDates[pendingDates.length - 1] || today;
    const firstCandidateOffset = Math.max(1, dateDistanceInDays(today, lastPendingDate) + 1);
    const studyDayIndexes = new Set(sessionDayIndexes(goal.daysPerWeek));
    const dates = [];
    for (let offset = firstCandidateOffset; offset <= 365 && dates.length < Math.ceil(goal.daysPerWeek * planningDays / 7); offset += 1) {
      const candidate = addDays(today, offset);
      if (deadline && candidate > deadline) break;
      if (!studyDayIndexes.has(offset % 7)) continue;
      if (pendingDates.includes(candidate)) continue;
      dates.push(candidate);
    }
    if (dates.length === 0) return { generated: false, reason: 'NO_STUDY_DAYS_BEFORE_DEADLINE' };

    if (db.roadmapGenerationRun) {
      const leaseExpiresAt = new Date(now.getTime() + 10 * 60 * 1000);
      if (existingGenerationRun) {
        const claimed = await db.roadmapGenerationRun.updateMany({
          where: {
            id: existingGenerationRun.id,
            OR: [{ status: 'FAILED' }, { leaseExpiresAt: { lte: now } }],
          },
          data: { status: 'GENERATING', leaseExpiresAt, failureCode: null, resultRoadmapId: null },
        });
        if (claimed.count !== 1) {
          const latestRun = await db.roadmapGenerationRun.findUnique({
            where: { learningGoalId_triggerDate: { learningGoalId: goalId, triggerDate } },
          });
          if (latestRun?.status === 'COMPLETED') return getCompletedRollingGeneration({ db, run: latestRun, goalId });
          return { generated: false, reason: 'GENERATION_IN_PROGRESS' };
        }
        generationRunId = existingGenerationRun.id;
      } else {
        try {
          const run = await db.roadmapGenerationRun.create({
            data: { learningGoalId: goalId, sourceRoadmapId: currentActiveRoadmap.id, triggerDate, status: 'GENERATING', leaseExpiresAt },
            select: { id: true },
          });
          generationRunId = run.id;
        } catch (error) {
          if (error?.code !== 'P2002') throw error;
          const latestRun = await db.roadmapGenerationRun.findUnique({
            where: { learningGoalId_triggerDate: { learningGoalId: goalId, triggerDate } },
          });
          if (latestRun?.status === 'COMPLETED') return getCompletedRollingGeneration({ db, run: latestRun, goalId });
          return { generated: false, reason: 'GENERATION_IN_PROGRESS' };
        }
      }
    }

    const actualPlanningDays = Math.min(planningDays, deadline ? Math.max(1, dateDistanceInDays(today, deadline)) : planningDays);
    const draft = await generateRoadmapDraft({ userId, goalId, planningDays: actualPlanningDays, timeZone, now, db });
    const topics = draft.topics || [];
    const plannedDailyMinutes = Math.max(10, Math.floor(goal.minutesPerDay * 0.8));
    const topicGroups = dates.map(() => []);
    let dateIndex = 0;
    let usedMinutes = 0;
    let budgetInvalid = false;
    for (const topic of topics) {
      if (!Number.isInteger(topic.estimatedMinutes) || topic.estimatedMinutes < 5 || topic.estimatedMinutes > plannedDailyMinutes) {
        budgetInvalid = true;
        break;
      }
      if (usedMinutes + topic.estimatedMinutes > plannedDailyMinutes) {
        dateIndex += 1;
        usedMinutes = 0;
      }
      if (dateIndex >= topicGroups.length) {
        budgetInvalid = true;
        break;
      }
      topicGroups[dateIndex].push(topic);
      usedMinutes += topic.estimatedMinutes;
    }
    if (budgetInvalid || topics.length === 0) {
      await deleteRoadmapDraft({ userId, goalId, roadmapId: draft.id, db });
      throw new RoadmapServiceError(502, 'ROLLING_CHUNK_BUDGET_INVALID', 'The next learning chunk did not fit the daily time budget. Please retry.');
    }

    const activeRoadmap = await activateRoadmap({ userId, goalId, roadmapId: draft.id, confirmLearningBrief: true, db });
    const missionRows = [];
    for (let groupIndex = 0; groupIndex < topicGroups.length; groupIndex += 1) {
      for (const topic of topicGroups[groupIndex]) {
        missionRows.push({
          userId,
          learningGoalId: goalId,
          roadmapId: activeRoadmap.id,
          topicId: topic.id,
          scheduledDate: utcDate(dates[groupIndex]),
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
    const missions = await db.dailyMission.findMany({
      where: { userId, learningGoalId: goalId, roadmapId: activeRoadmap.id, scheduledDate: { in: dates.map(utcDate) } },
      orderBy: [{ scheduledDate: 'asc' }, { createdAt: 'asc' }],
      include: { topic: { select: { id: true, title: true, position: true } } },
    });
    if (generationRunId && db.roadmapGenerationRun) {
      await db.roadmapGenerationRun.update({
        where: { id: generationRunId },
        data: { status: 'COMPLETED', resultRoadmapId: activeRoadmap.id, failureCode: null },
      });
    }
    return { generated: true, roadmap: activeRoadmap, missions, planningDays: actualPlanningDays, scheduledDates: dates, pendingDays: pendingDates.length + dates.length };
  } catch (error) {
    if (generationRunId && db.roadmapGenerationRun) {
      try {
        await db.roadmapGenerationRun.update({
          where: { id: generationRunId },
          data: { status: 'FAILED', failureCode: error?.code || 'ROLL_FORWARD_FAILED', leaseExpiresAt: now },
        });
      } catch {
        // Keep the original generation error; an expired lease allows a later retry if the status write fails.
      }
    }
    throw error;
  } finally {
    rollingGenerationLocks.delete(lockKey);
  }
}

async function listRoadmaps({ userId, goalId, db = prisma }) {
  const goal = await db.learningGoal.findFirst({
    where: { id: goalId, userId },
    select: { id: true },
  });
  if (!goal) {
    throw new RoadmapServiceError(404, 'GOAL_NOT_FOUND', 'Learning goal not found.');
  }

  return db.roadmap.findMany({
    where: { learningGoalId: goalId },
    orderBy: { version: 'desc' },
    include: {
      topics: {
        orderBy: { position: 'asc' },
        include: {
          prerequisites: {
            include: { prerequisite: { select: { id: true, title: true, position: true } } },
          },
          userProgress: {
            where: { userId },
            select: { status: true, masteryScore: true, attempts: true, lastActivityAt: true },
          },
          assessment: {
            select: {
              attempts: {
                where: { userId },
                orderBy: { createdAt: 'desc' },
                take: 1,
                select: { score: true, passed: true, createdAt: true },
              },
            },
          },
        },
      },
    },
  });
}

async function deleteRoadmapDraft({ userId, goalId, roadmapId, db = prisma }) {
  return db.$transaction(async (tx) => {
    const goal = await tx.learningGoal.findFirst({
      where: { id: goalId, userId },
      select: { id: true },
    });
    if (!goal) {
      throw new RoadmapServiceError(404, 'GOAL_NOT_FOUND', 'Learning goal not found.');
    }

    const roadmap = await tx.roadmap.findFirst({
      where: { id: roadmapId, learningGoalId: goalId },
      select: { id: true, generationState: true },
    });
    if (!roadmap) {
      throw new RoadmapServiceError(404, 'ROADMAP_NOT_FOUND', 'Roadmap not found.');
    }
    if (roadmap.generationState !== 'DRAFT') {
      throw new RoadmapServiceError(
        409,
        'ROADMAP_NOT_DELETABLE',
        'Only draft roadmaps can be deleted. Active and superseded roadmaps are preserved to protect learning history.',
      );
    }

    await tx.roadmap.delete({ where: { id: roadmapId } });
    return { id: roadmapId, deleted: true };
  });
}

async function activateRoadmap({ userId, goalId, roadmapId, confirmLearningBrief = false, db = prisma }) {
  await db.$transaction(async (tx) => {
    const goal = await tx.learningGoal.findFirst({
      where: { id: goalId, userId },
      select: { id: true },
    });
    if (!goal) {
      throw new RoadmapServiceError(404, 'GOAL_NOT_FOUND', 'Learning goal not found.');
    }

    const roadmap = await tx.roadmap.findFirst({
      where: { id: roadmapId, learningGoalId: goalId },
      select: { id: true, generationState: true, learningBrief: true, learningBriefConfirmedAt: true },
    });
    if (!roadmap) {
      throw new RoadmapServiceError(404, 'ROADMAP_NOT_FOUND', 'Roadmap not found.');
    }

    if (roadmap.generationState === 'ACTIVE') return;
    if (roadmap.generationState !== 'DRAFT') {
      throw new RoadmapServiceError(409, 'ROADMAP_NOT_ACTIVATABLE', 'Only a draft roadmap can be activated.');
    }
    if (roadmap.learningBrief && !roadmap.learningBriefConfirmedAt && confirmLearningBrief !== true) {
      throw new RoadmapServiceError(409, 'LEARNING_BRIEF_CONFIRMATION_REQUIRED', 'Review the enhanced learning brief and confirm its assumptions before activating this roadmap.');
    }

    const topicCount = await tx.roadmapTopic.count({ where: { roadmapId } });
    if (topicCount < 2) {
      throw new RoadmapServiceError(409, 'ROADMAP_INCOMPLETE', 'The roadmap does not contain enough topics to activate.');
    }

    await tx.roadmap.updateMany({
      where: { learningGoalId: goalId, generationState: 'ACTIVE' },
      data: { generationState: 'SUPERSEDED' },
    });
    await tx.roadmap.update({
      where: { id: roadmapId },
      data: {
        generationState: 'ACTIVE',
        activatedAt: new Date(),
        ...(roadmap.learningBrief && !roadmap.learningBriefConfirmedAt ? { learningBriefConfirmedAt: new Date() } : {}),
      },
    });
    await tx.learningGoal.update({
      where: { id: goalId },
      data: { status: 'ACTIVE' },
    });
  });

  return db.roadmap.findFirst({
    where: { id: roadmapId, learningGoal: { userId } },
    include: {
      topics: {
        orderBy: { position: 'asc' },
        include: {
          prerequisites: {
            include: { prerequisite: { select: { id: true, title: true, position: true } } },
          },
        },
      },
    },
  });
}

module.exports = {
  RoadmapServiceError,
  getClarifyingQuestions,
  createRoadmapDraft,
  generateRoadmapDraft,
  rollForwardRoadmap,
  buildTimeCalibrationContext,
  buildDeadlineFeasibility,
  listRoadmaps,
  deleteRoadmapDraft,
  activateRoadmap,
};