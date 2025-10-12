// prisma.config.ts
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',      // be explicit; avoids surprises
  migrations: {
    seed: 'node scripts/seed-fees.cjs' // this is why your seed runs
  }
});
