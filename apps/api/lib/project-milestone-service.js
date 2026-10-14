const { prisma } = require('./prisma');

class ProjectMilestoneServiceError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function normalizeCriteria(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 5);
  }
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

function buildMilestoneDrafts(roadmap) {
  const brief = roadmap.learningBrief && typeof roadmap.learningBrief === 'object' && !Array.isArray(roadmap.learningBrief)
    ? roadmap.learningBrief
    : null;
  const finalDeliverable = typeof brief?.finalDeliverable === 'string' ? brief.finalDeliverable.trim() : '';
  if (!brief || !finalDeliverable) {
    throw new ProjectMilestoneServiceError(
      409,
      'LEARNING_BRIEF_REQUIRED',
      'This roadmap needs a confirmed final deliverable before project milestones can be created.',
    );
  }

  const capabilities = Array.isArray(brief.capabilities)
    ? brief.capabilities
      .filter((item) => item && typeof item === 'object' && typeof item.capability === 'string' && item.capability.trim())
      .slice(0, 5)
    : [];

  let drafts = capabilities.map((item) => {
    const title = item.capability.trim();
    const evidence = typeof item.evidenceOfSuccess === 'string' ? item.evidenceOfSuccess.trim() : '';
    return {
      title,
      description: evidence
        ? `Build this capability: ${title}. Evidence of success: ${evidence}`
        : `Build and demonstrate this capability: ${title}.`,
      successCriteria: normalizeCriteria([
        evidence || `Demonstrate the capability: ${title}`,
        'Record what you built, tested, or demonstrated.',
      ]),
    };
  });

  if (drafts.length === 0) {
    drafts = (roadmap.topics || []).slice(0, 5).map((topic) => ({
      title: topic.title,
      description: topic.description,
      successCriteria: normalizeCriteria(topic.learningObjectives).length
        ? normalizeCriteria(topic.learningObjectives)
        : [`Demonstrate the key outcome from ${topic.title}.`],
    }));
  }

  drafts.push({
    title: 'Deliver and verify the final result',
    description: `Bring the work together into the confirmed deliverable: ${finalDeliverable}`,
    successCriteria: [
      `Demonstrate the final deliverable: ${finalDeliverable}`,
      'Record verification evidence, such as a test result, working demonstration, or review notes.',
    ],
  });

  return drafts.map((draft, position) => ({ ...draft, position }));
}

async function ownedGoal(db, userId, goalId) {
  const goal = await db.learningGoal.findFirst({
    where: { id: goalId, userId },
    select: { id: true },
  });
  if (!goal) throw new ProjectMilestoneServiceError(404, 'GOAL_NOT_FOUND', 'Learning goal not found.');
}

async function getActiveRoadmap(db, userId, goalId) {
  return db.roadmap.findFirst({
    where: { learningGoalId: goalId, generationState: 'ACTIVE', learningGoal: { userId } },
    orderBy: { version: 'desc' },
    include: {
      topics: {
        orderBy: { position: 'asc' },
        select: { title: true, description: true, learningObjectives: true },
      },
      projectMilestones: { orderBy: { position: 'asc' } },
    },
  });
}

async function listProjectMilestones({ userId, goalId, db = prisma }) {
  await ownedGoal(db, userId, goalId);
  const roadmap = await getActiveRoadmap(db, userId, goalId);
  return {
    roadmapId: roadmap?.id || null,
    deliverable: typeof roadmap?.learningBrief?.finalDeliverable === 'string' ? roadmap.learningBrief.finalDeliverable : null,
    milestones: roadmap?.projectMilestones || [],
  };
}

async function generateProjectMilestones({ userId, goalId, db = prisma }) {
  await ownedGoal(db, userId, goalId);
  const roadmap = await getActiveRoadmap(db, userId, goalId);
  if (!roadmap) {
    throw new ProjectMilestoneServiceError(409, 'ACTIVE_ROADMAP_REQUIRED', 'Activate a roadmap before planning its project milestones.');
  }
  if (roadmap.learningBrief && !roadmap.learningBriefConfirmedAt) {
    throw new ProjectMilestoneServiceError(409, 'LEARNING_BRIEF_CONFIRMATION_REQUIRED', 'Confirm the learning brief before creating project milestones.');
  }
  if (roadmap.projectMilestones.length > 0) {
    return { roadmapId: roadmap.id, milestones: roadmap.projectMilestones, alreadyGenerated: true };
  }

  const drafts = buildMilestoneDrafts(roadmap);
  await db.$transaction(async (tx) => {
    const existing = await tx.projectMilestone.count({ where: { roadmapId: roadmap.id } });
    if (existing > 0) return;
    for (const draft of drafts) {
      await tx.projectMilestone.create({
        data: {
          roadmapId: roadmap.id,
          title: draft.title,
          description: draft.description,
          successCriteria: draft.successCriteria,
          position: draft.position,
        },
      });
    }
  });

  const milestones = await db.projectMilestone.findMany({
    where: { roadmapId: roadmap.id },
    orderBy: { position: 'asc' },
  });
  return { roadmapId: roadmap.id, milestones, alreadyGenerated: false };
}

async function updateProjectMilestone({ userId, goalId, milestoneId, status, evidence, db = prisma }) {
  return db.$transaction(async (tx) => {
    await ownedGoal(tx, userId, goalId);
    const roadmap = await getActiveRoadmap(tx, userId, goalId);
    if (!roadmap) {
      throw new ProjectMilestoneServiceError(409, 'ACTIVE_ROADMAP_REQUIRED', 'Activate a roadmap before updating its project milestones.');
    }
    const milestones = roadmap.projectMilestones;
    const index = milestones.findIndex((item) => item.id === milestoneId);
    if (index < 0) {
      throw new ProjectMilestoneServiceError(404, 'MILESTONE_NOT_FOUND', 'Project milestone not found.');
    }

    const targetStatus = status || milestones[index].status;
    const nextEvidence = evidence === undefined ? (milestones[index].evidence || '') : evidence.trim();
    if (targetStatus === 'COMPLETED' && nextEvidence.trim().length < 20) {
      throw new ProjectMilestoneServiceError(
        400,
        'MILESTONE_EVIDENCE_REQUIRED',
        'Add at least 20 characters of evidence before completing this milestone.',
      );
    }
    if (targetStatus === 'COMPLETED' && milestones.slice(0, index).some((item) => item.status !== 'COMPLETED')) {
      throw new ProjectMilestoneServiceError(
        409,
        'MILESTONE_PREREQUISITES_INCOMPLETE',
        'Complete earlier project milestones before completing this one.',
      );
    }
    if (targetStatus !== 'COMPLETED' && milestones.slice(index + 1).some((item) => item.status === 'COMPLETED')) {
      throw new ProjectMilestoneServiceError(
        409,
        'LATER_MILESTONES_COMPLETED',
        'A later milestone is already completed. Preserve the project history instead of moving this milestone backwards.',
      );
    }

    return tx.projectMilestone.update({
      where: { id: milestoneId },
      data: {
        status: targetStatus,
        evidence: nextEvidence,
        completedAt: targetStatus === 'COMPLETED' ? (milestones[index].completedAt || new Date()) : null,
      },
    });
  });
}

module.exports = {
  ProjectMilestoneServiceError,
  buildMilestoneDrafts,
  listProjectMilestones,
  generateProjectMilestones,
  updateProjectMilestone,
};