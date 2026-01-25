import { drizzle } from "drizzle-orm/mysql2";
import { platforms } from "./drizzle/schema.ts";

const db = drizzle(process.env.DATABASE_URL);

const platformData = [
  {
    name: "Indeed.com",
    baseUrl: "https://www.indeed.com",
    authType: "credentials",
    isActive: 1,
  },
  {
    name: "Nationale Hulpgids",
    baseUrl: "https://www.nationalehulpgids.nl",
    authType: "credentials",
    isActive: 1,
  },
  {
    name: "PGBvacatures.nl",
    baseUrl: "https://www.pgbvacatures.nl",
    authType: "credentials",
    isActive: 1,
  },
  {
    name: "Zorgbanen.nl",
    baseUrl: "https://www.zorgbanen.nl",
    authType: "credentials",
    isActive: 1,
  },
  {
    name: "Jobbird.com",
    baseUrl: "https://www.jobbird.com",
    authType: "credentials",
    isActive: 1,
  },
];

async function seed() {
  console.log("Seeding platforms...");
  for (const platform of platformData) {
    await db.insert(platforms).values(platform).onDuplicateKeyUpdate({ set: platform });
  }
  console.log("✓ Platforms seeded successfully");
  process.exit(0);
}

seed().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
