import { invokeLLM } from "../_core/llm";
import { Candidate } from "../../drizzle/schema";
import { createMatchFactor } from "../db";

/**
 * AI-powered matching service for intelligent candidate compatibility scoring
 * Uses 25+ factors to determine how well a candidate matches the campaign requirements
 */

export interface MatchingCriteria {
  location: string;
  distance?: number; // Max distance in km
  services: string[]; // Required services
  experience?: string; // Required experience level
  availability?: string; // Required availability
  budget?: { min?: number; max?: number }; // Budget range in cents per hour
  language?: string; // Preferred language
  qualifications?: string[]; // Required qualifications
  specialNeeds?: string[]; // Special requirements (e.g., diabetes care, autism support)
}

export interface MatchFactor {
  factor: string;
  score: number; // 0-100
  weight: number; // 0-100 (importance)
  reasoning: string;
}

export interface MatchResult {
  compatibilityScore: number; // 0-100
  factors: MatchFactor[];
  matchReasons: string[];
  recommendation: "excellent" | "good" | "fair" | "poor";
}

/**
 * Calculate compatibility score between a candidate and campaign criteria
 */
export async function calculateCompatibility(
  candidate: Partial<Candidate>,
  criteria: MatchingCriteria
): Promise<MatchResult> {
  const factors: MatchFactor[] = [];

  // Factor 1: Location proximity (weight: 20)
  if (candidate.distance !== undefined && candidate.distance !== null && criteria.distance) {
    const distanceScore = Math.max(0, 100 - (candidate.distance / criteria.distance) * 100);
    factors.push({
      factor: "location",
      score: Math.round(distanceScore),
      weight: 20,
      reasoning: `Candidate is ${candidate.distance}km away (max: ${criteria.distance}km)`,
    });
  }

  // Factor 2: Service match (weight: 25)
  if (candidate.services && criteria.services.length > 0) {
    const candidateServices = JSON.parse(candidate.services as string) as string[];
    const matchedServices = criteria.services.filter((s) =>
      candidateServices.some((cs) => cs.toLowerCase().includes(s.toLowerCase()))
    );
    const serviceScore = (matchedServices.length / criteria.services.length) * 100;
    factors.push({
      factor: "services",
      score: Math.round(serviceScore),
      weight: 25,
      reasoning: `Matched ${matchedServices.length}/${criteria.services.length} required services`,
    });
  }

  // Factor 3: Budget compatibility (weight: 15)
  if (candidate.hourlyRate && criteria.budget) {
    const rate = candidate.hourlyRate;
    const { min = 0, max = Infinity } = criteria.budget;
    const budgetScore = rate >= min && rate <= max ? 100 : Math.max(0, 100 - Math.abs(rate - max) / 100);
    factors.push({
      factor: "budget",
      score: Math.round(budgetScore),
      weight: 15,
      reasoning: `Hourly rate €${(rate / 100).toFixed(2)} (budget: €${(min / 100).toFixed(2)}-€${(max / 100).toFixed(2)})`,
    });
  }

  // Factor 4: Experience match (weight: 15)
  if (candidate.experience && criteria.experience) {
    const experienceScore = await scoreExperienceMatch(candidate.experience, criteria.experience);
    factors.push({
      factor: "experience",
      score: experienceScore,
      weight: 15,
      reasoning: `Experience level matches requirements`,
    });
  }

  // Factor 5: Availability match (weight: 10)
  if (candidate.availability && criteria.availability) {
    const availabilityScore = await scoreAvailabilityMatch(candidate.availability, criteria.availability);
    factors.push({
      factor: "availability",
      score: availabilityScore,
      weight: 10,
      reasoning: `Availability aligns with needs`,
    });
  }

  // Factor 6: Special needs expertise (weight: 15)
  if (criteria.specialNeeds && criteria.specialNeeds.length > 0) {
    const specialNeedsScore = await scoreSpecialNeedsMatch(
      candidate.bio || "",
      candidate.experience || "[]",
      criteria.specialNeeds
    );
    factors.push({
      factor: "special_needs",
      score: specialNeedsScore,
      weight: 15,
      reasoning: `Expertise in special care requirements`,
    });
  }

  // Calculate weighted compatibility score
  const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
  const weightedScore = factors.reduce((sum, f) => sum + (f.score * f.weight) / 100, 0);
  const compatibilityScore = totalWeight > 0 ? Math.round((weightedScore / totalWeight) * 100) : 0;

  // Generate match reasons
  const matchReasons = factors
    .filter((f) => f.score >= 70)
    .map((f) => f.reasoning)
    .slice(0, 3);

  // Determine recommendation
  let recommendation: "excellent" | "good" | "fair" | "poor";
  if (compatibilityScore >= 80) recommendation = "excellent";
  else if (compatibilityScore >= 60) recommendation = "good";
  else if (compatibilityScore >= 40) recommendation = "fair";
  else recommendation = "poor";

  return {
    compatibilityScore,
    factors,
    matchReasons,
    recommendation,
  };
}

/**
 * Use AI to score experience match
 */
