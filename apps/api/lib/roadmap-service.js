const { prisma } = require('./prisma');
const { validateRoadmap } = require('./roadmap-validation');

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

async function activateRoadmap({ userId, goalId, roadmapId, db = prisma }) {
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
      select: { id: true, generationState: true },
    });
    if (!roadmap) {
      throw new RoadmapServiceError(404, 'ROADMAP_NOT_FOUND', 'Roadmap not found.');
    }

    if (roadmap.generationState === 'ACTIVE') return;
    if (roadmap.generationState !== 'DRAFT') {
      throw new RoadmapServiceError(409, 'ROADMAP_NOT_ACTIVATABLE', 'Only a draft roadmap can be activated.');
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
      data: { generationState: 'ACTIVE', activatedAt: new Date() },
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
  createRoadmapDraft,
  listRoadmaps,
  activateRoadmap,
};
