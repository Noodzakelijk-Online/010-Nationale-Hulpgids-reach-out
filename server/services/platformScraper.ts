import { describeScraperTarget } from "./scraperLog";

/**
 * Platform Scraper Service
 *
 * Handles web scraping and API integration for all 5 platforms:
 * - Indeed.com
 * - Nationale Hulpgids
 * - PGBvacatures.nl
 * - Zorgbanen.nl
 * - Jobbird.com
 */

interface ScrapedCandidate {
  name: string;
  email?: string;
  phone?: string;
  profileUrl: string;
  location?: string;
  experience?: string;
  services?: string;
  availability?: string;
  hourlyRate?: string;
  bio?: string;
  skills?: string[];
  languages?: string[];
  certifications?: string[];
}

interface SearchCriteria {
  location?: string;
  experience?: string;
  services?: string;
  minBudget?: string;
  maxBudget?: string;
  keywords?: string;
}

interface ScraperRunOptions {
  signal?: AbortSignal;
}

interface PlatformCredentials {
  email: string;
  password: string;
  sessionData?: string;
}

const DEFAULT_SCRAPER_MAX_REQUESTS = 30;
const MAX_SCRAPER_REQUESTS = 250;

type PlatformConnectionTestResult = {
  success: boolean;
  supportsAuthenticatedAutomation: boolean;
  message: string;
};

function getScraperRequestLimit() {
  const configuredLimit = Number(
    process.env.SCRAPER_MAX_REQUESTS || DEFAULT_SCRAPER_MAX_REQUESTS
  );
  const safeLimit = Number.isFinite(configuredLimit) ? Math.floor(configuredLimit) : DEFAULT_SCRAPER_MAX_REQUESTS;
  return Math.max(1, Math.min(MAX_SCRAPER_REQUESTS, safeLimit));
}

/**
 * Base scraper class with common functionality
 */
abstract class BaseScraper {
  protected platformName: string;
  protected baseUrl: string;
  protected credentials?: PlatformCredentials;

  constructor(
    platformName: string,
    baseUrl: string,
    credentials?: PlatformCredentials
  ) {
    this.platformName = platformName;
    this.baseUrl = baseUrl;
    this.credentials = credentials;
  }

  /**
   * Authenticate with the platform
   */
  abstract authenticate(): Promise<boolean>;

  protected supportsAuthenticatedAutomation(): boolean {
    return false;
  }

  async testConnection(): Promise<PlatformConnectionTestResult> {
    if (!this.credentials?.email || !this.credentials?.password) {
      return {
        success: false,
        supportsAuthenticatedAutomation: false,
        message: `${this.platformName} cannot test without email and password credentials.`,
      };
    }

    if (!this.supportsAuthenticatedAutomation()) {
      return {
        success: false,
        supportsAuthenticatedAutomation: false,
        message: `${this.platformName} supports public discovery only; authenticated connection testing is unavailable.`,
      };
    }

    try {
      const success = await this.authenticate();
      return {
        success,
        supportsAuthenticatedAutomation: true,
        message: success
          ? `Successfully authenticated with ${this.platformName}`
          : `Authentication failed with provided credentials for ${this.platformName}.`,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unexpected connection test error.";
      return {
        success: false,
        supportsAuthenticatedAutomation: true,
        message: `Could not verify ${this.platformName} connection: ${message}`,
      };
    }
  }

  /**
   * Search for candidates based on criteria
   */
  abstract searchCandidates(
    criteria: SearchCriteria,
    options?: ScraperRunOptions
  ): Promise<ScrapedCandidate[]>;

  /**
   * Get detailed candidate profile
   */
  abstract getCandidateDetails(
    profileUrl: string
  ): Promise<ScrapedCandidate | null>;

  /**
   * Send message to candidate
   */
  abstract sendMessage(candidateId: string, message: string): Promise<boolean>;

  protected unsupportedPlatformSend(): never {
    throw new Error(
      `${this.platformName} platform sending is not implemented. Use the approved manual send flow and record delivery evidence with messages.recordSendAttempt.`
    );
  }

  /**
   * Rate limiting helper
   */
  protected async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Parse location from text
   */
  protected parseLocation(text: string): string {
    // Extract location patterns like "Arnhem", "Amsterdam, Netherlands", etc.
    const locationMatch = text.match(
      /([A-Z][a-z]+(?:\s[A-Z][a-z]+)*(?:,\s*[A-Z][a-z]+)?)/
    );
    return locationMatch ? locationMatch[1] : "";
  }

  /**
   * Parse hourly rate from text
   */
  protected parseHourlyRate(text: string): string {
    // Extract patterns like "€15/uur", "€20-25 per hour", etc.
    const rateMatch = text.match(
      /€\s*(\d+(?:-\d+)?)\s*(?:\/|per)\s*(?:uur|hour)/i
    );
    return rateMatch ? `€${rateMatch[1]}/hour` : "";
  }

  /**
   * Extract email from text
   */
  protected extractEmail(text: string): string | undefined {
    const emailMatch = text.match(
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/
    );
    return emailMatch ? emailMatch[0] : undefined;
  }

  /**
   * Extract phone from text
   */
  protected extractPhone(text: string): string | undefined {
    const phoneMatch = text.match(/(?:\+31|0)[0-9]{9,10}/);
    return phoneMatch ? phoneMatch[0] : undefined;
  }
}

/**
 * Indeed.com Scraper
 */
class IndeedScraper extends BaseScraper {
  constructor(credentials?: PlatformCredentials) {
    super("Indeed", "https://www.indeed.com", credentials);
  }

