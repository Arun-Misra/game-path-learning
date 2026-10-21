const express = require('express');
const { z } = require('zod');
const { requireAuth } = require('../middleware/require-auth');
const { prisma } = require('../lib/prisma');
const {
  RoadmapServiceError,
  createRoadmapDraft,
  generateRoadmapDraft,
  rollForwardRoadmap,
  getClarifyingQuestions,
  listRoadmaps,
  buildDeadlineFeasibility,
  deleteRoadmapDraft,
  activateRoadmap,
} = require('../lib/roadmap-service');

const router = express.Router({ mergeParams: true });
const idSchema = z.string().trim().min(1).max(100);
const timeZoneSchema = z.string().min(1).max(100).default('UTC').refine((value) => {
  try { new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date()); return true; }
  catch { return false; }
});

function handleServiceError(error, res, next) {
  if (error instanceof RoadmapServiceError || (Number.isInteger(error.status) && error.code)) {
    return res.status(error.status).json({
      error: { code: error.code, message: error.message },
    });
  }
  if (error.code === 'P2002') {
    return res.status(409).json({
      error: { code: 'ROADMAP_VERSION_CONFLICT', message: 'A roadmap version was created concurrently. Please retry.' },
    });
  }
  return next(error);
}

router.use(requireAuth);

router.post('/questions', async (req, res, next) => {
  const parsedId = idSchema.safeParse(req.params.goalId);
  if (!parsedId.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'A valid learning goal ID is required.' } });
  try {
    const data = await getClarifyingQuestions({ userId: req.user.id, goalId: parsedId.data });
    return res.json({ data });
  } catch (error) { return handleServiceError(error, res, next); }
});

router.post('/roll-forward', async (req, res, next) => {
  const parsedId = idSchema.safeParse(req.params.goalId);
  const parsedBody = z.object({ completedDate: z.string().date().optional() }).safeParse(req.body ?? {});
  const parsedQuery = z.object({ timeZone: timeZoneSchema }).safeParse(req.query);
  if (!parsedId.success || !parsedBody.success || !parsedQuery.success) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Provide a valid goal, completion date, and time zone.' } });
  }
  try {
    const result = await rollForwardRoadmap({
      userId: req.user.id,
      goalId: parsedId.data,
      completedDate: parsedBody.data.completedDate,
      timeZone: parsedQuery.data.timeZone,
    });
    return res.status(result.generated ? 201 : 200).json({ data: result });
  } catch (error) {
    return handleServiceError(error, res, next);
  }
});

router.post('/generate', async (req, res, next) => {
  const parsedId = idSchema.safeParse(req.params.goalId);
  const parsedQuery = z.object({ timeZone: timeZoneSchema }).safeParse(req.query);
  const parsedBody = z.object({ clarifications: z.string().trim().max(1200).optional(), planningDays: z.number().int().min(1).max(28).optional(), answers: z.array(z.object({ question: z.string().trim().min(1).max(500), answer: z.string().trim().min(1).max(1000) })).max(4).optional() }).safeParse(req.body ?? {});
  if (!parsedBody.success || !parsedQuery.success) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Provide valid roadmap generation options, clarifications, and time zone.' },
    });
  }
  if (!parsedId.success) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'A valid learning goal ID is required.' },
    });
  }

  const streaming = String(req.headers.accept || '').includes('text/event-stream');
  if (streaming) {
    res.status(200);
    res.set({ 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.flushHeaders?.();
  }
  try {
    const roadmap = await generateRoadmapDraft({
      userId: req.user.id,
      goalId: parsedId.data,
      clarifications: parsedBody.data.clarifications || '',
      planningDays: parsedBody.data.planningDays || 3,
      answers: parsedBody.data.answers || [],
      timeZone: parsedQuery.data.timeZone,
      onToken: streaming ? (token) => {
        if (!res.writableEnded) res.write('data: ' + JSON.stringify({ type: 'token', token }) + '\n\n');
      } : undefined,
    });
    if (streaming) {
      res.write('data: ' + JSON.stringify({ type: 'complete', roadmap }) + '\n\n');
      return res.end();
    }
    return res.status(201).json({ data: { roadmap } });
  } catch (error) {
    if (streaming) {
      if (!res.writableEnded) {
        res.write('data: ' + JSON.stringify({ type: 'error', error: { code: error.code || 'ROADMAP_GENERATION_FAILED', message: error.message || 'Roadmap generation failed.' } }) + '\n\n');
        return res.end();
      }
      return undefined;
    }
    return handleServiceError(error, res, next);
  }
});

