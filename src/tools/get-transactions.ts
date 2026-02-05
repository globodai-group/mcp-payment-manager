/**
 * Get transaction history
 */

import { z } from "zod";
import { getTransactions } from "../lib/cards";

export const name = "get_transactions";

export const description = "Get payment transaction history. Shows all bookings and payments made through the system.";

export const parameters = z.object({
  limit: z.number().optional().describe("Number of transactions to return (default: 20)"),
  status: z.enum(["pending", "confirmed", "completed", "failed", "refunded"]).optional()
    .describe("Filter by transaction status"),
  type: z.enum(["flight", "train", "hotel", "other"]).optional()
    .describe("Filter by transaction type"),
});

export async function execute(args: z.infer<typeof parameters>) {
  let transactions = await getTransactions(args.limit ?? 20);
  
  if (args.status) {
    transactions = transactions.filter((t) => t.status === args.status);
  }
  
  if (args.type) {
    transactions = transactions.filter((t) => t.type === args.type);
  }
  
  if (transactions.length === 0) {
    return { success: true, transactions: [], message: "No transactions found" };
  }
  
  return {
    success: true,
    count: transactions.length,
    transactions: transactions.map((t) => ({
      id: t.id,
      type: t.type,
      amount: `${t.amount} ${t.currency}`,
      description: t.description,
      provider: t.provider,
      status: t.status,
      reference: t.reference ?? "N/A",
      date: t.createdAt,
    })),
  };
}
