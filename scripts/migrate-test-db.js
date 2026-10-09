import { spawnSync } from 'node:child_process';

if (!process.env.TEST_DATABASE_URL) {
  console.error('TEST_DATABASE_URL must be configured in the root .env file.');
  process.exit(1);
}

const env = { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL };
const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(command, ['prisma', 'migrate', 'deploy'], {
  env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (result.error) {
  console.error('Could not start Prisma migration:', result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);