
const express = require('express');
const { z } = require('zod');
const { rateLimit } = require('express-rate-limit');
const { requireAuth } = require('../middleware/require-auth');
const {
  RoadmapServiceError,
  createRoadmapDraft,
  generateRoadmapDraft,
  listRoadmaps,
  deleteRoadmapDraft,
  activateRoadmap,
} = require('../lib/roadmap-service');

const router = express.Router({ mergeParams: true });
const idSchema = z.string().trim().min(1).max(100);
const generationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: { code: 'GENERATION_RATE_LIMITED', message: 'Too many roadmap generation attempts. Try again later.' } },
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

router.post('/generate', generationLimiter, async (req, res, next) => {
  const parsedId = idSchema.safeParse(req.params.goalId);
  if (!parsedId.success) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'A valid learning goal ID is required.' },
    });
  }

  try {
    const roadmap = await generateRoadmapDraft({
      userId: req.user.id,
      goalId: parsedId.data,
    });
    return res.status(201).json({ data: { roadmap } });
  } catch (error) {
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
  if (!parsedId.success) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'A valid learning goal ID is required.' },
    });
  }

  try {
    const roadmaps = await listRoadmaps({ userId: req.user.id, goalId: parsedId.data });
    return res.json({ data: { roadmaps } });
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
    });
    return res.json({ data: { roadmap } });
  } catch (error) {
    return handleServiceError(error, res, next);
  }
});

module.exports = router;