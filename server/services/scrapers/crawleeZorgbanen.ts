import { CheerioCrawler, ProxyConfiguration } from "crawlee";
import type {
  CrawleeScraperConfig,
  ScrapedCandidate,
} from "./crawleeNationaleHulpgids";
import { getCrawleeConfiguration } from "../../_core/crawleeStorage";
import {
  describeScraperSearchCriteria,
  describeScraperTarget,
} from "../scraperLog";
import {
  runWithScraperAbort,
  throwIfScraperAborted,
  type ScraperRunOptions,
} from "./scraperAbort";

/**
 * Crawlee-powered scraper for Zorgbanen
 * Features anti-detection, public listing discovery, and proxy rotation
 */
export class CrawleeZorgbanenScraper {
  private config: CrawleeScraperConfig;
  private proxyConfiguration?: ProxyConfiguration;

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
    console.warn(
      "[Crawlee-Zorgbanen] Authenticated automation is not implemented; using public listings only"
    );
    return false;
  }

  async searchCandidates(criteria: {
    location: string;
    services?: string[];
    maxDistance?: number;
    minRating?: number;
  }, options: ScraperRunOptions = {}): Promise<ScrapedCandidate[]> {
    console.log(
      "[Crawlee-Zorgbanen] Starting candidate search:",
      describeScraperSearchCriteria(criteria)
    );
    throwIfScraperAborted(options.signal);

    const candidates: ScrapedCandidate[] = [];

    const crawler = new CheerioCrawler(
      {
        maxRequestsPerCrawl: this.config.maxRequestsPerCrawl,
        maxConcurrency: this.config.maxConcurrency,
        proxyConfiguration: this.proxyConfiguration,

        async requestHandler({ request, $, log }) {
          throwIfScraperAborted(options.signal);
          log.info(`Processing ${describeScraperTarget(request.url)}`);

          // Extract job cards (Zorgbanen structure)
          $(".vacature, .vacancy-item, .job-listing").each((index, element) => {
            const $el = $(element);

            const candidate: ScrapedCandidate = {
              name:
                $el.find(".title, h2, h3").first().text().trim() || "Unknown",
              email: $el
                .find("[href^='mailto:']")
                .first()
                .attr("href")
                ?.replace("mailto:", ""),
              location:
                $el.find(".location, .locatie").first().text().trim() ||
                criteria.location,
              experience: $el
                .find(".experience, .ervaring, .niveau")
                .first()
                .text()
                .trim(),
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
          log.error(
            `Request ${describeScraperTarget(request.url)} failed: ${error.message}`
          );
        },

        preNavigationHooks: [
          async ({ request }, goToOptions) => {
            throwIfScraperAborted(options.signal);
            goToOptions.headers = {
              ...goToOptions.headers,
              "Accept-Language": "nl-NL,nl;q=0.9",
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            };
          },
        ],
      },
      getCrawleeConfiguration()
    );

    const searchUrl = this.buildSearchUrl(criteria);
    await runWithScraperAbort(crawler.run([searchUrl]), options.signal);

    console.log(`[Crawlee-Zorgbanen] Found ${candidates.length} candidates`);
    return candidates;
  }

  private buildSearchUrl(criteria: {
    location: string;
    services?: string[];
  }): string {
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

export function createZorgbanenScraper(
  config: CrawleeScraperConfig
): CrawleeZorgbanenScraper {
  return new CrawleeZorgbanenScraper(config);
}
