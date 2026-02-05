/**
 * List wallet transactions from blockchain
 */

import { z } from "zod";
import { getWallet, type Chain } from "../lib/wallets";
import { getWalletTransactions } from "../lib/blockchain";

export const name = "list_wallet_transactions";

export const description = "List recent transactions for a crypto wallet. Fetches live data from blockchain explorers.";

export const parameters = z.object({
  wallet_id: z.string().optional().describe("Wallet ID (use list_wallets to see available wallets)"),
  address: z.string().optional().describe("Wallet address (alternative to wallet_id)"),
  chain: z.enum(["ethereum", "polygon", "arbitrum", "optimism", "base", "avalanche", "bsc", "bitcoin", "solana", "starknet"]).optional()
    .describe("Blockchain (required if using address)"),
  limit: z.number().optional().describe("Number of transactions to return (default: 20, max: 50)"),
});

export async function execute(args: z.infer<typeof parameters>) {
  let address: string;
  let chain: Chain;

  // Get wallet by ID or use provided address
  if (args.wallet_id) {
    const wallet = await getWallet(args.wallet_id);
    if (!wallet) {
      return { success: false, error: `Wallet not found: ${args.wallet_id}` };
    }
    address = wallet.address;
    chain = wallet.chain;
  } else if (args.address && args.chain) {
    address = args.address;
    chain = args.chain;
  } else {
    return { 
      success: false, 
      error: "Provide either wallet_id or both address and chain" 
    };
  }

  const limit = Math.min(args.limit ?? 20, 50);

  try {
    const transactions = await getWalletTransactions(address, chain, limit);

    if (transactions.length === 0) {
      return {
        success: true,
        wallet: { address: `${address.slice(0, 10)}...${address.slice(-8)}`, chain },
        transactions: [],
        message: "No transactions found",
      };
    }

    return {
      success: true,
      wallet: {
        address: `${address.slice(0, 10)}...${address.slice(-8)}`,
        fullAddress: address,
        chain,
      },
      count: transactions.length,
      transactions: transactions.map((tx) => ({
        hash: `${tx.hash.slice(0, 10)}...${tx.hash.slice(-8)}`,
        fullHash: tx.hash,
        type: tx.isIncoming ? "RECEIVED" : "SENT",
        amount: tx.valueFormatted,
        from: tx.from ? `${tx.from.slice(0, 8)}...` : "N/A",
        to: tx.to ? `${tx.to.slice(0, 8)}...` : "N/A",
        status: tx.status,
        date: new Date(tx.timestamp).toISOString(),
        fee: tx.fee || null,
      })),
    };
  } catch (err) {
    return {
      success: false,
      error: `Failed to fetch transactions: ${err instanceof Error ? err.message : err}`,
    };
  }
}
