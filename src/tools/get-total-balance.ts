/**
 * Get consolidated view of all balances
 */

import { z } from "zod";
import { getCardsSafe } from "../lib/cards";
import { getWalletsSafe, type Chain } from "../lib/wallets";
import { getWalletBalance, getUsdPrice } from "../lib/blockchain";

export const name = "get_total_balance";

export const description = "Get a consolidated view of all financial accounts: cards and crypto wallets. Shows individual and total balances.";

export const parameters = z.object({
  include_disabled: z.boolean().optional().describe("Include disabled accounts (default: false)"),
  crypto_only: z.boolean().optional().describe("Only show crypto wallets"),
  cards_only: z.boolean().optional().describe("Only show payment cards"),
});

interface BalanceItem {
  id: string;
  type: "card" | "wallet";
  name: string;
  chain?: string;
  balance?: string;
  currency?: string;
  usdValue?: number;
  status: "active" | "disabled" | "error";
  error?: string;
}

export async function execute(args: z.infer<typeof parameters>) {
  const includeDisabled = args.include_disabled ?? false;
  const items: BalanceItem[] = [];
  let totalUsdValue = 0;

  // Get cards (if not crypto_only)
  if (!args.crypto_only) {
    const cards = await getCardsSafe();
    const filteredCards = includeDisabled ? cards : cards.filter(c => c.enabled);

    for (const card of filteredCards) {
      items.push({
        id: card.id,
        type: "card",
        name: `${card.nickname} (****${card.lastFourDigits})`,
        currency: card.limits?.currency || "EUR",
        balance: "N/A", // Requires bank integration
        status: card.enabled ? "active" : "disabled",
      });
    }
  }

  // Get wallets (if not cards_only)
  if (!args.cards_only) {
    const wallets = await getWalletsSafe();
    const filteredWallets = includeDisabled ? wallets : wallets.filter(w => w.enabled);

    // Fetch balances in parallel
    const balancePromises = filteredWallets.map(async (wallet) => {
      try {
        const balance = await getWalletBalance(wallet.address, wallet.chain as Chain);
        const price = await getUsdPrice(balance.nativeCurrency);
        const usdValue = price ? parseFloat(balance.nativeBalanceFormatted) * price : undefined;

        if (usdValue) {
          totalUsdValue += usdValue;
        }

        return {
          id: wallet.id,
          type: "wallet" as const,
          name: wallet.nickname,
          chain: wallet.chain,
          balance: balance.nativeBalanceFormatted,
          currency: balance.nativeCurrency,
          usdValue,
          status: wallet.enabled ? "active" as const : "disabled" as const,
        };
      } catch (err) {
        return {
          id: wallet.id,
          type: "wallet" as const,
          name: wallet.nickname,
          chain: wallet.chain,
          status: "error" as const,
          error: err instanceof Error ? err.message : "Failed to fetch balance",
        };
      }
    });

    const walletResults = await Promise.all(balancePromises);
    items.push(...walletResults);
  }

  // Separate by type for summary
  const cardItems = items.filter(i => i.type === "card");
  const walletItems = items.filter(i => i.type === "wallet");
  const errorItems = items.filter(i => i.status === "error");

  return {
    success: true,
    summary: {
      totalAccounts: items.length,
      cards: cardItems.length,
      wallets: walletItems.length,
      errors: errorItems.length,
      totalCryptoUsd: totalUsdValue > 0 ? `$${totalUsdValue.toFixed(2)}` : null,
      note: cardItems.length > 0 ? "Card balances require bank integration (Plaid/Tink)" : undefined,
    },
    accounts: items.map(item => ({
      id: item.id,
      type: item.type,
      name: item.name,
      chain: item.chain,
      balance: item.balance || "N/A",
      currency: item.currency,
      usdValue: item.usdValue ? `$${item.usdValue.toFixed(2)}` : null,
      status: item.status,
      ...(item.error && { error: item.error }),
    })),
  };
}
