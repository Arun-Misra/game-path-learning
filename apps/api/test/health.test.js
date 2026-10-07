const assert = require('node:assert/strict');
const test = require('node:test');
const app = require('../app');

async function withServer(t, callback) {
  const server = app.listen(0);
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));

  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address();
  return callback(`http://127.0.0.1:${address.port}`);
}

test('GET /api/v1/health returns API process health', async (t) => {
  await withServer(t, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.status, 'ok');
    assert.equal(body.service, 'gamified-learning-api');
    assert.equal(typeof body.timestamp, 'string');
  });
});

test('GET /api/v1/ready reports database readiness without exposing connection details', async (t) => {
  await withServer(t, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/ready`);
    const body = await response.json();

    assert.ok([200, 503].includes(response.status));
    if (response.status === 200) {
      assert.deepEqual(body, { status: 'ready', database: 'connected' });
    } else {
      assert.equal(body.status, 'not_ready');
      assert.equal(body.error.code, 'DATABASE_UNAVAILABLE');
      assert.ok(!JSON.stringify(body).includes('postgresql://'));
    }
  });
});

test('unknown API paths return a consistent JSON error', async (t) => {
  await withServer(t, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/missing`);
    const body = await response.json();

    assert.equal(response.status, 404);
    assert.equal(body.error.code, 'NOT_FOUND');
  });
});
