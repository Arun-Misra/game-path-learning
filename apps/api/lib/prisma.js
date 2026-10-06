const { PrismaClient } = require('@prisma/client');

const prisma = globalThis.__learningPrisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__learningPrisma = prisma;
}

module.exports = { prisma };
