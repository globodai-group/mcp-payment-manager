/**
 * Add a new payment card (encrypted storage)
 */

import { z } from "zod";
import { randomUUID } from "crypto";
import { addCard } from "../lib/cards";
import type { CardUsage } from "../lib/cards";
import { isUnlocked, isPinConfigured } from "../lib/pin-manager";
import { encryptCvv } from "../lib/cvv-crypto";

export const name = "add_card";

export const description = "Add a new payment card. Card number and expiration are encrypted. CVV is encrypted with your master PIN (requires unlock).";

export const parameters = z.object({
  nickname: z.string().describe("Friendly name for the card (e.g., 'Visa perso', 'Amex pro')"),
  card_number: z.string().describe("Full card number (will be encrypted)"),
  expiration: z.string().describe("Expiration date in MM/YY format"),
  cvv: z.string().describe("CVV/CVC (3-4 digits) - encrypted with your PIN, never shown"),
  cardholder_name: z.string().describe("Name as shown on the card"),
  allowed_usage: z.array(z.enum(["flight", "train", "hotel", "general", "all"])).optional()
    .describe("What this card can be used for (default: all)"),
  billing_street: z.string().optional().describe("Billing address street"),
  billing_city: z.string().optional().describe("Billing address city"),
  billing_postal_code: z.string().optional().describe("Billing postal code"),
  billing_country: z.string().optional().describe("Billing country (2-letter code)"),
  per_transaction_limit: z.number().optional().describe("Max amount per transaction"),
  daily_limit: z.number().optional().describe("Max daily spending"),
  monthly_limit: z.number().optional().describe("Max monthly spending"),
  limit_currency: z.string().optional().describe("Currency for limits (default: EUR)"),
});

export async function execute(args: z.infer<typeof parameters>) {
  try {
    // Check PIN is configured and unlocked
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
    
    // Validate CVV format
    if (!/^\d{3,4}$/.test(args.cvv)) {
      return {
        success: false,
        error: "Invalid CVV format (must be 3-4 digits)",
      };
    }
    
    // Encrypt CVV with PIN-derived key
    const encryptedCvv = encryptCvv(args.cvv);
    if (!encryptedCvv) {
      return {
        success: false,
        error: "Failed to encrypt CVV. Make sure cards are unlocked.",
      };
    }
    
    const cardId = randomUUID();
    
    await addCard({
      id: cardId,
      nickname: args.nickname,
      cardNumber: args.card_number,
      expirationDate: args.expiration,
      cvv: encryptedCvv,
      cardholderName: args.cardholder_name,
      cardType: "other", // Will be auto-detected
      lastFourDigits: "", // Will be set from card number
      allowedUsage: (args.allowed_usage as CardUsage[]) ?? ["all"],
      enabled: true,
      billingAddress: args.billing_street ? {
        street: args.billing_street,
        city: args.billing_city ?? "",
        postalCode: args.billing_postal_code ?? "",
        country: args.billing_country ?? "FR",
      } : undefined,
      limits: args.per_transaction_limit || args.daily_limit || args.monthly_limit ? {
        perTransaction: args.per_transaction_limit,
        daily: args.daily_limit,
        monthly: args.monthly_limit,
        currency: args.limit_currency ?? "EUR",
      } : undefined,
      addedAt: new Date().toISOString(),
    });
    
    return {
      success: true,
      message: `Card "${args.nickname}" added successfully`,
      card_id: cardId,
      security: "Card number and CVV encrypted. CVV protected by your master PIN.",
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to add card",
    };
  }
}