router.post('/', async (req, res, next) => {
  const parsedId = idSchema.safeParse(req.params.goalId);
  if (!parsedId.success) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'A valid learning goal ID is required.' },
    });
  }

  try {
    const roadmap = await createRoadmapDraft({
      userId: req.user.id,
      goalId: parsedId.data,
      input: req.body,
    });
    return res.status(201).json({ data: { roadmap } });
  } catch (error) {
    return handleServiceError(error, res, next);
  }
});

router.get('/', async (req, res, next) => {
  const parsedId = idSchema.safeParse(req.params.goalId);
  const parsedQuery = z.object({ timeZone: timeZoneSchema }).safeParse(req.query);
  if (!parsedId.success || !parsedQuery.success) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Provide a valid learning goal ID and time zone.' },
    });
  }

  try {
    const roadmaps = await listRoadmaps({ userId: req.user.id, goalId: parsedId.data });
    const goal = await prisma.learningGoal.findFirst({
      where: { id: parsedId.data, userId: req.user.id },
      select: { targetDate: true, minutesPerDay: true, daysPerWeek: true },
    });
    const refreshedRoadmaps = roadmaps.map((roadmap) => {
      if (!roadmap.learningBrief || typeof roadmap.learningBrief !== 'object' || Array.isArray(roadmap.learningBrief)) return roadmap;
      const learningBrief = roadmap.learningBrief;
      return {
        ...roadmap,
        learningBrief: {
          ...learningBrief,
          deadlineFeasibility: buildDeadlineFeasibility({
            goal,
            estimatedRemainingMinutes: learningBrief.estimatedRemainingMinutes,
            estimateConfidence: learningBrief.estimateConfidence,
            now: new Date(),
            timeZone: parsedQuery.data.timeZone,
          }),
        },
      };
    });
    return res.json({ data: { roadmaps: refreshedRoadmaps } });
  } catch (error) {
    return handleServiceError(error, res, next);
  }
});

router.delete('/:roadmapId', async (req, res, next) => {
  const parsedGoalId = idSchema.safeParse(req.params.goalId);
  const parsedRoadmapId = idSchema.safeParse(req.params.roadmapId);
  if (!parsedGoalId.success || !parsedRoadmapId.success) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Valid goal and roadmap IDs are required.' },
    });
  }

  try {
    const result = await deleteRoadmapDraft({
      userId: req.user.id,
      goalId: parsedGoalId.data,
      roadmapId: parsedRoadmapId.data,
    });
    return res.json({ data: result });
  } catch (error) {
    return handleServiceError(error, res, next);
  }
});

router.post('/:roadmapId/activate', async (req, res, next) => {
  const parsedGoalId = idSchema.safeParse(req.params.goalId);
  const parsedRoadmapId = idSchema.safeParse(req.params.roadmapId);
  const parsedBody = z.object({ confirmLearningBrief: z.boolean().optional() }).safeParse(req.body ?? {});
  if (!parsedBody.success) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'The learning brief confirmation must be a boolean.' },
    });
  }
  if (!parsedGoalId.success || !parsedRoadmapId.success) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Valid goal and roadmap IDs are required.' },
    });
  }

  try {
    const roadmap = await activateRoadmap({
      userId: req.user.id,
      goalId: parsedGoalId.data,
      roadmapId: parsedRoadmapId.data,
      confirmLearningBrief: parsedBody.data.confirmLearningBrief === true,
    });
    return res.json({ data: { roadmap } });
  } catch (error) {
    return handleServiceError(error, res, next);
  }
});

module.exports = router;