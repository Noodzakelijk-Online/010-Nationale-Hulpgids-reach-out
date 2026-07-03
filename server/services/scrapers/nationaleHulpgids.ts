/**
 * Nationale Hulpgids Scraper
 *
 * Real implementation for scraping helper profiles from Nationale Hulpgids
 * Supports authenticated access with user credentials
 */

import * as cheerio from "cheerio";
import type {
  ScrapedCandidate,
  SearchCriteria,
  PlatformCredentials,
  ScraperRunOptions,
} from "../platformScraper";
import {
  describeScraperSearchCriteria,
  describeScraperTarget,
} from "../scraperLog";
import { throwIfScraperAborted } from "./scraperAbort";

export class NationaleHulpgidsScraper {
  private baseUrl = "https://www.nationalehulpgids.nl";
  private credentials?: PlatformCredentials;
  private sessionCookies: string = "";
  private isAuthenticated = false;

  constructor(credentials?: PlatformCredentials) {
    this.credentials = credentials;
  }

  protected supportsAuthenticatedAutomation(): boolean {
    return true;
  }

  /**
   * Authenticate with Nationale Hulpgids
   */
  async authenticate(): Promise<boolean> {
    if (!this.credentials) {
      console.log(
        "[Nationale Hulpgids] No credentials provided, proceeding without authentication"
      );
      return false;
    }

    try {
      console.log("[Nationale Hulpgids] Authenticating...");

      // Step 1: Get login page to extract CSRF token
      const loginPageResponse = await fetch(`${this.baseUrl}/inloggen`, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "nl-NL,nl;q=0.9,en-US;q=0.8,en;q=0.7",
        },
      });

      const loginPageHtml = await loginPageResponse.text();
      const $ = cheerio.load(loginPageHtml);

      // Extract CSRF token if present
      const csrfToken =
        $('input[name="_token"]').val() ||
        $('meta[name="csrf-token"]').attr("content");

      // Step 2: Submit login form
      const formData = new URLSearchParams({
        email: this.credentials.email,
        password: this.credentials.password,
        ...(csrfToken && { _token: csrfToken as string }),
      });

