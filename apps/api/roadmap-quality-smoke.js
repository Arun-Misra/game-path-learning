





if (process.argv.includes('--debug')) process.env.AI_DEBUG = 'true';
const { generateRoadmap } = require('./lib/roadmap-generator');

const scenarios = [
  {
    domain: 'software engineering',
    title: 'Machine learning deployment',
    targetOutcome: 'Train a binary classification model on a tabular dataset, evaluate it with an appropriate metric, expose predictions through a REST API, and deploy the service so another person can use it.',
    experienceLevel: 'SOME_EXPERIENCE',
    minutesPerDay: 45,
    daysPerWeek: 5,
    targetDate: null,
  },
  {
    domain: 'music performance',
    title: 'Guitar',
    targetOutcome: 'Able to play Neele Neele Ambar Par from start to finish, with clean chord transitions and a steady strumming rhythm.',
    experienceLevel: 'BEGINNER',
    minutesPerDay: 30,
    daysPerWeek: 5,
    targetDate: null,
  },
  {
    domain: 'language learning',
    title: 'Spanish for travel',
    targetOutcome: 'Hold a five-minute beginner conversation in Spanish to introduce myself, ask for directions, order food politely, and understand common replies without reading a script.',
    experienceLevel: 'BEGINNER',
    minutesPerDay: 20,
    daysPerWeek: 5,
    targetDate: null,
  },
  {
    domain: 'physical computing and robotics',
    title: 'ESP32 obstacle avoiding robot',
    targetOutcome: 'Build an ESP32-powered two-wheel robot that detects obstacles with an ultrasonic sensor, controls its motors to avoid collisions, and demonstrates reliable behaviour in a repeatable test course.',
    experienceLevel: 'SOME_EXPERIENCE',
    minutesPerDay: 45,
    daysPerWeek: 4,
    targetDate: null,
  },
];

function summarize(goal, roadmap) {
  const weeklyMinutes = goal.minutesPerDay * goal.daysPerWeek;
  return {
    domain: goal.domain,
    goal: goal.targetOutcome,
    roadmapTitle: roadmap.title,
    topicCount: roadmap.topics.length,
    estimatedRemainingMinutes: roadmap.learningBrief?.estimatedRemainingMinutes ?? null,
    estimateConfidence: roadmap.learningBrief?.estimateConfidence ?? 'missing',
    estimatedTotalMinutes: roadmap.estimatedTotalMinutes,
    weeklyAvailableMinutes: weeklyMinutes,
    estimatedChunkWeeks: Math.ceil(roadmap.estimatedTotalMinutes / weeklyMinutes),
    estimatedGoalWeeks: Number.isInteger(roadmap.learningBrief?.estimatedRemainingMinutes)
      ? Math.ceil(roadmap.learningBrief.estimatedRemainingMinutes / weeklyMinutes)
      : null,
    topics: roadmap.topics.map((topic) => ({
      title: topic.title,
      description: topic.description,
      objectives: topic.learningObjectives,
      estimatedMinutes: topic.estimatedMinutes,
      prerequisites: topic.prerequisiteKeys,
    })),
  };
}

async function main() {
  const requestedDomain = process.argv.slice(2).find((argument) => argument !== '--debug' && !argument.startsWith('-'));
  const selectedScenarios = requestedDomain
    ? scenarios.filter((goal) => goal.domain.includes(requestedDomain))
    : scenarios;
  if (requestedDomain && selectedScenarios.length === 0) {
    throw new Error(`Unknown domain \"${requestedDomain}\". Choose: ${scenarios.map((goal) => goal.domain).join(', ')}.`);
  }
  const results = [];
  for (const goal of selectedScenarios) {
    console.log(`Evaluating ${goal.domain}...`);
    try {
      const roadmap = await generateRoadmap(goal);
      results.push(summarize(goal, roadmap));
    } catch (error) {
      results.push({ domain: goal.domain, goal: goal.targetOutcome, generationError: error.code || error.message, message: error.message });
    }
  }
  console.log('Cross-domain roadmap quality sample (review outcome coverage, actionability, progression, and time realism). Any generationError is a failed sample, not a pass:');
  console.log(JSON.stringify(results, null, 2));
  if (results.some((result) => result.generationError)) process.exitCode = 1;
}

main().catch((error) => {
  console.error('Cross-domain roadmap evaluation failed:', error.code || error.message, error.message);
  process.exitCode = 1;
});