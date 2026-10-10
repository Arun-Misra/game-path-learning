const express = require('express');
const { z } = require('zod');
const { prisma } = require('../lib/prisma');
const { requireAuth } = require('../middleware/require-auth');

const router = express.Router();

const createGoalSchema = z.object({
  skill: z.string().trim().min(1).max(160),
  outcome: z.string().trim().min(1).max(1000),
  experience: z.enum(['beginner', 'some', 'experienced']),
  minutesPerDay: z.coerce.number().int().min(15).max(240),
  daysPerWeek: z.coerce.number().int().min(1).max(7),
  targetDate: z.string().date().optional(),
});

const experienceMap = {
  beginner: 'BEGINNER',
  some: 'SOME_EXPERIENCE',
  experienced: 'EXPERIENCED',
};

function validationError(res, error) {
  return res.status(400).json({
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Please check the submitted learning goal.',
      details: error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })),
    },
  });
}

function toGoalResponse(goal) {
  return {
    id: goal.id,
    skill: goal.title,
    originalDescription: goal.originalDescription,
    outcome: goal.targetOutcome,
    experience: goal.experienceLevel.toLowerCase() === 'some_experience'
      ? 'some'
      : goal.experienceLevel.toLowerCase(),
    minutesPerDay: goal.minutesPerDay,
    daysPerWeek: goal.daysPerWeek,
    targetDate: goal.targetDate,
    status: goal.status.toLowerCase(),
    createdAt: goal.createdAt,
    updatedAt: goal.updatedAt,
  };
}

router.use(requireAuth);

router.post('/', async (req, res, next) => {
  const parsed = createGoalSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);

  try {
    const input = parsed.data;
    const goal = await prisma.learningGoal.create({
      data: {
        userId: req.user.id,
        title: input.skill,
        originalDescription: input.skill,
        targetOutcome: input.outcome,
        experienceLevel: experienceMap[input.experience],
        minutesPerDay: input.minutesPerDay,
        daysPerWeek: input.daysPerWeek,
        targetDate: input.targetDate ? new Date(`${input.targetDate}T00:00:00.000Z`) : null,
      },
    });

    return res.status(201).json({ data: { goal: toGoalResponse(goal) } });
  } catch (error) {
    return next(error);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const goals = await prisma.learningGoal.findMany({
      where: { userId: req.user.id },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
    return res.json({ data: { goals: goals.map(toGoalResponse) } });
  } catch (error) {
    return next(error);
  }
});

router.delete('/:goalId', async (req, res, next) => {
  const parsedId = z.string().trim().min(1).max(100).safeParse(req.params.goalId);
  if (!parsedId.success) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'A valid learning goal ID is required.' },
    });
  }

  try {
    const result = await prisma.learningGoal.deleteMany({
      where: { id: parsedId.data, userId: req.user.id },
    });
    if (result.count === 0) {
      return res.status(404).json({
        error: { code: 'GOAL_NOT_FOUND', message: 'Learning goal not found.' },
      });
    }
    return res.json({ data: { id: parsedId.data, deleted: true } });
  } catch (error) {
    return next(error);
  }
});

router.get('/:goalId', async (req, res, next) => {
  try {
    const goal = await prisma.learningGoal.findFirst({
      where: { id: req.params.goalId, userId: req.user.id },
    });
    if (!goal) {
      return res.status(404).json({
        error: { code: 'GOAL_NOT_FOUND', message: 'Learning goal not found.' },
      });
    }
    return res.json({ data: { goal: toGoalResponse(goal) } });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;