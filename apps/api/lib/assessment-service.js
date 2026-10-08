const { prisma } = require('./prisma');
const {
  generateAssessment,
  publicAssessment,
  scoreAssessment,
} = require('./assessment-generator');

class AssessmentServiceError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function ownedActiveTopic(db, userId, goalId, topicId) {
  const topic = await db.roadmapTopic.findFirst({
    where: {
      id: topicId,
      roadmap: {
        learningGoalId: goalId,
        generationState: 'ACTIVE',
        learningGoal: { userId },
      },
    },
    include: {
      roadmap: {
        select: { id: true, learningGoalId: true, generationState: true },
      },
    },
  });

  if (!topic) {
    throw new AssessmentServiceError(404, 'TOPIC_NOT_FOUND', 'Topic not found in your active learning roadmap.');
  }
  return topic;
}

async function getTopicAssessment({ userId, goalId, topicId, db = prisma }) {
  await ownedActiveTopic(db, userId, goalId, topicId);
  const assessment = await db.topicAssessment.findUnique({ where: { topicId } });
  if (!assessment) {
    throw new AssessmentServiceError(404, 'ASSESSMENT_NOT_FOUND', 'No assessment has been generated for this topic yet.');
  }
  const attempts = await db.assessmentAttempt.findMany({
    where: { userId, assessmentId: assessment.id },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      score: true,
      correctCount: true,
      questionCount: true,
      passed: true,
      createdAt: true,
    },
  });
  return { assessment: publicAssessment(assessment), attempts };
}

async function generateTopicAssessment({ userId, goalId, topicId, db = prisma, generator = generateAssessment }) {
  const topic = await ownedActiveTopic(db, userId, goalId, topicId);
  const existing = await db.topicAssessment.findUnique({ where: { topicId } });
  if (existing) return { assessment: publicAssessment(existing), alreadyExisted: true };

  const proposed = await generator({
    title: topic.title,
    description: topic.description,
    learningObjectives: topic.learningObjectives,
  });

  try {
    const assessment = await db.topicAssessment.create({
      data: {
        topicId,
        title: proposed.title,
        instructions: proposed.instructions,
        questions: proposed.questions,
      },
    });
    return { assessment: publicAssessment(assessment), alreadyExisted: false };
  } catch (error) {
    if (error.code !== 'P2002') throw error;
    const assessment = await db.topicAssessment.findUnique({ where: { topicId } });
    if (!assessment) throw error;
    return { assessment: publicAssessment(assessment), alreadyExisted: true };
  }
}

async function submitAssessmentAttempt({ userId, goalId, topicId, answers, db = prisma }) {
  await ownedActiveTopic(db, userId, goalId, topicId);
  const assessment = await db.topicAssessment.findUnique({ where: { topicId } });
  if (!assessment) {
    throw new AssessmentServiceError(404, 'ASSESSMENT_NOT_FOUND', 'Generate an assessment before submitting answers.');
  }

  const scored = scoreAssessment(assessment, answers);
  if (!scored.success) {
    throw new AssessmentServiceError(400, scored.code, scored.message);
  }

  return db.$transaction(async (tx) => {
    const attempt = await tx.assessmentAttempt.create({
      data: {
        userId,
        assessmentId: assessment.id,
        answers: scored.data.normalizedAnswers,
        score: scored.data.score,
        correctCount: scored.data.correctCount,
        questionCount: scored.data.questionCount,
        passed: scored.data.passed,
      },
    });

    const current = await tx.userTopicProgress.findUnique({
      where: { userId_topicId: { userId, topicId } },
      select: { status: true, attempts: true, masteryScore: true },
    });
    const status = scored.data.score >= 85
      ? 'MASTERED'
      : current && ['COMPLETED', 'MASTERED'].includes(current.status)
        ? current.status
        : 'IN_PROGRESS';

    await tx.userTopicProgress.upsert({
      where: { userId_topicId: { userId, topicId } },
      create: {
        userId,
        topicId,
        status,
        masteryScore: scored.data.score / 100,
        attempts: 1,
        lastActivityAt: attempt.createdAt,
      },
      update: {
        status,
        masteryScore: Math.max(current?.masteryScore || 0, scored.data.score / 100),
        attempts: { increment: 1 },
        lastActivityAt: attempt.createdAt,
      },
    });

    return {
      attempt: {
        id: attempt.id,
        score: scored.data.score,
        correctCount: scored.data.correctCount,
        questionCount: scored.data.questionCount,
        passed: scored.data.passed,
        createdAt: attempt.createdAt,
      },
      feedback: scored.data.feedback,
      topicProgress: {
        status,
        masteryScore: Math.max(current?.masteryScore || 0, scored.data.score / 100),
      },
    };
  });
}

module.exports = {
  AssessmentServiceError,
  getTopicAssessment,
  generateTopicAssessment,
  submitAssessmentAttempt,
};
