import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const id = process.argv[2] || 'cmqiwi5nu0004d7h4umi62j8b';
prisma.pool.findUnique({ where: { id } })
  .then(p => { console.log(JSON.stringify(p, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2)); })
  .finally(() => prisma.$disconnect());
