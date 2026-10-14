function latestAttempt(topic) {
  const attempts = topic.assessment?.attempts || [];
  return [...attempts].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0] || null;
}

function topicProgress(topic) {
  const progress = topic.userProgress || [];
  return progress[0] || null;
}

function reviewIntervalForScore(score) {
  if (score == null || !Number.isFinite(score)) return null;
  return score >= 0.95 ? 30 : score >= 0.85 ? 14 : 7;
}

function topicReviewState(topic, now = new Date()) {
  const progress = topicProgress(topic);
  const attempt = latestAttempt(topic);
  const score = progress?.masteryScore == null
    ? (attempt?.score == null ? null : attempt.score / 100)
    : progress.masteryScore;
  const lastActivityAt = progress?.lastActivityAt || attempt?.createdAt || null;
  const timestamp = lastActivityAt ? new Date(lastActivityAt).getTime() : NaN;
  const elapsedDays = Number.isFinite(timestamp)
    ? Math.max(0, Math.floor((now.getTime() - timestamp) / 86400000))
    : null;
  const intervalDays = progress?.status === 'MASTERED' ? reviewIntervalForScore(score) : null;

  return {
    score,
    lastActivityAt,
    elapsedDays,
    intervalDays,
    reviewDue: intervalDays !== null && elapsedDays !== null && elapsedDays >= intervalDays,
  };
}

function buildMasterySummary({ roadmap, now = new Date() } = {}) {
  if (!roadmap) return null;
  const topics = [...(roadmap.topics || [])]
    .sort((a, b) => a.position - b.position)
    .map((topic) => {
      const progress = topicProgress(topic);
      const attempt = latestAttempt(topic);
      const review = topicReviewState(topic, now);
      return {
        id: topic.id,
        title: topic.title,
        position: topic.position,
        status: progress?.status || 'NOT_STARTED',
        latestAssessmentScore: attempt?.score ?? null,
        latestAssessmentAt: attempt?.createdAt || null,
        lastActivityAt: review.lastActivityAt,
        daysSinceActivity: review.elapsedDays,
        reviewIntervalDays: review.intervalDays,
        reviewDue: review.reviewDue,
        needsPractice: Boolean(attempt && attempt.score < 85),
      };
    });
  const assessedTopics = topics.filter((topic) => topic.latestAssessmentScore !== null);
  const averageAssessmentScore = assessedTopics.length
    ? Math.round(assessedTopics.reduce((sum, topic) => sum + topic.latestAssessmentScore, 0) / assessedTopics.length)
    : null;

  return {
    totalTopics: topics.length,
    masteredCount: topics.filter((topic) => topic.status === 'MASTERED').length,
    completedCount: topics.filter((topic) => topic.status === 'COMPLETED').length,
    inProgressCount: topics.filter((topic) => topic.status === 'IN_PROGRESS').length,
    notStartedCount: topics.filter((topic) => topic.status === 'NOT_STARTED').length,
    dueReviewCount: topics.filter((topic) => topic.reviewDue).length,
    needsPracticeCount: topics.filter((topic) => topic.needsPractice).length,
    averageAssessmentScore,
    topics,
  };
}

