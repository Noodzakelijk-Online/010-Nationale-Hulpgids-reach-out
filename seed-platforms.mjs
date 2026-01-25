import { drizzle } from 'drizzle-orm/mysql2';
import { platforms } from './drizzle/schema.ts';

const db = drizzle(process.env.DATABASE_URL);

const platformData = [
  {
    name: 'Indeed',
    baseUrl: 'https://www.indeed.com',
    authType: 'credentials',
    status: 'active',
  },
  {
    name: 'Nationale Hulpgids',
    baseUrl: 'https://www.nationalehulpgids.nl',
    authType: 'credentials',
    status: 'active',
  },
  {
    name: 'PGBvacatures',
    baseUrl: 'https://www.pgbvacatures.nl',
    authType: 'credentials',
    status: 'active',
  },
  {
    name: 'Zorgbanen',
    baseUrl: 'https://www.zorgbanen.nl',
    authType: 'credentials',
    status: 'active',
  },
  {
    name: 'Jobbird',
    baseUrl: 'https://www.jobbird.com',
    authType: 'credentials',
    status: 'active',
  },
];

async function seed() {
  console.log('Seeding platforms...');
  
  for (const platform of platformData) {
    await db.insert(platforms).values(platform).onDuplicateKeyUpdate({
      set: { name: platform.name }
    });
    console.log(`✓ Seeded: ${platform.name}`);
  }
  
  console.log('Done!');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Error seeding:', err);
  process.exit(1);
});
