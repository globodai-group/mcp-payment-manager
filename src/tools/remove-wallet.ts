/**
 * Remove a crypto wallet
 */

import { z } from "zod";
import { removeWallet, getWallet } from "../lib/wallets";

export const name = "remove_wallet";

export const description = "Remove a saved crypto wallet. This deletes the stored keys (if any). This action is irreversible.";

export const parameters = z.object({
  wallet_id: z.string().describe("ID of the wallet to remove"),
  confirm: z.boolean().describe("Must be true to confirm deletion"),
});

export async function execute(args: z.infer<typeof parameters>) {
  if (!args.confirm) {
    return {
      success: false,
      error: "You must set confirm=true to delete a wallet",
    };
  }
  
  const wallet = await getWallet(args.wallet_id);
  if (!wallet) {
    return {
      success: false,
      error: "Wallet not found",
    };
  }
  
  const removed = await removeWallet(args.wallet_id);
  
  if (removed) {
    return {
      success: true,
      message: `Wallet "${wallet.nickname}" (${wallet.address.slice(0, 10)}...) has been removed`,
      warning: wallet.type === "hot" ? "Private key has been deleted" : undefined,
    };
  } else {
    return {
      success: false,
      error: "Failed to remove wallet",
    };
  }
}
