const express = require('express');
const { z } = require('zod');
const { requireAuth } = require('../middleware/require-auth');
const { GamificationServiceError, getGamificationSummary } = require('../lib/gamification-service');

const router = express.Router();
const querySchema = z.object({
  timeZone: z.string().trim().min(1).max(100).optional().default('UTC'),
});

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Provide a valid IANA time zone.' },
    });
  }
  try {
    const data = await getGamificationSummary({ userId: req.user.id, timeZone: parsed.data.timeZone });
    return res.json({ data });
  } catch (error) {
    if (error instanceof GamificationServiceError) {
      return res.status(error.status).json({ error: { code: error.code, message: error.message } });
    }
    return next(error);
  }
});

module.exports = router;
