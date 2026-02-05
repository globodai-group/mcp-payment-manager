/**
 * Get wallet balance via blockchain API
 */

import { z } from "zod";
import { getWallet, getWalletsSafe, type Chain } from "../lib/wallets";
import { getWalletBalance, getUsdPrice } from "../lib/blockchain";

export const name = "get_wallet_balance";

export const description = "Get the current balance of a crypto wallet. Fetches live data from the blockchain.";

export const parameters = z.object({
  wallet_id: z.string().optional().describe("Wallet ID (use list_wallets to see available wallets)"),
  address: z.string().optional().describe("Wallet address (alternative to wallet_id)"),
  chain: z.enum(["ethereum", "polygon", "arbitrum", "optimism", "base", "avalanche", "bsc", "bitcoin", "solana", "starknet"]).optional()
    .describe("Blockchain (required if using address)"),
  include_usd: z.boolean().optional().describe("Include USD value conversion (default: true)"),
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

  try {
    const balance = await getWalletBalance(address, chain);
    
    // Get USD price if requested
    let usdValue: number | null = null;
    if (args.include_usd !== false) {
      const price = await getUsdPrice(balance.nativeCurrency);
      if (price) {
        usdValue = parseFloat(balance.nativeBalanceFormatted) * price;
      }
    }

    return {
      success: true,
      wallet: {
        address: `${address.slice(0, 10)}...${address.slice(-8)}`,
        fullAddress: address,
        chain,
      },
      balance: {
        native: balance.nativeBalanceFormatted,
        currency: balance.nativeCurrency,
        raw: balance.nativeBalance,
        usdValue: usdValue ? `$${usdValue.toFixed(2)}` : null,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: `Failed to fetch balance: ${err instanceof Error ? err.message : err}`,
    };
  }
}
