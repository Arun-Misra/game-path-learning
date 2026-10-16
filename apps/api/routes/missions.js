const express = require('express');
const { z } = require('zod');
const { rateLimit } = require('express-rate-limit');
const { requireAuth } = require('../middleware/require-auth');
const {
  MissionServiceError,
  listMissions,
  generateWeeklyMissions,
  adaptWeeklyMissions,
  getMissedSessionRecovery,
  recoverMissedSessions,
  completeMission,
} = require('../lib/mission-service');

const router = express.Router({ mergeParams: true });
const idSchema = z.string().trim().min(1).max(100);
const timeZoneSchema = z.string().min(1).max(100).refine((value) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}, 'Use a valid IANA time zone.');
const generationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: { code: 'MISSION_GENERATION_RATE_LIMITED', message: 'Too many mission-generation attempts. Try again later.' } },
});
const listQuerySchema = z.object({
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  timeZone: timeZoneSchema.default('UTC'),
}).refine((value) => !value.from || !value.to || value.to >= value.from, {
  path: ['to'],
  message: 'The end date must not precede the start date.',
});
const completeSchema = z.object({
  evidence: z.record(z.string(), z.unknown()).optional(),
}).default({});

function handleServiceError(error, res, next) {
  if (error instanceof MissionServiceError || (Number.isInteger(error.status) && error.code)) {
    return res.status(error.status).json({
      error: { code: error.code, message: error.message },
    });
  }
  if (error.code === 'P2002') {
    return res.status(409).json({
      error: { code: 'MISSION_ALREADY_COMPLETED', message: 'This mission has already been completed.' },
    });
  }
  return next(error);
}

router.use(requireAuth);

router.get('/recovery', async (req, res, next) => {
  const parsedGoal = idSchema.safeParse(req.params.goalId);
  const parsedQuery = z.object({ timeZone: timeZoneSchema.default('UTC') }).safeParse(req.query);
  if (!parsedGoal.success || !parsedQuery.success) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Provide a valid learning goal and time zone.' } });
  }
  try {
    const data = await getMissedSessionRecovery({
      userId: req.user.id,
      goalId: parsedGoal.data,
      timeZone: parsedQuery.data.timeZone,
    });
    return res.json({ data });
  } catch (error) {
    return handleServiceError(error, res, next);
  }
});

router.post('/recovery/replan', generationLimiter, async (req, res, next) => {
  const parsedGoal = idSchema.safeParse(req.params.goalId);
  const parsedQuery = z.object({ timeZone: timeZoneSchema.default('UTC') }).safeParse(req.query);
  if (!parsedGoal.success || !parsedQuery.success) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Provide a valid learning goal and time zone.' } });
  }
  try {
    const data = await recoverMissedSessions({
      userId: req.user.id,
      goalId: parsedGoal.data,
      timeZone: parsedQuery.data.timeZone,
    });
    return res.status(201).json({ data });
  } catch (error) {
    return handleServiceError(error, res, next);
  }
});

router.post('/generate', generationLimiter, async (req, res, next) => {
  const parsedGoal = idSchema.safeParse(req.params.goalId);
  const parsedQuery = z.object({ timeZone: timeZoneSchema.default('UTC') }).safeParse(req.query);
  if (!parsedGoal.success || !parsedQuery.success) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Provide a valid learning goal and time zone.' },
    });
  }

  try {
    const result = await generateWeeklyMissions({
      userId: req.user.id,
      goalId: parsedGoal.data,
      timeZone: parsedQuery.data.timeZone,
    });
    return res.status(201).json({ data: result });
  } catch (error) {
    return handleServiceError(error, res, next);
  }
});

router.post('/adapt', generationLimiter, async (req, res, next) => {
  const parsedGoal = idSchema.safeParse(req.params.goalId);
  const parsedQuery = z.object({ timeZone: timeZoneSchema.default('UTC') }).safeParse(req.query);
  if (!parsedGoal.success || !parsedQuery.success) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Provide a valid learning goal and time zone.' },
    });
  }

  try {
    const result = await adaptWeeklyMissions({
      userId: req.user.id,
      goalId: parsedGoal.data,
      timeZone: parsedQuery.data.timeZone,
    });
    return res.status(201).json({ data: result });
  } catch (error) {
    return handleServiceError(error, res, next);
  }
});

router.get('/', async (req, res, next) => {
  const parsedGoal = idSchema.safeParse(req.params.goalId);
  const parsedQuery = listQuerySchema.safeParse(req.query);
  if (!parsedGoal.success || !parsedQuery.success) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Provide a valid date range and time zone.' },
    });
  }

  try {
    const result = await listMissions({
      userId: req.user.id,
      goalId: parsedGoal.data,
      ...parsedQuery.data,
    });
    return res.json({ data: result });
  } catch (error) {
    return handleServiceError(error, res, next);
  }
});

router.post('/:missionId/complete', async (req, res, next) => {
  const parsedGoal = idSchema.safeParse(req.params.goalId);
  const parsedMission = idSchema.safeParse(req.params.missionId);
  const parsedBody = completeSchema.safeParse(req.body);
  if (!parsedGoal.success || !parsedMission.success || !parsedBody.success) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Provide a valid mission ID and completion evidence.' },
    });
  }

  try {
    const result = await completeMission({
      userId: req.user.id,
      goalId: parsedGoal.data,
      missionId: parsedMission.data,
      evidence: parsedBody.data.evidence,
    });
    return res.json({ data: result });
  } catch (error) {
    return handleServiceError(error, res, next);
  }
});

module.exports = router;