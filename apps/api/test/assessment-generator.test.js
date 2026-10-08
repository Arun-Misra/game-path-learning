const assert = require('node:assert/strict');
const test = require('node:test');
const {
  AssessmentGenerationError,
  buildAssessmentPrompt,
  validateAssessment,
  publicAssessment,
  scoreAssessment,
  generateAssessment,
} = require('../lib/assessment-generator');

const topic = {
  title: 'JavaScript variables',
  description: 'Understand variable declarations and basic data types.',
  learningObjectives: ['Choose between const and let', 'Identify primitive data types'],
};

function validAssessment() {
  return {
    title: 'Variables knowledge check',
    instructions: 'Choose the best answer for every question.',
    questions: Array.from({ length: 5 }, (_, index) => ({
      key: `question-${index + 1}`,
      prompt: `Which option correctly answers question ${index + 1}?`,
      options: ['Option A', 'Option B', 'Option C', 'Option D'],
      answerIndex: index % 4,
      explanation: `Option ${String.fromCharCode(65 + (index % 4))} is correct for this question.`,
    })),
  };
}

test('assessment prompt includes topic context and schema requirements', () => {
  const prompt = buildAssessmentPrompt(topic);
  assert.match(prompt, /JavaScript variables/);
  assert.match(prompt, /Choose between const and let/);
  assert.match(prompt, /exactly 4 distinct answer options/);
  assert.match(prompt, /answerIndex/);
});

test('validates question count, option count, unique keys and unique options', () => {
  assert.equal(validateAssessment(validAssessment()).success, true);

  const tooFew = validAssessment();
  tooFew.questions = tooFew.questions.slice(0, 4);
  assert.equal(validateAssessment(tooFew).success, false);

  const duplicateKey = validAssessment();
  duplicateKey.questions[1].key = duplicateKey.questions[0].key;
  assert.equal(validateAssessment(duplicateKey).success, false);

  const duplicateOptions = validAssessment();
  duplicateOptions.questions[0].options[1] = duplicateOptions.questions[0].options[0];
  assert.equal(validateAssessment(duplicateOptions).success, false);
});

test('public assessment never exposes answer keys or explanations before submission', () => {
  const assessment = { id: 'assessment-1', topicId: 'topic-1', ...validAssessment() };
  const visible = publicAssessment(assessment);
  assert.equal(visible.questions.length, 5);
  assert.equal('answerIndex' in visible.questions[0], false);
  assert.equal('explanation' in visible.questions[0], false);
});

test('scores all answers server-side and returns explanations after submission', () => {
  const assessment = validAssessment();
  const answers = assessment.questions.map((question) => ({
    key: question.key,
    answerIndex: question.answerIndex,
  }));
  const result = scoreAssessment(assessment, answers);
  assert.equal(result.success, true);
  assert.equal(result.data.score, 100);
  assert.equal(result.data.correctCount, 5);
  assert.equal(result.data.passed, true);
  assert.equal(result.data.feedback.length, 5);
  assert.equal(result.data.feedback[0].correct, true);
});

test('rejects incomplete, duplicate and unknown answer submissions', () => {
  const assessment = validAssessment();
  const answers = assessment.questions.map((question) => ({ key: question.key, answerIndex: 0 }));

  assert.equal(scoreAssessment(assessment, answers.slice(0, 4)).code, 'INCOMPLETE_ASSESSMENT');
  assert.equal(scoreAssessment(assessment, [...answers, answers[0]]).code, 'INVALID_ANSWERS');
  assert.equal(scoreAssessment(assessment, answers.map((answer, index) => index === 0
    ? { ...answer, key: 'unknown-question' }
    : answer)).code, 'INVALID_ANSWERS');
});

test('fails an assessment when score is below the 70 percent pass threshold', () => {
  const assessment = validAssessment();
  const answers = assessment.questions.map((question, index) => ({
    key: question.key,
    answerIndex: index === 0 ? question.answerIndex : (question.answerIndex + 1) % 4,
  }));
  const result = scoreAssessment(assessment, answers);
  assert.equal(result.success, true);
  assert.equal(result.data.score, 20);
  assert.equal(result.data.passed, false);
});

test('generates a validated assessment through the local OpenAI-compatible endpoint', async () => {
  let request;
  const proposal = validAssessment();
  const result = await generateAssessment(topic, {
    apiKey: '',
    baseUrl: 'http://127.0.0.1:11434/v1',
    model: 'gemma4:e2b',
    fetchImpl: async (url, options) => {
      request = { url, options, body: JSON.parse(options.body) };
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: JSON.stringify(proposal) } }] }),
      };
    },
  });

  assert.equal(request.url, 'http://127.0.0.1:11434/v1/chat/completions');
  assert.equal(request.options.headers.Authorization, undefined);
  assert.equal(request.body.model, 'gemma4:e2b');
  assert.equal(result.questions.length, 5);
});

test('hosted assessment generation requires a key', async () => {
  await assert.rejects(
    generateAssessment(topic, {
      apiKey: '',
      baseUrl: 'https://example-provider.invalid/v1',
      fetchImpl: async () => assert.fail('fetch should not run'),
    }),
    (error) => error instanceof AssessmentGenerationError
      && error.code === 'ASSESSMENT_GENERATOR_NOT_CONFIGURED',
  );
});
