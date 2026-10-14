const assert = require('node:assert/strict');
const test = require('node:test');
const { recommendNextAction, buildMasterySummary, reviewIntervalForScore } = require('../lib/adaptive-learning');

function topic(id, position, { status, score, attempts = 1 } = {}) {
  return {
    id,
    position,
    title: `Topic ${id}`,
    userProgress: status ? [{ status, masteryScore: score == null ? null : score / 100, attempts }] : [],
    assessment: score == null ? null : { attempts: [{ score, passed: score >= 70, createdAt: '2026-10-20T10:00:00.000Z' }] },
  };
}

test('recommends roadmap creation when there is no active roadmap', () => {
  assert.equal(recommendNextAction({ roadmap: null }).action, 'CREATE_ROADMAP');
});

test('prioritizes a low recent assessment score over scheduled work', () => {
  const roadmap = { topics: [topic('a', 0, { status: 'IN_PROGRESS', score: 42 }), topic('b', 1)] };
  const result = recommendNextAction({
    roadmap,
    missions: [{ id: 'mission-b', topicId: 'b', title: 'Learn Topic b', status: 'SCHEDULED', scheduledDate: '2026-10-21' }],
  });
  assert.equal(result.action, 'REINFORCE_TOPIC');
  assert.equal(result.topicId, 'a');
  assert.match(result.reason, /42%/);
});

test('asks for an understanding check after a topic is completed without assessment evidence', () => {
  const result = recommendNextAction({ roadmap: { topics: [topic('a', 0, { status: 'COMPLETED' })] } });
  assert.equal(result.action, 'CHECK_UNDERSTANDING');
  assert.equal(result.topicId, 'a');
});

test('continues the earliest in-progress mission when there is no urgent knowledge gap', () => {
  const result = recommendNextAction({
    roadmap: { topics: [topic('a', 0, { status: 'IN_PROGRESS', score: 80 })] },
    missions: [
      { id: 'later', topicId: 'a', title: 'Later practice', status: 'SCHEDULED', scheduledDate: '2026-10-22' },
      { id: 'current', topicId: 'a', title: 'Current session', status: 'IN_PROGRESS', scheduledDate: '2026-10-21' },
    ],
  });
  assert.equal(result.action, 'CONTINUE_MISSION');
  assert.equal(result.missionId, 'current');
});

test('suggests the next unmastered topic and moves to a new chunk only when all topics are mastered', () => {
  const next = recommendNextAction({ roadmap: { topics: [topic('a', 0, { status: 'MASTERED', score: 95 }), topic('b', 1)] } });
  assert.equal(next.action, 'LEARN_TOPIC');
  assert.equal(next.topicId, 'b');

  const done = recommendNextAction({ roadmap: { topics: [topic('a', 0, { status: 'MASTERED', score: 95 }), topic('b', 1, { status: 'MASTERED', score: 90 })] } });
  assert.equal(done.action, 'NEXT_CHUNK');
});
test('a recent low score can trigger reinforcement even after earlier mastery', () => {
  const result = recommendNextAction({
    roadmap: { topics: [topic('a', 0, { status: 'MASTERED', score: 45 })] },
  });
  assert.equal(result.action, 'REINFORCE_TOPIC');
  assert.equal(result.topicId, 'a');
});
test('suggests spaced review for mastered topics when their review interval is due', () => {
  const result = recommendNextAction({
    now: new Date('2026-10-20T12:00:00.000Z'),
    roadmap: {
      topics: [{
        id: 'review-me',
        position: 0,
        title: 'Topic review',
        userProgress: [{ status: 'MASTERED', masteryScore: 0.96, attempts: 2, lastActivityAt: new Date('2026-09-01T12:00:00.000Z') }],
        assessment: { attempts: [{ score: 96, passed: true, createdAt: new Date('2026-09-01T12:00:00.000Z') }] },
      }],
    },
  });
  assert.equal(result.action, 'REVIEW_TOPIC');
  assert.equal(result.topicId, 'review-me');
  assert.equal(result.reviewIntervalDays, 30);
});

test('mastery summary separates mastery, completed work, practice gaps, and due reviews', () => {
  const now = new Date('2026-10-20T12:00:00.000Z');
  const roadmap = {
    topics: [
      {
        id: 'mastered-due',
        position: 0,
        title: 'Mastered but due',
        userProgress: [{ status: 'MASTERED', masteryScore: 0.96, attempts: 2, lastActivityAt: new Date('2026-08-01T12:00:00.000Z') }],
        assessment: { attempts: [{ score: 96, passed: true, createdAt: new Date('2026-08-01T12:00:00.000Z') }] },
      },
      {
        id: 'completed-weak',
        position: 1,
        title: 'Completed but weak',
        userProgress: [{ status: 'COMPLETED', masteryScore: 0.68, attempts: 1, lastActivityAt: new Date('2026-10-19T12:00:00.000Z') }],
        assessment: { attempts: [{ score: 68, passed: false, createdAt: new Date('2026-10-19T12:00:00.000Z') }] },
      },
      {
        id: 'in-progress',
        position: 2,
        title: 'In progress',
        userProgress: [{ status: 'IN_PROGRESS', masteryScore: null, attempts: 0, lastActivityAt: null }],
        assessment: { attempts: [] },
      },
      { id: 'not-started', position: 3, title: 'Not started', userProgress: [], assessment: { attempts: [] } },
    ],
  };

  const summary = buildMasterySummary({ roadmap, now });
  assert.equal(summary.totalTopics, 4);
  assert.equal(summary.masteredCount, 1);
  assert.equal(summary.completedCount, 1);
  assert.equal(summary.inProgressCount, 1);
  assert.equal(summary.notStartedCount, 1);
  assert.equal(summary.dueReviewCount, 1);
  assert.equal(summary.needsPracticeCount, 1);
  assert.equal(summary.averageAssessmentScore, 82);
  assert.equal(summary.topics[0].reviewDue, true);
  assert.equal(summary.topics[0].reviewIntervalDays, 30);
  assert.equal(summary.topics[1].reviewDue, false);
  assert.equal(summary.topics[1].needsPractice, true);
  assert.equal(summary.topics[3].status, 'NOT_STARTED');
});

test('review intervals follow mastery score bands and summary is absent without an active roadmap', () => {
  assert.equal(reviewIntervalForScore(0.96), 30);
  assert.equal(reviewIntervalForScore(0.85), 14);
  assert.equal(reviewIntervalForScore(0.7), 7);
  assert.equal(reviewIntervalForScore(null), null);
  assert.equal(buildMasterySummary({ roadmap: null }), null);
});
