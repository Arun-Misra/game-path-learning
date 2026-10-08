const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const { prisma } = require('./lib/prisma');
const indexRouter = require('./routes/index');
const authRouter = require('./routes/auth');
const learningGoalsRouter = require('./routes/learning-goals');
const roadmapsRouter = require('./routes/roadmaps');
const missionsRouter = require('./routes/missions');
const assessmentsRouter = require('./routes/assessments');

const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({
  origin: process.env.WEB_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.get('/api/v1/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'gamified-learning-api',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/v1/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return res.status(200).json({ status: 'ready', database: 'connected' });
  } catch {
    return res.status(503).json({
      status: 'not_ready',
      error: { code: 'DATABASE_UNAVAILABLE', message: 'The database is not available.' },
    });
  }
});

app.use('/api/v1/auth', authRouter);
app.use('/api/v1/learning-goals/:goalId/roadmaps', roadmapsRouter);
app.use('/api/v1/learning-goals/:goalId/missions', missionsRouter);
app.use('/api/v1/learning-goals/:goalId/assessments', assessmentsRouter);
app.use('/api/v1/learning-goals', learningGoalsRouter);
app.use('/api/v1', indexRouter);

app.use((req, res) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `No route for ${req.method} ${req.originalUrl}`,
    },
  });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: process.env.NODE_ENV === 'production'
        ? 'An unexpected error occurred.'
        : err.message,
    },
  });
});

module.exports = app;