  async authenticate(): Promise<boolean> {
    console.warn(
      "[Indeed] Authenticated automation is not implemented; public search remains available"
    );
    return false;
  }

  async searchCandidates(
    criteria: SearchCriteria,
    options: ScraperRunOptions = {}
  ): Promise<ScrapedCandidate[]> {
    // Use Crawlee-powered scraper
    const { createIndeedScraper } = await import("./scrapers/crawleeIndeed");
    const crawleeScraper = createIndeedScraper({
      email: this.credentials?.email || "",
      password: this.credentials?.password || "",
      maxRequestsPerCrawl: getScraperRequestLimit(),
    });

    const results = await crawleeScraper.searchCandidates({
      location: criteria.location || "Amsterdam",
      services: criteria.services?.split(",").map(s => s.trim()),
    }, options);

    await crawleeScraper.close();
    return results.map(r => ({
      ...r,
      services: r.services?.join(", "),
      hourlyRate: r.hourlyRate ? `€${r.hourlyRate}/hour` : undefined,
      skills: [],
      languages: ["Nederlands", "Engels"],
      certifications: [],
    }));
  }

  async getCandidateDetails(
    profileUrl: string
  ): Promise<ScrapedCandidate | null> {
    console.log(`[Indeed] Fetching details for:`, describeScraperTarget(profileUrl));
    await this.delay(500);
    return null; // Would fetch full profile in production
  }

  async sendMessage(candidateId: string, message: string): Promise<boolean> {
    this.unsupportedPlatformSend();
  }
}

/**
 * Nationale Hulpgids Scraper (Legacy - using new implementation)
 */
class NationaleHulpgidsScraper extends BaseScraper {
  constructor(credentials?: PlatformCredentials) {
    super(
      "Nationale Hulpgids",
      "https://www.nationalehulpgids.nl",
      credentials
    );
  }

  async authenticate(): Promise<boolean> {
    if (!this.credentials) return false;

    const { NationaleHulpgidsScraper: EnhancedScraper } = await import(
      "./scrapers/nationaleHulpgids"
    );
    const enhancedScraper = new EnhancedScraper(this.credentials);
    return enhancedScraper.authenticate();
  }

  async searchCandidates(
    criteria: SearchCriteria,
    options: ScraperRunOptions = {}
  ): Promise<ScrapedCandidate[]> {
    // Use the new enhanced scraper
    const { NationaleHulpgidsScraper: EnhancedScraper } = await import(
      "./scrapers/nationaleHulpgids"
    );
    const enhancedScraper = new EnhancedScraper(this.credentials);
    return enhancedScraper.searchCandidates(criteria, options);
  }

