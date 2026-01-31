import { CheerioCrawler, ProxyConfiguration } from "crawlee";
import type { CrawleeScraperConfig, ScrapedCandidate } from "./crawleeNationaleHulpgids";

/**
 * Crawlee-powered scraper for PGBvacatures
 * Features anti-detection, session management, and proxy rotation
 */
export class CrawleePGBvacaturesScraper {
  private config: CrawleeScraperConfig;
  private proxyConfiguration?: ProxyConfiguration;
  private sessionCookie?: string;

  constructor(config: CrawleeScraperConfig) {
    this.config = {
      maxConcurrency: 5,
      maxRequestsPerCrawl: 100,
      ...config,
    };

    if (config.proxyUrls && config.proxyUrls.length > 0) {
      this.proxyConfiguration = new ProxyConfiguration({
        proxyUrls: config.proxyUrls,
      });
    }
  }

  async authenticate(): Promise<boolean> {
    console.log("[Crawlee-PGBvacatures] Authentication not required for public listings");
    this.sessionCookie = "mock-session";
    return true;
  }

  async searchCandidates(criteria: {
    location: string;
    services?: string[];
    maxDistance?: number;
    minRating?: number;
  }): Promise<ScrapedCandidate[]> {
    console.log("[Crawlee-PGBvacatures] Starting candidate search:", criteria);

    const candidates: ScrapedCandidate[] = [];

    const crawler = new CheerioCrawler({
      maxRequestsPerCrawl: this.config.maxRequestsPerCrawl,
      maxConcurrency: this.config.maxConcurrency,
      proxyConfiguration: this.proxyConfiguration,

      async requestHandler({ request, $, log }) {
        log.info(`Processing ${request.url}`);

        // Extract job/candidate cards (PGBvacatures structure)
        $(".vacancy, .job-item, .result-item").each((index, element) => {
          const $el = $(element);

          const candidate: ScrapedCandidate = {
            name: $el.find(".title, h2, h3").first().text().trim() || "Unknown",
            email: $el.find("[href^='mailto:']").first().attr("href")?.replace("mailto:", ""),
            location: $el.find(".location, .plaats").first().text().trim() || criteria.location,
            experience: $el.find(".experience, .ervaring").first().text().trim(),
            services: criteria.services || ["PGB zorg"],
            availability: "Full-time",
            profileUrl: $el.find("a").first().attr("href") || request.url,
            platform: "PGBvacatures",
          };

          if (candidate.name && candidate.name !== "Unknown") {
            candidates.push(candidate);
          }
        });
      },

      failedRequestHandler({ request, log }, error) {
        log.error(`Request ${request.url} failed: ${error.message}`);
      },

      preNavigationHooks: [
        async ({ request }, goToOptions) => {
          goToOptions.headers = {
            ...goToOptions.headers,
            "Accept-Language": "nl-NL,nl;q=0.9",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          };
        },
      ],
    });

    const searchUrl = this.buildSearchUrl(criteria);
    await crawler.run([searchUrl]);

    console.log(`[Crawlee-PGBvacatures] Found ${candidates.length} candidates`);
    return candidates;
  }

  private buildSearchUrl(criteria: { location: string; services?: string[] }): string {
    const baseUrl = "https://www.pgbvacatures.nl/vacatures";
    const params = new URLSearchParams({
      zoekterm: criteria.services?.join(" ") || "zorg",
      plaats: criteria.location,
    });
    return `${baseUrl}?${params.toString()}`;
  }

  async close(): Promise<void> {
    console.log("[Crawlee-PGBvacatures] Scraper closed");
  }
}

export function createPGBvacaturesScraper(config: CrawleeScraperConfig): CrawleePGBvacaturesScraper {
  return new CrawleePGBvacaturesScraper(config);
}