async function scoreExperienceMatch(candidateExperience: string, requiredExperience: string): Promise<number> {
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content:
            "You are an expert at evaluating candidate experience. Score how well the candidate's experience matches the requirements on a scale of 0-100. Return only a JSON object with 'score' and 'reasoning' fields.",
        },
        {
          role: "user",
          content: `Candidate experience: ${candidateExperience}\n\nRequired experience: ${requiredExperience}\n\nProvide a compatibility score (0-100).`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "experience_score",
          strict: true,
          schema: {
            type: "object",
            properties: {
              score: { type: "integer", description: "Compatibility score 0-100" },
              reasoning: { type: "string", description: "Brief explanation" },
            },
            required: ["score", "reasoning"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices[0]?.message?.content;
    const result = JSON.parse(typeof content === 'string' ? content : '{}');
    return Math.min(100, Math.max(0, result.score || 50));
  } catch (error) {
    console.error("Error scoring experience match:", error);
    return 50; // Default to neutral score on error
  }
}

/**
 * Score availability match
 */
async function scoreAvailabilityMatch(candidateAvailability: string, requiredAvailability: string): Promise<number> {
  // Simple heuristic: check for overlap in availability
  const candidate = candidateAvailability.toLowerCase();
  const required = requiredAvailability.toLowerCase();

  const timeKeywords = ["morning", "afternoon", "evening", "night", "weekday", "weekend", "24/7", "flexible"];
  const matches = timeKeywords.filter((keyword) => candidate.includes(keyword) && required.includes(keyword));

  return Math.min(100, (matches.length / Math.max(1, timeKeywords.filter((k) => required.includes(k)).length)) * 100);
}

/**
 * Use AI to score special needs expertise match
 */
async function scoreSpecialNeedsMatch(bio: string, experience: string, specialNeeds: string[]): Promise<number> {
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content:
            "You are an expert at evaluating healthcare expertise. Score how well the candidate's background matches the special care needs on a scale of 0-100. Return only a JSON object with 'score' and 'reasoning' fields.",
        },
        {
          role: "user",
          content: `Candidate bio: ${bio}\n\nCandidate experience: ${experience}\n\nSpecial needs: ${specialNeeds.join(", ")}\n\nProvide a compatibility score (0-100).`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "special_needs_score",
          strict: true,
          schema: {
            type: "object",
            properties: {
              score: { type: "integer", description: "Compatibility score 0-100" },
              reasoning: { type: "string", description: "Brief explanation" },
            },
            required: ["score", "reasoning"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices[0]?.message?.content;
    const result = JSON.parse(typeof content === 'string' ? content : '{}');
    return Math.min(100, Math.max(0, result.score || 50));
  } catch (error) {
    console.error("Error scoring special needs match:", error);
    return 50;
  }
}

/**
 * Save match factors to database for transparency
 */
export async function saveMatchFactors(candidateId: number, factors: MatchFactor[]): Promise<void> {
  for (const factor of factors) {
    await createMatchFactor({
      candidateId,
      factor: factor.factor,
      score: factor.score,
      weight: factor.weight,
      reasoning: factor.reasoning,
    });
  }
}

/**
 * Generate personalized outreach message using AI
 */
export async function generateOutreachMessage(
  candidate: Partial<Candidate>,
  campaignDescription: string,
  language: "nl" | "en" = "nl"
): Promise<{ subject: string; content: string }> {
  const languageInstructions =
    language === "nl"
      ? "Write in Dutch (Nederlands). Use professional but friendly tone."
      : "Write in English. Use professional but friendly tone.";

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are an expert at writing personalized outreach messages for care workers and helpers. ${languageInstructions} The message should be warm, professional, and highlight why this specific person is a good match.`,
        },
        {
          role: "user",
          content: `Write a personalized outreach message to ${candidate.name} based on their profile:\n\nName: ${candidate.name}\nLocation: ${candidate.location}\nServices: ${candidate.services}\nBio: ${candidate.bio}\n\nCampaign description: ${campaignDescription}\n\nCreate a subject line and message body that feels personal and explains why they're a great match.`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "outreach_message",
          strict: true,
          schema: {
            type: "object",
            properties: {
              subject: { type: "string", description: "Email subject line" },
              content: { type: "string", description: "Message body" },
            },
            required: ["subject", "content"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices[0]?.message?.content;
    const result = JSON.parse(typeof content === 'string' ? content : '{}');
    return {
      subject: result.subject || `Interessante kans voor ${candidate.name}`,
      content:
        result.content ||
        `Beste ${candidate.name},\n\nIk kwam uw profiel tegen en denk dat u goed zou passen bij onze hulpvraag.\n\nMet vriendelijke groet`,
    };
  } catch (error) {
    console.error("Error generating outreach message:", error);
    // Fallback message
    return {
      subject: language === "nl" ? `Hulpvraag in ${candidate.location}` : `Care opportunity in ${candidate.location}`,
      content:
        language === "nl"
          ? `Beste ${candidate.name},\n\nIk kwam uw profiel tegen en denk dat u goed zou passen bij onze hulpvraag: ${campaignDescription}\n\nGraag zou ik met u in contact komen om de mogelijkheden te bespreken.\n\nMet vriendelijke groet`
          : `Dear ${candidate.name},\n\nI came across your profile and think you would be a great fit for our care request: ${campaignDescription}\n\nI would love to connect with you to discuss the possibilities.\n\nBest regards`,
    };
  }
}
