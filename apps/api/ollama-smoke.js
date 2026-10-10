

const { generateRoadmap } = require('./lib/roadmap-generator');

async function main() {
  const goal = {
    title: 'Java',
    targetOutcome: 'Build a client-server application that accepts a graph, implements Dijkstra’s shortest-path algorithm, exposes route queries through a REST API, and includes automated tests.',
    experienceLevel: 'BEGINNER',
    minutesPerDay: 45,
    daysPerWeek: 5,
    targetDate: null,
  };
  const roadmap = await generateRoadmap(goal);

  console.log('Single-model E4B brief enhancement + planning + review passed validation.');
  console.log(JSON.stringify({
    goal: goal.targetOutcome,
    learningBrief: roadmap.learningBrief,
    title: roadmap.title,
    topicCount: roadmap.topics.length,
    estimatedTotalMinutes: roadmap.estimatedTotalMinutes,
    weeklyAvailableMinutes: goal.minutesPerDay * goal.daysPerWeek,
    estimatedWeeks: Math.ceil(roadmap.estimatedTotalMinutes / (goal.minutesPerDay * goal.daysPerWeek)),
    topics: roadmap.topics.map(({ key, title, description, learningObjectives, estimatedMinutes, prerequisiteKeys }) => ({
      key, title, description, learningObjectives, estimatedMinutes, prerequisiteKeys,
    })),
  }, null, 2));
}

main().catch((error) => {
  console.error('Ollama roadmap smoke test failed:', error.code || error.message, error.message);
  process.exitCode = 1;
});