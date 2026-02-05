/**
 * Get card lock status
 */

import { z } from "zod";
import { getStatus, isPinConfigured } from "../lib/pin-manager";
import { getCardsSafe } from "../lib/cards";

export const name = "card_status";

export const description = "Check if cards are locked or unlocked, and how many cards are saved.";

export const parameters = z.object({});

export async function execute(_args: z.infer<typeof parameters>) {
  const pinStatus = getStatus();
  const cards = await getCardsSafe();
  
  return {
    success: true,
    pin_configured: pinStatus.configured,
    cards_unlocked: pinStatus.unlocked,
    remaining_minutes: pinStatus.remainingMinutes ?? null,
    saved_cards: cards.length,
    cards: cards.map((c) => ({
      nickname: c.nickname,
      type: c.cardType.toUpperCase(),
      lastFour: `****${c.lastFourDigits}`,
      enabled: c.enabled,
    })),
  };
}
