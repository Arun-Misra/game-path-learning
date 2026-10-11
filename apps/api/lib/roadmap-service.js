




const { prisma } = require('./prisma');
const { validateRoadmap } = require('./roadmap-validation');
const { generateRoadmap, generateClarifyingQuestions } = require('./roadmap-generator');

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

async function generateRoadmapDraft({ userId, goalId, clarifications = '', planningDays = 7, answers = [], db = prisma, generator = generateRoadmap }) {
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
  const normalizedPlanningDays = Number.isInteger(planningDays) ? Math.max(1, Math.min(28, planningDays)) : 7;
  const activeRoadmap = await db.roadmap.findFirst({ where: { learningGoalId: goalId, generationState: 'ACTIVE' }, orderBy: { version: 'desc' }, include: { topics: { orderBy: { position: 'asc' }, select: { title: true, userProgress: { where: { userId }, select: { status: true, masteryScore: true, attempts: true } }, assessment: { include: { attempts: { where: { userId }, orderBy: { createdAt: 'desc' }, take: 2, select: { score: true, passed: true } } } } } }, missions: { where: { userId }, select: { title: true, estimatedMinutes: true, status: true, topic: { select: { title: true } } }, orderBy: { scheduledDate: 'desc' }, take: 50 } } });
  const chunkNumber = activeRoadmap ? Number(activeRoadmap.learningBrief?.chunkNumber || 1) + 1 : 1;
  const priorLearningContext = activeRoadmap ? JSON.stringify({ previousChunk: activeRoadmap.title, completedActivities: activeRoadmap.missions.filter((item) => item.status === 'COMPLETED').map((item) => ({ title: item.title, topic: item.topic.title, minutes: item.estimatedMinutes })), incompleteActivities: activeRoadmap.missions.filter((item) => item.status !== 'COMPLETED').map((item) => ({ title: item.title, topic: item.topic.title, status: item.status })), topics: activeRoadmap.topics.map((topic) => ({ title: topic.title, progress: topic.userProgress, assessments: topic.assessment?.attempts || [] })) }) : '';
  const safeAnswers = Array.isArray(answers) ? answers.filter((item) => item && typeof item.question === 'string' && typeof item.answer === 'string').slice(0, 4) : [];
  const answerText = safeAnswers.map((item) => item.question + ': ' + item.answer).join('\n');
  const combinedClarifications = [typeof clarifications === 'string' ? clarifications.trim() : '', answerText].filter(Boolean).join('\n');

  let proposed;
  try {
    proposed = await generator({ ...goal, learnerClarifications: combinedClarifications, planningDays: normalizedPlanningDays, priorLearningContext });
  } catch (error) {
    if (error && Number.isInteger(error.status) && error.code) throw error;
    throw new RoadmapServiceError(502, 'ROADMAP_GENERATION_FAILED', 'The roadmap could not be generated. Please try again.');
  }

  const brief = proposed.learningBrief && typeof proposed.learningBrief === 'object' ? proposed.learningBrief : {};
  proposed.learningBrief = { ...brief, chunkNumber, planningDays: normalizedPlanningDays, chunkBudgetMinutes: goal.minutesPerDay * Math.ceil(goal.daysPerWeek * normalizedPlanningDays / 7), learnerAnswers: safeAnswers, priorChunkId: activeRoadmap?.id || null };
  return createRoadmapDraft({ userId, goalId, input: proposed, db });
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
  listRoadmaps,
  deleteRoadmapDraft,
  activateRoadmap,
};