  async getCandidateDetails(
    profileUrl: string
  ): Promise<ScrapedCandidate | null> {
    console.log(
      `[Nationale Hulpgids] Fetching details for:`,
      describeScraperTarget(profileUrl)
    );
    await this.delay(500);
    return null;
  }

  async sendMessage(candidateId: string, message: string): Promise<boolean> {
    this.unsupportedPlatformSend();
  }
}

/**
 * PGBvacatures.nl Scraper
 */
class PGBVacaturesScraper extends BaseScraper {
  constructor(credentials?: PlatformCredentials) {
    super("PGBvacatures", "https://www.pgbvacatures.nl", credentials);
  }

  async authenticate(): Promise<boolean> {
    console.warn(
      "[PGBvacatures] Authenticated automation is not implemented; public search remains available"
    );
    return false;
  }

  async searchCandidates(
    criteria: SearchCriteria,
    options: ScraperRunOptions = {}
  ): Promise<ScrapedCandidate[]> {
    // Use Crawlee-powered scraper
    const { createPGBvacaturesScraper } = await import(
      "./scrapers/crawleePGBvacatures"
    );
    const crawleeScraper = createPGBvacaturesScraper({
      email: this.credentials?.email || "",
      password: this.credentials?.password || "",
      maxRequestsPerCrawl: getScraperRequestLimit(),
    });

    const results = await crawleeScraper.searchCandidates({
      location: criteria.location || "Utrecht",
      services: criteria.services?.split(",").map(s => s.trim()),
    }, options);

    await crawleeScraper.close();
    return results.map(r => ({
      ...r,
      services: r.services?.join(", "),
      hourlyRate: r.hourlyRate ? `€${r.hourlyRate}/hour` : undefined,
      skills: [],
      languages: ["Nederlands"],
    }));
  }

  async getCandidateDetails(
    profileUrl: string
  ): Promise<ScrapedCandidate | null> {
    console.log(
      `[PGBvacatures] Fetching details for:`,
      describeScraperTarget(profileUrl)
    );
    await this.delay(500);
    return null;
  }

  async sendMessage(candidateId: string, message: string): Promise<boolean> {
    this.unsupportedPlatformSend();
  }
}

/**
 * Zorgbanen.nl Scraper
 */
class ZorgbanenScraper extends BaseScraper {
  constructor(credentials?: PlatformCredentials) {
    super("Zorgbanen", "https://www.zorgbanen.nl", credentials);
  }

  async authenticate(): Promise<boolean> {
    console.warn(
      "[Zorgbanen] Authenticated automation is not implemented; public search remains available"
    );
    return false;
  }

  async searchCandidates(
    criteria: SearchCriteria,
    options: ScraperRunOptions = {}
  ): Promise<ScrapedCandidate[]> {
    // Use Crawlee-powered scraper
    const { createZorgbanenScraper } = await import(
      "./scrapers/crawleeZorgbanen"
    );
    const crawleeScraper = createZorgbanenScraper({
      email: this.credentials?.email || "",
      password: this.credentials?.password || "",
      maxRequestsPerCrawl: getScraperRequestLimit(),
    });

    const results = await crawleeScraper.searchCandidates({
      location: criteria.location || "Den Haag",
      services: criteria.services?.split(",").map(s => s.trim()),
    }, options);

    await crawleeScraper.close();
    return results.map(r => ({
      ...r,
      services: r.services?.join(", "),
      hourlyRate: r.hourlyRate ? `€${r.hourlyRate}/hour` : undefined,
      skills: [],
      languages: ["Nederlands"],
      certifications: [],
    }));
  }

  async getCandidateDetails(
    profileUrl: string
  ): Promise<ScrapedCandidate | null> {
    console.log(`[Zorgbanen] Fetching details for:`, describeScraperTarget(profileUrl));
    await this.delay(500);
    return null;
  }

