import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";

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

  candidates: router({
    list: protectedProcedure
      .input((val: unknown) => {
        if (typeof val === "object" && val !== null && "campaignId" in val && typeof val.campaignId === "number") {
          return { campaignId: val.campaignId };
        }
        throw new Error("Invalid input: expected object with numeric campaignId");
      })
      .query(async ({ input }) => {
        const { getCampaignCandidates } = await import("./db");
        return getCampaignCandidates(input.campaignId);
      }),
    
    get: protectedProcedure
      .input((val: unknown) => {
        if (typeof val === "object" && val !== null && "id" in val && typeof val.id === "number") {
          return { id: val.id };
        }
        throw new Error("Invalid input: expected object with numeric id");
      })
      .query(async ({ input }) => {
        const { getCandidateById } = await import("./db");
        return getCandidateById(input.id);
      }),
    
    matchFactors: protectedProcedure
      .input((val: unknown) => {
        if (typeof val === "object" && val !== null && "candidateId" in val && typeof val.candidateId === "number") {
          return { candidateId: val.candidateId };
        }
        throw new Error("Invalid input: expected object with numeric candidateId");
      })
      .query(async ({ input }) => {
        const { getCandidateMatchFactors } = await import("./db");
        return getCandidateMatchFactors(input.candidateId);
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