      const loginResponse = await fetch(`${this.baseUrl}/inloggen`, {
        method: "POST",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Content-Type": "application/x-www-form-urlencoded",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "nl-NL,nl;q=0.9",
          Referer: `${this.baseUrl}/inloggen`,
        },
        body: formData.toString(),
        redirect: "manual", // Don't follow redirects automatically
      });

      // Extract session cookies
      const setCookieHeaders = loginResponse.headers.getSetCookie();
      if (setCookieHeaders && setCookieHeaders.length > 0) {
        this.sessionCookies = setCookieHeaders
          .map(cookie => cookie.split(";")[0])
          .join("; ");
        this.isAuthenticated = true;
        console.log("[Nationale Hulpgids] Authentication successful");
        return true;
      }

      // Check if login was successful by looking at response
      if (loginResponse.status === 302 || loginResponse.status === 301) {
        const location = loginResponse.headers.get("location");
        if (location && !location.includes("inloggen")) {
          this.isAuthenticated = true;
          console.log(
            "[Nationale Hulpgids] Authentication successful (redirect)"
          );
          return true;
        }
      }

      console.error(
        "[Nationale Hulpgids] Authentication failed - no session cookies received"
      );
      return false;
    } catch (error) {
      console.error("[Nationale Hulpgids] Authentication error:", error);
      return false;
    }
  }

  /**
   * Search for helpers/candidates based on criteria
   */
  async searchCandidates(
    criteria: SearchCriteria,
    options: ScraperRunOptions = {}
  ): Promise<ScrapedCandidate[]> {
    try {
      console.log(
        "[Nationale Hulpgids] Searching with criteria:",
        describeScraperSearchCriteria(criteria)
      );
      throwIfScraperAborted(options.signal);

      // Ensure authentication if credentials provided
      if (this.credentials && !this.isAuthenticated) {
        await this.authenticate();
      }
      throwIfScraperAborted(options.signal);

      // Build search URL with parameters
      const searchParams = new URLSearchParams();
      if (criteria.location) {
        searchParams.append("plaats", criteria.location);
      }
      if (criteria.services) {
        searchParams.append("diensten", criteria.services);
      }
      if (criteria.keywords) {
        searchParams.append("q", criteria.keywords);
      }

      const searchUrl = `${this.baseUrl}/zoeken?${searchParams.toString()}`;
      console.log("[Nationale Hulpgids] Search URL:", searchUrl);

      // Fetch search results
      const response = await fetch(searchUrl, {
        signal: options.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "nl-NL,nl;q=0.9",
          ...(this.sessionCookies && { Cookie: this.sessionCookies }),
        },
      });
      throwIfScraperAborted(options.signal);

      if (!response.ok) {
        console.error(
          "[Nationale Hulpgids] Search failed:",
          response.status,
          response.statusText
        );
        return [];
      }

      const html = await response.text();
      throwIfScraperAborted(options.signal);
      const $ = cheerio.load(html);

      const candidates: ScrapedCandidate[] = [];

      // Parse search results - adjust selectors based on actual HTML structure
      $(".helper-card, .hulpverlener-card, .profile-card, .search-result").each(
        (index, element) => {
          try {
            const $card = $(element);

            // Extract candidate information
            const name = $card
              .find(".name, .helper-name, h3, h4")
              .first()
              .text()
              .trim();
            const profileUrl =
              $card.find("a").first().attr("href") ||
              $card.find("a[href*='/hulp/']").attr("href") ||
              "";
            const location = $card
              .find(".location, .plaats, .address")
              .first()
              .text()
              .trim();
            const services = $card
              .find(".services, .diensten, .specialisaties")
              .first()
              .text()
              .trim();
            const bio = $card
              .find(".bio, .description, .omschrijving, p")
              .first()
              .text()
              .trim();
            const hourlyRate = $card
              .find(".rate, .tarief, .prijs")
              .first()
              .text()
              .trim();
            const experience = $card
              .find(".experience, .ervaring")
              .first()
              .text()
              .trim();

            // Only add if we have at least a name and profile URL
            if (name && profileUrl) {
              candidates.push({
                name,
                profileUrl: profileUrl.startsWith("http")
                  ? profileUrl
                  : `${this.baseUrl}${profileUrl}`,
                location: location || criteria.location || "",
                services: services || "",
                bio: bio || "",
                hourlyRate: this.parseHourlyRate(hourlyRate),
                experience: experience || "",
                availability: "", // Would need to visit profile page for detailed availability
              });
            }
          } catch (error) {
            console.error(
              "[Nationale Hulpgids] Error parsing candidate card:",
              error
            );
          }
        }
      );

      console.log(`[Nationale Hulpgids] Found ${candidates.length} candidates`);

      if (candidates.length === 0) {
        console.warn(
          "[Nationale Hulpgids] No candidate cards found in search results"
        );
      }

      return candidates;
    } catch (error) {
      if (
        error instanceof DOMException &&
        error.name === "AbortError"
      ) {
        throw error;
      }
      console.error("[Nationale Hulpgids] Search error:", error);
      return [];
    }
  }

  /**
   * Get detailed candidate profile
   */
  async getCandidateDetails(
    profileUrl: string
  ): Promise<ScrapedCandidate | null> {
    try {
      console.log(
        "[Nationale Hulpgids] Fetching profile:",
        describeScraperTarget(profileUrl)
      );

      const response = await fetch(profileUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "nl-NL,nl;q=0.9",
          ...(this.sessionCookies && { Cookie: this.sessionCookies }),
        },
      });

      if (!response.ok) {
        console.error(
          "[Nationale Hulpgids] Failed to fetch profile:",
          response.status
        );
        return null;
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      // Extract detailed profile information
      const name = $("h1, .profile-name, .helper-name").first().text().trim();
      const location = $(".location, .plaats").first().text().trim();
      const bio = $(".bio, .description, .about, .over-mij")
        .first()
        .text()
        .trim();
      const services = $(".services, .diensten").text().trim();
      const experience = $(".experience, .ervaring").text().trim();
      const hourlyRate = $(".rate, .tarief").text().trim();
      const availability = $(".availability, .beschikbaarheid").text().trim();

      // Extract email and phone if available
      const email = this.extractEmail($("body").text());
      const phone = this.extractPhone($("body").text());

      return {
        name,
        email,
        phone,
        profileUrl,
        location,
        services,
        bio,
        hourlyRate: this.parseHourlyRate(hourlyRate),
        experience,
        availability,
      };
    } catch (error) {
      console.error(
        "[Nationale Hulpgids] Error fetching candidate details:",
        error
      );
      return null;
    }
  }

  /**
   * Parse hourly rate from text
   */
  private parseHourlyRate(text: string): string {
    if (!text) return "";
    const rateMatch = text.match(
      /€\s*(\d+(?:[.,]\d+)?)\s*(?:\/|per)\s*(?:uur|hour)/i
    );
    return rateMatch ? `€${rateMatch[1]}/hour` : text;
  }

  /**
   * Extract email from text
   */
  private extractEmail(text: string): string | undefined {
    const emailMatch = text.match(
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/
    );
    return emailMatch ? emailMatch[0] : undefined;
  }

  /**
   * Extract phone from text
   */
  private extractPhone(text: string): string | undefined {
    const phoneMatch = text.match(/(?:\+31|0)[0-9]{9,10}/);
    return phoneMatch ? phoneMatch[0] : undefined;
  }

  /**
   * Retained only as a guard against old call sites. Discovery must not emit
   * placeholder profiles when scraping fails or the platform markup changes.
   */
  private getMockData(_criteria: SearchCriteria): ScrapedCandidate[] {
    console.warn("[Nationale Hulpgids] Mock fallback disabled");
    return [];
  }

  /**
   * Send message to candidate (requires authentication)
   */
  async sendMessage(candidateId: string, message: string): Promise<boolean> {
    if (!this.isAuthenticated) {
      console.error(
        "[Nationale Hulpgids] Cannot send message - not authenticated"
      );
      return false;
    }

    throw new Error(
      "Nationale Hulpgids platform sending is not implemented. Use the approved manual send flow and record delivery evidence with messages.recordSendAttempt."
    );
  }
}