  async sendMessage(candidateId: string, message: string): Promise<boolean> {
    this.unsupportedPlatformSend();
  }
}

/**
 * Jobbird.com Scraper
 */
class JobbirdScraper extends BaseScraper {
  constructor(credentials?: PlatformCredentials) {
    super("Jobbird", "https://www.jobbird.com", credentials);
  }

  async authenticate(): Promise<boolean> {
    console.warn(
      "[Jobbird] Authenticated automation is not implemented; public search remains available"
    );
    return false;
  }

  async searchCandidates(
    criteria: SearchCriteria,
    options: ScraperRunOptions = {}
  ): Promise<ScrapedCandidate[]> {
    // Use Crawlee-powered scraper
    const { createJobbirdScraper } = await import("./scrapers/crawleeJobbird");
    const crawleeScraper = createJobbirdScraper({
      email: this.credentials?.email || "",
      password: this.credentials?.password || "",
      maxRequestsPerCrawl: getScraperRequestLimit(),
    });

    const results = await crawleeScraper.searchCandidates({
      location: criteria.location || "Eindhoven",
      services: criteria.services?.split(",").map(s => s.trim()),
    }, options);

    await crawleeScraper.close();
    return results.map(r => ({
      ...r,
      services: r.services?.join(", "),
      hourlyRate: r.hourlyRate ? `€${r.hourlyRate}/hour` : undefined,
      skills: [],
      languages: ["Nederlands"],
    }));
  }

  async getCandidateDetails(
    profileUrl: string
  ): Promise<ScrapedCandidate | null> {
    console.log(`[Jobbird] Fetching details for:`, describeScraperTarget(profileUrl));
    await this.delay(500);
    return null;
  }

  async sendMessage(candidateId: string, message: string): Promise<boolean> {
    this.unsupportedPlatformSend();
  }
}

/**
 * Platform Scraper Factory
 */
export class PlatformScraperFactory {
  static createScraper(
    platformName: string,
    credentials?: PlatformCredentials
  ): BaseScraper {
    switch (platformName.toLowerCase()) {
      case "indeed":
      case "indeed.com":
        return new IndeedScraper(credentials);

      case "nationale hulpgids":
      case "nationalehulpgids":
        return new NationaleHulpgidsScraper(credentials);

      case "pgbvacatures":
      case "pgbvacatures.nl":
        return new PGBVacaturesScraper(credentials);

      case "zorgbanen":
      case "zorgbanen.nl":
        return new ZorgbanenScraper(credentials);

      case "jobbird":
      case "jobbird.com":
        return new JobbirdScraper(credentials);

      default:
        throw new Error(`Unknown platform: ${platformName}`);
    }
  }

  /**
   * Search across multiple platforms in parallel
   */
  static async searchMultiplePlatforms(
    platformNames: string[],
    criteria: SearchCriteria,
    credentials?: Map<string, PlatformCredentials>,
    options: ScraperRunOptions = {}
  ): Promise<Map<string, ScrapedCandidate[]>> {
    const results = new Map<string, ScrapedCandidate[]>();

    const searchPromises = platformNames.map(async platformName => {
      try {
        const creds = credentials?.get(platformName);
        const scraper = this.createScraper(platformName, creds);

        // Authenticate if credentials provided
        if (creds) {
          await scraper.authenticate();
        }

        const candidates = await scraper.searchCandidates(criteria, options);
        results.set(platformName, candidates);
      } catch (error) {
        console.error(`Error scraping ${platformName}:`, error);
        results.set(platformName, []);
      }
    });

    await Promise.all(searchPromises);
    return results;
  }

  static async testConnection(
    platformName: string,
    credentials: PlatformCredentials
  ): Promise<PlatformConnectionTestResult> {
    const scraper = this.createScraper(platformName, credentials);
    return scraper.testConnection();
  }
}

export type {
  ScrapedCandidate,
  SearchCriteria,
  PlatformCredentials,
  ScraperRunOptions,
};
