/**
 * Add a new crypto wallet
 */

import { z } from "zod";
import { randomUUID } from "crypto";
import { addWallet } from "../lib/wallets";
import type { WalletType } from "../lib/wallets";

export const name = "add_wallet";

export const description = `Add a new crypto wallet. Supports hot wallets (with private key - encrypted), watch-only (address only), and hardware wallets (address + device info).

For hot wallets: private key will be encrypted at rest.
For watch-only: only the address is stored, no spending capability.
For hardware: address is stored, transactions require hardware signing.`;

export const parameters = z.object({
  nickname: z.string().describe("Friendly name for the wallet (e.g., 'ETH principal', 'Trading wallet')"),
  address: z.string().describe("Public wallet address"),
  chain: z.enum(["ethereum", "polygon", "arbitrum", "optimism", "base", "avalanche", "bsc", "bitcoin", "solana", "starknet"])
    .describe("Blockchain network"),
  type: z.enum(["hot", "watch-only", "hardware"]).describe("Wallet type"),
  private_key: z.string().optional().describe("Private key (for hot wallets only - will be encrypted)"),
  mnemonic: z.string().optional().describe("Seed phrase (for hot wallets only - will be encrypted)"),
  hardware_type: z.enum(["ledger", "trezor", "other"]).optional().describe("Hardware wallet type"),
  derivation_path: z.string().optional().describe("Derivation path (e.g., m/44'/60'/0'/0/0)"),
  allowed_operations: z.array(z.enum(["send", "swap", "approve", "sign"])).optional()
    .describe("Allowed operations (default: all for hot, none for watch-only)"),
  per_transaction_limit: z.number().optional().describe("Max amount per transaction"),
  daily_limit: z.number().optional().describe("Max daily spending"),
  limit_token: z.string().optional().describe("Token symbol for limits (e.g., 'ETH', 'USDC')"),
});

export async function execute(args: z.infer<typeof parameters>) {
  try {
    // Validate based on type
    if (args.type === "hot" && !args.private_key && !args.mnemonic) {
      return {
        success: false,
        error: "Hot wallets require either a private_key or mnemonic",
      };
    }
    
    if (args.type === "watch-only" && (args.private_key || args.mnemonic)) {
      return {
        success: false,
        error: "Watch-only wallets cannot have private keys",
      };
    }
    
    if (args.type === "hardware" && !args.hardware_type) {
      return {
        success: false,
        error: "Hardware wallets must specify hardware_type",
      };
    }
    
    const walletId = randomUUID();
    
    // Default operations based on type
    let operations = args.allowed_operations;
    if (!operations) {
      if (args.type === "hot") {
        operations = ["send", "swap", "approve", "sign"];
      } else if (args.type === "hardware") {
        operations = ["send", "swap", "approve", "sign"]; // Requires hardware confirmation
      } else {
        operations = []; // Watch-only can't do anything
      }
    }
    
    await addWallet({
      id: walletId,
      nickname: args.nickname,
      address: args.address,
      chain: args.chain,
      type: args.type as WalletType,
      privateKey: args.private_key,
      mnemonic: args.mnemonic,
      hardwareType: args.hardware_type,
      derivationPath: args.derivation_path,
      enabled: true,
      allowedOperations: operations,
      limits: args.per_transaction_limit || args.daily_limit ? {
        perTransaction: args.per_transaction_limit,
        daily: args.daily_limit,
        tokenSymbol: args.limit_token ?? "ETH",
      } : undefined,
      addedAt: new Date().toISOString(),
    });
    
    const typeInfo = {
      hot: "Private key encrypted and stored securely",
      "watch-only": "Address only - no spending capability",
      hardware: `${args.hardware_type} wallet - requires device for signing`,
    };
    
    return {
      success: true,
      message: `Wallet "${args.nickname}" added successfully`,
      wallet_id: walletId,
      type: args.type,
      chain: args.chain,
      address: `${args.address.slice(0, 10)}...${args.address.slice(-8)}`,
      security_note: typeInfo[args.type as WalletType],
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to add wallet",
    };
  }
}
