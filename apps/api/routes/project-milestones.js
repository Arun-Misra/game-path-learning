const express = require('express');
const { z } = require('zod');
const { requireAuth } = require('../middleware/require-auth');
const {
  ProjectMilestoneServiceError,
  listProjectMilestones,
  generateProjectMilestones,
  updateProjectMilestone,
} = require('../lib/project-milestone-service');

const router = express.Router({ mergeParams: true });
const idSchema = z.string().trim().min(1).max(100);
const updateSchema = z.object({
  status: z.enum(['PLANNED', 'IN_PROGRESS', 'COMPLETED']).optional(),
  evidence: z.string().trim().max(4000).optional(),
}).refine((value) => value.status !== undefined || value.evidence !== undefined, {
  message: 'Provide a milestone status or evidence update.',
});

function handleError(error, res, next) {
  if (error instanceof ProjectMilestoneServiceError || (Number.isInteger(error.status) && error.code)) {
    return res.status(error.status).json({ error: { code: error.code, message: error.message } });
  }
  if (error.code === 'P2002') {
    return res.status(409).json({
      error: {
        code: 'MILESTONES_ALREADY_GENERATED',
        message: 'Project milestones were generated concurrently. Refresh the project and try again.',
      },
    });
  }
  return next(error);
}

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  const parsedId = idSchema.safeParse(req.params.goalId);
  if (!parsedId.success) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'A valid learning goal ID is required.' } });
  }
  try {
    const data = await listProjectMilestones({ userId: req.user.id, goalId: parsedId.data });
    return res.json({ data });
  } catch (error) {
    return handleError(error, res, next);
  }
});

router.post('/generate', async (req, res, next) => {
  const parsedId = idSchema.safeParse(req.params.goalId);
  if (!parsedId.success) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'A valid learning goal ID is required.' } });
  }
  try {
    const data = await generateProjectMilestones({ userId: req.user.id, goalId: parsedId.data });
    return res.status(data.alreadyGenerated ? 200 : 201).json({ data });
  } catch (error) {
    return handleError(error, res, next);
  }
});

router.patch('/:milestoneId', async (req, res, next) => {
  const parsedGoalId = idSchema.safeParse(req.params.goalId);
  const parsedMilestoneId = idSchema.safeParse(req.params.milestoneId);
  const parsedBody = updateSchema.safeParse(req.body ?? {});
  if (!parsedGoalId.success || !parsedMilestoneId.success || !parsedBody.success) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Provide valid IDs and a milestone status and/or evidence update.',
        ...(parsedBody.success ? {} : { details: parsedBody.error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })) }),
      },
    });
  }
  try {
    const milestone = await updateProjectMilestone({
      userId: req.user.id,
      goalId: parsedGoalId.data,
      milestoneId: parsedMilestoneId.data,
      ...parsedBody.data,
    });
    return res.json({ data: { milestone } });
  } catch (error) {
    return handleError(error, res, next);
  }
});

module.exports = router;