function recommendNextAction({ roadmap, missions = [], now = new Date() }) {
  if (!roadmap) {
    return {
      action: 'CREATE_ROADMAP',
      title: 'Create your first learning chunk',
      reason: 'There is no active learning path yet. Start by confirming the outcome and assumptions for your goal.',
      topicId: null,
      missionId: null,
    };
  }

  const topics = [...(roadmap.topics || [])].sort((a, b) => a.position - b.position);
  if (topics.length === 0) {
    return {
      action: 'REVIEW_ROADMAP',
      title: 'Review your learning path',
      reason: 'The active roadmap has no topics to work through yet.',
      topicId: null,
      missionId: null,
    };
  }

  const weakTopics = topics
    .map((topic) => ({ topic, attempt: latestAttempt(topic) }))
    .filter(({ attempt }) => attempt && attempt.score < 70)
    .sort((a, b) => a.attempt.score - b.attempt.score || new Date(b.attempt.createdAt || 0) - new Date(a.attempt.createdAt || 0));

  if (weakTopics.length > 0) {
    const { topic, attempt } = weakTopics[0];
    return {
      action: 'REINFORCE_TOPIC',
      title: `Reinforce: ${topic.title}`,
      reason: `Your latest assessment was ${Math.round(attempt.score)}%. A focused review and another attempt can help identify what still needs work.`,
      topicId: topic.id,
      missionId: null,
      assessmentScore: attempt.score,
    };
  }

  const completedNeedsAssessment = topics.find((topic) => {
    const progress = topicProgress(topic);
    return ['COMPLETED', 'IN_PROGRESS'].includes(progress?.status) && !latestAttempt(topic);
  });
  if (completedNeedsAssessment && topicProgress(completedNeedsAssessment)?.status === 'COMPLETED') {
    return {
      action: 'CHECK_UNDERSTANDING',
      title: `Check your understanding: ${completedNeedsAssessment.title}`,
      reason: 'You completed the planned work for this topic, but there is no assessment evidence yet. Check what you can recall and apply.',
      topicId: completedNeedsAssessment.id,
      missionId: null,
    };
  }

  const pendingMissions = missions
    .filter((mission) => mission.status === 'IN_PROGRESS' || mission.status === 'SCHEDULED')
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'IN_PROGRESS' ? -1 : 1;
      return String(a.scheduledDate).localeCompare(String(b.scheduledDate));
    });
  const nextMission = pendingMissions.find((mission) => {
    const topic = topics.find((item) => item.id === mission.topicId);
    return topic && topicProgress(topic)?.status !== 'MASTERED';
  });

  if (nextMission) {
    return {
      action: 'CONTINUE_MISSION',
      title: nextMission.title,
      reason: nextMission.status === 'IN_PROGRESS'
        ? 'Pick up the session you already started and finish its learning objective.'
        : 'This is the next scheduled session on your active learning path.',
      topicId: nextMission.topicId,
      missionId: nextMission.id,
    };
  }

  const needsReinforcement = topics.find((topic) => {
    const progress = topicProgress(topic);
    const attempt = latestAttempt(topic);
    return attempt && attempt.score < 85 && progress?.status !== 'MASTERED';
  });
  if (needsReinforcement) {
    const attempt = latestAttempt(needsReinforcement);
    return {
      action: 'REINFORCE_TOPIC',
      title: `Practise: ${needsReinforcement.title}`,
      reason: `Your latest assessment was ${Math.round(attempt.score)}%. Targeted practice is recommended before moving on.`,
      topicId: needsReinforcement.id,
      missionId: null,
      assessmentScore: attempt.score,
    };
  }

  const dueReview = topics
    .map((topic) => ({ topic, review: topicReviewState(topic, now) }))
    .filter(({ topic, review }) => topicProgress(topic)?.status === 'MASTERED' && review.reviewDue)
    .sort((a, b) => b.review.elapsedDays - a.review.elapsedDays)[0];

  if (dueReview) {
    return {
      action: 'REVIEW_TOPIC',
      title: `Refresh: ${dueReview.topic.title}`,
      reason: `You last worked on this mastered topic ${dueReview.review.elapsedDays} days ago. A short retrieval-practice review can help keep it fresh.`,
      topicId: dueReview.topic.id,
      missionId: null,
      reviewIntervalDays: dueReview.review.intervalDays,
    };
  }

  const nextTopic = topics.find((topic) => topicProgress(topic)?.status !== 'MASTERED');
  if (nextTopic) {
    const progress = topicProgress(nextTopic);
    return {
      action: progress?.status === 'IN_PROGRESS' ? 'CONTINUE_TOPIC' : 'LEARN_TOPIC',
      title: `${progress?.status === 'IN_PROGRESS' ? 'Continue' : 'Start'}: ${nextTopic.title}`,
      reason: progress?.status === 'IN_PROGRESS'
        ? 'Continue the topic you have already started.'
        : 'This is the next topic in your active roadmap that has not yet been demonstrated as mastered.',
      topicId: nextTopic.id,
      missionId: null,
    };
  }

  return {
    action: 'NEXT_CHUNK',
    title: 'Plan your next learning chunk',
    reason: 'Your current topics have mastery evidence. Use your progress to choose the next appropriate step toward your original goal.',
    topicId: null,
    missionId: null,
  };
}

module.exports = { recommendNextAction, buildMasterySummary, reviewIntervalForScore };