if (process.argv.includes('--debug')) process.env.AI_DEBUG = 'true';
const { generateRoadmap } = require('./lib/roadmap-generator');

const goal = {
  title: 'Java backend development',
  targetOutcome: 'Build a tested Java REST API that stores and searches records, validates input, and uses a PostgreSQL database.',
  experienceLevel: 'SOME_EXPERIENCE',
  minutesPerDay: 45,
  daysPerWeek: 5,
  planningDays: 7,
  targetDate: null,
};

function compactTopics(roadmap) {
  return roadmap.topics.map((topic) => ({
    title: topic.title,
    description: topic.description,
    learningObjectives: topic.learningObjectives,
    estimatedMinutes: topic.estimatedMinutes,
    prerequisiteKeys: topic.prerequisiteKeys,
  }));
}

async function main() {
  console.log('Generating first chunk...');
  const first = await generateRoadmap({ ...goal, chunkNumber: 1 });
  const priorTopics = compactTopics(first);
  const priorLearningContext = JSON.stringify({
    nextChunkNumber: 2,
    previousChunk: { title: first.title, summary: first.summary, chunkNumber: 1 },
    continuationRules: [
      'Continue from the latest chunk; do not restart from the beginning.',
      'The learner completed the previous chunk and demonstrated strong understanding of its core objectives.',
      'Advance to the next useful capability; repeat only when needed for a purposeful application or spaced practice.',
    ],
    completedActivities: priorTopics.map((topic) => ({
      title: `Completed: ${topic.title}`,
      topic: topic.title,
      status: 'COMPLETED',
    })),
    incompleteActivities: [],
    topics: priorTopics.map((topic, position) => ({
      ...topic,
      position,
      progress: [{ status: 'MASTERED', masteryScore: 90, attempts: 1 }],
      assessments: [{ score: 90, passed: true }],
    })),
  });

  console.log('Generating continuation chunk from simulated verified progress...');
  const second = await generateRoadmap({
    ...goal,
    chunkNumber: 2,
    priorLearningContext,
  });

  const normalize = (value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ');
  const previousTitles = new Set(priorTopics.map((topic) => normalize(topic.title)));
  const repeatedTitles = second.topics.filter((topic) => previousTitles.has(normalize(topic.title)));
  const summary = {
    goal: goal.targetOutcome,
    firstChunk: {
      title: first.title,
      topicCount: first.topics.length,
      estimatedMinutes: first.estimatedTotalMinutes,
      topics: priorTopics,
    },
    secondChunk: {
      title: second.title,
      topicCount: second.topics.length,
      estimatedMinutes: second.estimatedTotalMinutes,
      topics: compactTopics(second),
    },
    exactRepeatedTopicTitles: repeatedTitles.map((topic) => topic.title),
    continuationContextIncluded: true,
    note: 'Audit descriptions and learning objectives, not only titles. Distinct titles alone do not prove meaningful progression; compare each new objective with the demonstrated prior capabilities.',
  };

  console.log(JSON.stringify(summary, null, 2));
  if (second.topics.length < 2) {
    throw new Error('Continuation smoke failed: the second chunk contains fewer than two topics.');
  }
  if (repeatedTitles.length > Math.floor(second.topics.length / 2)) {
    throw new Error('Continuation smoke failed: too many exact topic titles repeated despite strong prior mastery evidence.');
  }
}

main().catch((error) => {
  console.error('Roadmap continuation smoke failed:', error.code || error.message, error.message);
  process.exitCode = 1;
});
