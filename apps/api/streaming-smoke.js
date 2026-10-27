const { generateRoadmap } = require('./lib/roadmap-generator-experimental');

async function main() {
  let streamedCharacters = 0;
  const started = Date.now();
  const roadmap = await generateRoadmap({
    title: 'Java fundamentals',
    targetOutcome: 'Practise Java fundamentals through small runnable exercises',
    experienceLevel: 'BEGINNER',
    minutesPerDay: 25,
    daysPerWeek: 7,
    planningDays: 7,
    targetDate: '2026-12-01T00:00:00.000Z',
  }, {
    onToken: (token) => { streamedCharacters += token.length; },
  });
  const totalMinutes = roadmap.topics.reduce((sum, topic) => sum + topic.estimatedMinutes, 0);
  if (streamedCharacters < 1 || roadmap.topics.length < 2 || totalMinutes > 175) {
    throw new Error('Streaming smoke failed validation.');
  }
  console.log(JSON.stringify({
    streamedCharacters,
    topicCount: roadmap.topics.length,
    totalMinutes,
    title: roadmap.title,
    elapsedSeconds: Math.round((Date.now() - started) / 1000),
  }, null, 2));
}

main().catch((error) => {
  console.error(error.code || error.name, error.message);
  process.exitCode = 1;
});
