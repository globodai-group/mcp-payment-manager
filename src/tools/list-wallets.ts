/**
 * List saved crypto wallets (safe view - no private keys)
 */

import { z } from "zod";
import { getWalletsSafe, CHAIN_CONFIG } from "../lib/wallets";
import type { Chain } from "../lib/wallets";

export const name = "list_wallets";

export const description = "List all saved crypto wallets. Shows address, chain, type, and allowed operations. Does NOT show private keys.";

export const parameters = z.object({
  chain: z.enum(["ethereum", "polygon", "arbitrum", "optimism", "base", "avalanche", "bsc", "bitcoin", "solana", "starknet"]).optional()
    .describe("Filter by blockchain"),
  type: z.enum(["hot", "watch-only", "hardware"]).optional()
    .describe("Filter by wallet type"),
  enabled_only: z.boolean().optional().describe("Only show enabled wallets"),
});

export async function execute(args: z.infer<typeof parameters>) {
  const wallets = await getWalletsSafe();
  
  let filtered = wallets;
  
  if (args.chain) {
    filtered = filtered.filter((w) => w.chain === args.chain);
  }
  
  if (args.type) {
    filtered = filtered.filter((w) => w.type === args.type);
  }
  
  if (args.enabled_only) {
    filtered = filtered.filter((w) => w.enabled);
  }
  
  if (filtered.length === 0) {
    return { success: true, wallets: [], message: "No wallets found" };
  }
  
  const summary = filtered.map((w) => {
    const chainInfo = CHAIN_CONFIG[w.chain as Chain];
    return {
      id: w.id,
      nickname: w.nickname,
      chain: chainInfo?.name ?? w.chain,
      nativeCurrency: chainInfo?.nativeCurrency ?? "?",
      address: `${w.address.slice(0, 10)}...${w.address.slice(-8)}`,
      fullAddress: w.address,
      type: w.type,
      operations: w.allowedOperations.join(", "),
      enabled: w.enabled,
      lastUsed: w.lastUsedAt ?? "Never",
    };
  });
  
  return {
    success: true,
    count: summary.length,
    wallets: summary,
  };
}
