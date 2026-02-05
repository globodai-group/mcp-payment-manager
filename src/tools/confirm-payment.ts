/**
 * Confirm and execute a prepared payment
 * 
 * This is where the actual charge would happen.
 * CVV is retrieved from encrypted storage (requires PIN unlock).
 */

import { z } from "zod";
import { getCard, getCardCvv, getTransactions, updateTransaction, updateCardUsage } from "../lib/cards";
import { isUnlocked } from "../lib/pin-manager";

export const name = "confirm_payment";

export const description = "Confirm and execute a prepared payment. Cards must be unlocked with your PIN. CVV is retrieved from secure storage.";

export const parameters = z.object({
  transaction_id: z.string().describe("ID of the pending transaction to confirm"),
  confirm: z.boolean().describe("Must be true to confirm you want to proceed with the charge"),
});

export async function execute(args: z.infer<typeof parameters>) {
  if (!args.confirm) {
    return {
      success: false,
      error: "You must set confirm=true to proceed with the payment",
    };
  }
  
  // Check cards are unlocked
  if (!isUnlocked()) {
    return {
      success: false,
      error: "Cards are locked. Use unlock_cards with your PIN first.",
    };
  }
  
  // Find the pending transaction
  const transactions = await getTransactions(100);
  const tx = transactions.find((t) => t.id === args.transaction_id);
  
  if (!tx) {
    return {
      success: false,
      error: "Transaction not found",
    };
  }
  
  if (tx.status !== "pending") {
    return {
      success: false,
      error: `Transaction is already ${tx.status}`,
    };
  }
  
  // Get the card
  const card = await getCard(tx.cardId);
  if (!card) {
    return {
      success: false,
      error: "Card no longer exists",
    };
  }
  
  // Get CVV from encrypted storage
  const cvv = await getCardCvv(tx.cardId);
  if (!cvv) {
    return {
      success: false,
      error: "Could not retrieve CVV. Make sure cards are unlocked.",
    };
  }
  
  // Here we would integrate with actual payment providers
  // CVV is available in `cvv` variable for the API call
  // For now, we mark as confirmed and return what would be needed
  
  await updateTransaction(tx.id, {
    status: "confirmed",
    confirmedAt: new Date().toISOString(),
  });
  
  await updateCardUsage(card.id);
  
  return {
    success: true,
    status: "confirmed",
    transaction_id: tx.id,
    message: `Payment of ${tx.amount} ${tx.currency} confirmed`,
    summary: {
      card: `${card.nickname} (****${card.lastFourDigits})`,
      amount: `${tx.amount} ${tx.currency}`,
      type: tx.type,
      description: tx.description,
      provider: tx.provider,
    },
    // In production, this would return actual booking reference
    note: "Integration with payment provider needed. Transaction marked as confirmed.",
    next_steps: [
      "Integrate with Stripe/payment processor for actual charge",
      "Integrate with booking APIs (Amadeus, Trainline, etc.) for reservations",
    ],
  };
}
