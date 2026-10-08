const { generateAssessment } = require('./lib/assessment-generator');

async function main() {
  const assessment = await generateAssessment({
    title: 'JavaScript variables',
    description: 'Understand variable declarations, assignment, and basic data types.',
    learningObjectives: [
      'Choose between const and let for common scenarios.',
      'Identify primitive JavaScript data types.',
    ],
  });

  console.log('Ollama assessment generation passed validation.');
  console.log(JSON.stringify({
    title: assessment.title,
    questionCount: assessment.questions.length,
    questions: assessment.questions.map(({ key, prompt, options }) => ({
      key,
      prompt,
      optionCount: options.length,
    })),
  }, null, 2));
}

main().catch((error) => {
  console.error('Ollama assessment smoke test failed:', error.code || error.message);
  process.exitCode = 1;
});
