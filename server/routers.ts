import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as db from "./db";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // Multi-platform reach-out tool routers
  platforms: router({
    list: publicProcedure.query(async () => {
      const { getAllPlatforms } = await import("./db");
      return getAllPlatforms();
    }),
  }),

  candidates: router({
    discover: protectedProcedure
      .input(
        z.object({
          campaignId: z.number(),
          platforms: z.array(z.string()),
          searchCriteria: z.object({
            location: z.string().optional(),
            experience: z.string().optional(),
            services: z.string().optional(),
            minBudget: z.string().optional(),
            maxBudget: z.string().optional(),
            keywords: z.string().optional(),
          }),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { PlatformScraperFactory } = await import("./services/platformScraper");
        const { calculateCompatibility } = await import(
          "./services/aiMatching"
        );

        // Get platform credentials for authenticated scraping
        const credentialsMap = new Map();
        const userCredentials = await db.getUserPlatformCredentials(ctx.user.id);
        userCredentials.forEach((cred: any) => {
          credentialsMap.set(cred.platform, {
            email: cred.email,
            password: cred.encryptedPassword, // In production, decrypt this
            sessionData: cred.sessionData,
          });
        });

        // Search across all selected platforms
        const results = await PlatformScraperFactory.searchMultiplePlatforms(
          input.platforms,
          input.searchCriteria,
          credentialsMap
        );

        // Get campaign details for matching
        const campaign = await db.getCampaignById(input.campaignId);
        if (!campaign) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Campaign not found" });
        }

        const campaignCriteria = JSON.parse(campaign.searchCriteria || "{}");

        // Process and store candidates
        const allCandidates = [];
        for (const [platform, candidates] of Array.from(results.entries())) {
          for (const candidate of candidates) {
            // Calculate compatibility score
            const matchResult = await calculateCompatibility(
              {
                location: candidate.location,
                experience: candidate.experience,
                hourlyRate: candidate.hourlyRate ? parseFloat(candidate.hourlyRate) : null,
              },
              campaignCriteria
            );
            const compatibilityScore = matchResult.compatibilityScore;

            // Store candidate in database
            // Find platformId from platform name
            const allPlatforms = await db.getAllPlatforms();
            const platformRecord = allPlatforms.find((p: any) => p.name.toLowerCase() === platform.toLowerCase());
            const platformId = platformRecord?.id || 1;
            
            const candidateId = await db.createCandidate({
              campaignId: input.campaignId,
              platformId,
              name: candidate.name,
              email: candidate.email,
              phone: candidate.phone,
              profileUrl: candidate.profileUrl,
              location: candidate.location,
              experience: candidate.experience,
              services: candidate.services,
              availability: candidate.availability,
              hourlyRate: candidate.hourlyRate ? parseFloat(candidate.hourlyRate) : null,
              bio: candidate.bio,
              compatibilityScore,
              matchReasons: JSON.stringify(matchResult.matchReasons || []),
              status: "discovered",
            });

            allCandidates.push({ ...candidate, id: candidateId, compatibilityScore });
          }
        }

        return {
          success: true,
          candidatesFound: allCandidates.length,
          candidates: allCandidates,
        };
      }),

    list: protectedProcedure
      .input(
        z.object({
          campaignId: z.number().optional(),
          platform: z.string().optional(),
          minScore: z.number().optional(),
        })
      )
      .query(async ({ input, ctx }) => {
        return db.getCampaignCandidates(input.campaignId || 0).then((candidates: any[]) => {
          return candidates.filter((c: any) => {
            if (input.platform && c.platform !== input.platform) return false;
            if (input.minScore && c.compatibilityScore < input.minScore) return false;
            return true;
          });
        });
        /*return db.getCandidates({
          userId: ctx.user.id,
          campaignId: input.campaignId,
          platform: input.platform,
          minScore: input.minScore,
        });*/
      }),
  }),

  campaigns: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const { getUserCampaigns } = await import("./db");
      return getUserCampaigns(ctx.user.id);
    }),
    
    get: protectedProcedure
      .input((val: unknown) => {
        if (typeof val === "object" && val !== null && "id" in val && typeof val.id === "number") {
          return { id: val.id };
        }
        throw new Error("Invalid input: expected object with numeric id");
      })
      .query(async ({ input }) => {
        const { getCampaignById } = await import("./db");
        return getCampaignById(input.id);
      }),
    
    create: protectedProcedure
      .input((val: unknown) => {
        if (
          typeof val === "object" &&
          val !== null &&
          "title" in val &&
          typeof val.title === "string" &&
          "targetPlatforms" in val &&
          typeof val.targetPlatforms === "string" &&
          "searchCriteria" in val &&
          typeof val.searchCriteria === "string"
        ) {
          return val as {
            title: string;
            description?: string;
            targetPlatforms: string;
            searchCriteria: string;
          };
        }
        throw new Error("Invalid campaign input");
      })
      .mutation(async ({ ctx, input }) => {
        const { createCampaign } = await import("./db");
        const campaignId = await createCampaign({
          userId: ctx.user.id,
          title: input.title,
          description: input.description,
          targetPlatforms: input.targetPlatforms,
          searchCriteria: input.searchCriteria,
          status: "draft",
        });
        return { id: campaignId };
      }),
    
    stats: protectedProcedure
      .input((val: unknown) => {
        if (typeof val === "object" && val !== null && "id" in val && typeof val.id === "number") {
          return { id: val.id };
        }
        throw new Error("Invalid input: expected object with numeric id");
      })
      .query(async ({ input }) => {
        const { getCampaignStats } = await import("./db");
        return getCampaignStats(input.id);
      }),
  }),

  messages: router({
    list: protectedProcedure
      .input((val: unknown) => {
        if (typeof val === "object" && val !== null && "campaignId" in val && typeof val.campaignId === "number") {
          return { campaignId: val.campaignId };
        }
        throw new Error("Invalid input: expected object with numeric campaignId");
      })
      .query(async ({ input }) => {
        const { getCampaignMessages } = await import("./db");
        return getCampaignMessages(input.campaignId);
      }),
    
    generate: protectedProcedure
      .input((val: unknown) => {
        if (
          typeof val === "object" &&
          val !== null &&
          "candidateId" in val &&
          typeof val.candidateId === "number" &&
          "campaignDescription" in val &&
          typeof val.campaignDescription === "string"
        ) {
          return val as {
            candidateId: number;
            campaignDescription: string;
            language?: "nl" | "en";
          };
        }
        throw new Error("Invalid input");
      })
      .mutation(async ({ input }) => {
        const { getCandidateById } = await import("./db");
        const { generateOutreachMessage } = await import("./services/aiMatching");
        
        const candidate = await getCandidateById(input.candidateId);
        if (!candidate) throw new Error("Candidate not found");
        
        return generateOutreachMessage(
          candidate,
          input.campaignDescription,
          input.language || "nl"
        );
      }),

    bulkOutreach: protectedProcedure
      .input(
        z.object({
          campaignId: z.number(),
          language: z.enum(["nl", "en"]).optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { getCampaignById, getCampaignCandidates, createMessage, getAllPlatforms } = await import("./db");
        const { generateOutreachMessage } = await import("./services/aiMatching");

        // Get campaign details
        const campaign = await getCampaignById(input.campaignId);
        if (!campaign) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Campaign not found" });
        }

        const searchCriteria = JSON.parse(campaign.searchCriteria || "{}");
        const compatibilityThreshold = searchCriteria.compatibilityThreshold || 70;

        // Get all candidates above threshold
        const allCandidates = await getCampaignCandidates(input.campaignId);
        const qualifiedCandidates = allCandidates.filter(
          (c) => c.compatibilityScore >= compatibilityThreshold
        );

        console.log(`[Bulk Outreach] Processing ${qualifiedCandidates.length} candidates for campaign ${input.campaignId}`);

        const results = {
          success: 0,
          failed: 0,
          messages: [] as any[],
        };

        // Generate and store messages for each candidate
        for (const candidate of qualifiedCandidates) {
          try {
            // Generate personalized message
            const { subject, content } = await generateOutreachMessage(
              candidate,
              campaign.description || "",
              input.language || "nl"
            );

            // Store message in database
            const messageId = await createMessage({
              campaignId: input.campaignId,
              candidateId: candidate.id,
              platformId: candidate.platformId,
              subject,
              content,
              language: input.language || "nl",
              status: "queued", // Messages are queued for sending
            });

            results.success++;
            results.messages.push({
              id: messageId,
              candidateId: candidate.id,
              candidateName: candidate.name,
              subject,
            });

            // Rate limiting: wait between message generation
            await new Promise((resolve) => setTimeout(resolve, 500));
          } catch (error) {
            console.error(`[Bulk Outreach] Failed to generate message for candidate ${candidate.id}:`, error);
            results.failed++;
          }
        }

        console.log(`[Bulk Outreach] Complete: ${results.success} messages queued, ${results.failed} failed`);

        return {
          success: true,
          totalCandidates: qualifiedCandidates.length,
          messagesQueued: results.success,
          messagesFailed: results.failed,
          messages: results.messages,
        };
      }),
  }),

  platformCredentials: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const { getUserPlatformCredentials } = await import("./db");
      return getUserPlatformCredentials(ctx.user.id);
    }),
    
    save: protectedProcedure
      .input((val: unknown) => {
        if (
          typeof val === "object" &&
          val !== null &&
          "platformId" in val &&
          typeof val.platformId === "number" &&
          "email" in val &&
          typeof val.email === "string"
        ) {
          return val as {
            platformId: number;
            email: string;
            password?: string;
            apiKey?: string;
          };
        }
        throw new Error("Invalid input");
      })
      .mutation(async ({ ctx, input }) => {
        const { upsertPlatformCredential } = await import("./db");
        
        // TODO: Encrypt password before storing
        const encryptedPassword = input.password ? Buffer.from(input.password).toString("base64") : undefined;
        
        const id = await upsertPlatformCredential({
          userId: ctx.user.id,
          platformId: input.platformId,
          email: input.email,
          encryptedPassword,
          apiKey: input.apiKey,
          isConnected: 0,
        });
        
        return { id };
      }),
  }),
});

export type AppRouter = typeof appRouter;
