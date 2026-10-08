const { generateRoadmap } = require('./lib/roadmap-generator');

async function main() {
  const roadmap = await generateRoadmap({
    title: 'Learn JavaScript',
    targetOutcome: 'Build a small interactive web app',
    experienceLevel: 'BEGINNER',
    minutesPerDay: 30,
    daysPerWeek: 4,
    targetDate: null,
  });

  console.log('Ollama roadmap generation passed validation.');
  console.log(JSON.stringify({
    title: roadmap.title,
    topicCount: roadmap.topics.length,
    estimatedTotalMinutes: roadmap.estimatedTotalMinutes,
    topics: roadmap.topics.map(({ key, title, prerequisiteKeys }) => ({
      key,
      title,
      prerequisiteKeys,
    })),
  }, null, 2));
}

main().catch((error) => {
  console.error('Ollama roadmap smoke test failed:', error.code || error.message);
  process.exitCode = 1;
});
