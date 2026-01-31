import { CheerioCrawler, ProxyConfiguration } from "crawlee";
import type { CrawleeScraperConfig, ScrapedCandidate } from "./crawleeNationaleHulpgids";

/**
 * Crawlee-powered scraper for Zorgbanen
 * Features anti-detection, session management, and proxy rotation
 */
export class CrawleeZorgbanenScraper {
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
    console.log("[Crawlee-Zorgbanen] Authentication not required for public listings");
    this.sessionCookie = "mock-session";
    return true;
  }

  async searchCandidates(criteria: {
    location: string;
    services?: string[];
    maxDistance?: number;
    minRating?: number;
  }): Promise<ScrapedCandidate[]> {
    console.log("[Crawlee-Zorgbanen] Starting candidate search:", criteria);

    const candidates: ScrapedCandidate[] = [];

    const crawler = new CheerioCrawler({
      maxRequestsPerCrawl: this.config.maxRequestsPerCrawl,
      maxConcurrency: this.config.maxConcurrency,
      proxyConfiguration: this.proxyConfiguration,

      async requestHandler({ request, $, log }) {
        log.info(`Processing ${request.url}`);

        // Extract job cards (Zorgbanen structure)
        $(".vacature, .vacancy-item, .job-listing").each((index, element) => {
          const $el = $(element);

          const candidate: ScrapedCandidate = {
            name: $el.find(".title, h2, h3").first().text().trim() || "Unknown",
            email: $el.find("[href^='mailto:']").first().attr("href")?.replace("mailto:", ""),
            location: $el.find(".location, .locatie").first().text().trim() || criteria.location,
            experience: $el.find(".experience, .ervaring, .niveau").first().text().trim(),
            services: criteria.services || ["Zorg"],
            availability: "Full-time",
            profileUrl: $el.find("a").first().attr("href") || request.url,
            platform: "Zorgbanen",
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

    console.log(`[Crawlee-Zorgbanen] Found ${candidates.length} candidates`);
    return candidates;
  }

  private buildSearchUrl(criteria: { location: string; services?: string[] }): string {
    const baseUrl = "https://www.zorgbanen.nl/vacatures";
    const params = new URLSearchParams({
      q: criteria.services?.join(" ") || "zorg",
      l: criteria.location,
    });
    return `${baseUrl}?${params.toString()}`;
  }

  async close(): Promise<void> {
    console.log("[Crawlee-Zorgbanen] Scraper closed");
  }
}

export function createZorgbanenScraper(config: CrawleeScraperConfig): CrawleeZorgbanenScraper {
  return new CrawleeZorgbanenScraper(config);
}
