import os from "node:os";
import path from "node:path";
import { Configuration } from "crawlee";

let crawleeConfiguration: Configuration | null = null;

export function getCrawleeStorageDirectory() {
  if (process.env.CRAWLEE_STORAGE_DIR) {
    return path.resolve(process.env.CRAWLEE_STORAGE_DIR);
  }

  const localDataDir = process.env.LOCAL_DATA_DIR;
  if (localDataDir) {
    return path.resolve(process.cwd(), localDataDir, "crawlee-storage");
  }

  if (process.env.NODE_ENV === "test" || process.env.VITEST) {
    return path.resolve(process.cwd(), ".local-data", "crawlee-storage");
  }

  return path.join(
    process.env.APPDATA || os.tmpdir(),
    "NationaleHulpgidsReachOut",
    "crawlee-storage"
  );
}

export function getCrawleeConfiguration() {
  if (crawleeConfiguration) return crawleeConfiguration;

  const localDataDirectory = getCrawleeStorageDirectory();
  const persistStorage =
    process.env.CRAWLEE_PERSIST_STORAGE != null
      ? !["false", "0", ""].includes(process.env.CRAWLEE_PERSIST_STORAGE)
      : !(process.env.NODE_ENV === "test" || process.env.VITEST);

  process.env.CRAWLEE_STORAGE_DIR = localDataDirectory;
  if (!persistStorage) {
    process.env.CRAWLEE_PERSIST_STORAGE = "false";
  }

  crawleeConfiguration = new Configuration({
    persistStorage,
    storageClientOptions: {
      localDataDirectory,
      persistStorage,
      writeMetadata: false,
    },
  });

  return crawleeConfiguration;
}
