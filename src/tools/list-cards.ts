/**
 * List saved payment cards (safe view - no full card numbers)
 */

import { z } from "zod";
import { getCardsSafe } from "../lib/cards";

export const name = "list_cards";

export const description = "List all saved payment cards. Shows card type, last 4 digits, nickname, and allowed usage. Does NOT show full card numbers.";

export const parameters = z.object({
  enabled_only: z.boolean().optional().describe("Only show enabled cards"),
  usage_type: z.enum(["flight", "train", "hotel", "general", "all"]).optional().describe("Filter by allowed usage type"),
});

export async function execute(args: z.infer<typeof parameters>) {
  const cards = await getCardsSafe();
  
  let filtered = cards;
  
  if (args.enabled_only) {
    filtered = filtered.filter((c) => c.enabled);
  }
  
  if (args.usage_type) {
    filtered = filtered.filter((c) => 
      c.allowedUsage.includes(args.usage_type!) || c.allowedUsage.includes("all")
    );
  }
  
  if (filtered.length === 0) {
    return { success: true, cards: [], message: "No cards found" };
  }
  
  const summary = filtered.map((c) => ({
    id: c.id,
    nickname: c.nickname,
    type: c.cardType.toUpperCase(),
    lastFour: `****${c.lastFourDigits}`,
    cardholder: c.cardholderName,
    usage: c.allowedUsage.join(", "),
    enabled: c.enabled,
    lastUsed: c.lastUsedAt ?? "Never",
  }));
  
  return {
    success: true,
    count: summary.length,
    cards: summary,
  };
}
