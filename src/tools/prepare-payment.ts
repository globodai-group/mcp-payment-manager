/**
 * Prepare a payment for confirmation
 * 
 * This creates a pending transaction that must be confirmed before execution.
 * Security: User must explicitly confirm with CVV before any charge.
 */

import { z } from "zod";
import { randomUUID } from "crypto";
import { getCard, logTransaction } from "../lib/cards";
import type { Transaction, CardUsage } from "../lib/cards";
import { isUnlocked, isPinConfigured } from "../lib/pin-manager";

export const name = "prepare_payment";

export const description = "Prepare a payment for a booking (flight, train, hotel, etc.). This creates a PENDING transaction that must be confirmed with confirm_payment before any charge is made.";

export const parameters = z.object({
  card_id: z.string().describe("ID of the card to use"),
  amount: z.number().describe("Amount to charge"),
  currency: z.string().describe("Currency code (EUR, USD, etc.)"),
  type: z.enum(["flight", "train", "hotel", "general"]).describe("Type of purchase"),
  description: z.string().describe("What is being purchased (e.g., 'Paris-London Eurostar 15 Feb')"),
  provider: z.string().describe("Booking provider (e.g., 'Trainline', 'Air France', 'Booking.com')"),
  details: z.record(z.unknown()).optional().describe("Additional booking details"),
});

export async function execute(args: z.infer<typeof parameters>) {
  // Check cards are unlocked
  if (!isPinConfigured()) {
    return {
      success: false,
      error: "Master PIN not configured. Use setup_pin first.",
    };
  }
  
  if (!isUnlocked()) {
    return {
      success: false,
      error: "Cards are locked. Use unlock_cards with your PIN first.",
    };
  }
  
  // Verify card exists and is enabled
  const card = await getCard(args.card_id);
  
  if (!card) {
    return {
      success: false,
      error: "Card not found",
    };
  }
  
  if (!card.enabled) {
    return {
      success: false,
      error: "Card is disabled",
    };
  }
  
  // Check usage restrictions
  if (!card.allowedUsage.includes("all") && !card.allowedUsage.includes(args.type)) {
    return {
      success: false,
      error: `Card "${card.nickname}" is not allowed for ${args.type} purchases. Allowed: ${card.allowedUsage.join(", ")}`,
    };
  }
  
  // Check limits
  if (card.limits?.perTransaction && args.amount > card.limits.perTransaction) {
    return {
      success: false,
      error: `Amount exceeds per-transaction limit of ${card.limits.perTransaction} ${card.limits.currency}`,
    };
  }
  
  // Create pending transaction
  const txId = randomUUID();
  const transaction: Transaction = {
    id: txId,
    cardId: card.id,
    type: args.type,
    amount: args.amount,
    currency: args.currency,
    description: args.description,
    provider: args.provider,
    status: "pending",
    createdAt: new Date().toISOString(),
    details: args.details,
  };
  
  await logTransaction(transaction);
  
  return {
    success: true,
    transaction_id: txId,
    status: "pending",
    summary: {
      card: `${card.nickname} (****${card.lastFourDigits})`,
      amount: `${args.amount} ${args.currency}`,
      type: args.type,
      description: args.description,
      provider: args.provider,
    },
    next_step: "Call confirm_payment with this transaction_id and the card CVV to complete the payment",
    warning: "NO CHARGE has been made yet. You must confirm to proceed.",
  };
}
