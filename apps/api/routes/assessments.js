const express = require('express');
const { z } = require('zod');
const { rateLimit } = require('express-rate-limit');
const { requireAuth } = require('../middleware/require-auth');
const { AssessmentGenerationError } = require('../lib/assessment-generator');
const {
  AssessmentServiceError,
  getTopicAssessment,
  generateTopicAssessment,
  submitAssessmentAttempt,
} = require('../lib/assessment-service');

const router = express.Router({ mergeParams: true });
const idSchema = z.string().trim().min(1).max(100);
const answerSchema = z.object({
  answers: z.array(z.object({
    key: z.string().trim().min(1).max(80),
    answerIndex: z.number().int().min(0).max(3),
  })).min(1).max(8),
});
const generationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: { code: 'ASSESSMENT_GENERATION_RATE_LIMITED', message: 'Too many assessment generation attempts. Try again later.' } },
});

function handleServiceError(error, res, next) {
  if (error instanceof AssessmentServiceError
    || error instanceof AssessmentGenerationError
    || (Number.isInteger(error.status) && error.code)) {
    return res.status(error.status).json({
      error: { code: error.code, message: error.message },
    });
  }
  if (error.code === 'P2002') {
    return res.status(409).json({
      error: { code: 'ASSESSMENT_CONFLICT', message: 'This assessment was generated concurrently. Please retry.' },
    });
  }
  return next(error);
}

router.use(requireAuth);

router.post('/:topicId/generate', generationLimiter, async (req, res, next) => {
  const parsedGoalId = idSchema.safeParse(req.params.goalId);
  const parsedTopicId = idSchema.safeParse(req.params.topicId);
  if (!parsedGoalId.success || !parsedTopicId.success) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Valid learning goal and topic IDs are required.' },
    });
  }

  try {
    const result = await generateTopicAssessment({
      userId: req.user.id,
      goalId: parsedGoalId.data,
      topicId: parsedTopicId.data,
    });
    return res.status(result.alreadyExisted ? 200 : 201).json({ data: result });
  } catch (error) {
    return handleServiceError(error, res, next);
  }
});

router.get('/:topicId', async (req, res, next) => {
  const parsedGoalId = idSchema.safeParse(req.params.goalId);
  const parsedTopicId = idSchema.safeParse(req.params.topicId);
  if (!parsedGoalId.success || !parsedTopicId.success) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Valid learning goal and topic IDs are required.' },
    });
  }

  try {
    const result = await getTopicAssessment({
      userId: req.user.id,
      goalId: parsedGoalId.data,
      topicId: parsedTopicId.data,
    });
    return res.json({ data: result });
  } catch (error) {
    return handleServiceError(error, res, next);
  }
});

router.post('/:topicId/attempts', async (req, res, next) => {
  const parsedGoalId = idSchema.safeParse(req.params.goalId);
  const parsedTopicId = idSchema.safeParse(req.params.topicId);
  const parsedBody = answerSchema.safeParse(req.body);
  if (!parsedGoalId.success || !parsedTopicId.success || !parsedBody.success) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Submit valid question keys and answer indexes.' },
    });
  }

  try {
    const result = await submitAssessmentAttempt({
      userId: req.user.id,
      goalId: parsedGoalId.data,
      topicId: parsedTopicId.data,
      answers: parsedBody.data.answers,
    });
    return res.status(201).json({ data: result });
  } catch (error) {
    return handleServiceError(error, res, next);
  }
});

module.exports = router;
