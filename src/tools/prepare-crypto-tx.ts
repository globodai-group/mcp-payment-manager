/**
 * Prepare a crypto transaction for confirmation
 * 
 * Creates a pending transaction that must be signed and broadcast.
 * For hardware wallets, signing happens on the device.
 */

import { z } from "zod";
import { randomUUID } from "crypto";
import { getWallet, logCryptoTransaction, CHAIN_CONFIG } from "../lib/wallets";
import type { CryptoTransaction } from "../lib/wallets";

export const name = "prepare_crypto_tx";

export const description = `Prepare a crypto transaction for signing. This creates a PENDING transaction that must be confirmed with sign_crypto_tx before broadcast.

Supports:
- Native token transfers (ETH, MATIC, etc.)
- ERC20/token transfers
- Contract interactions`;

export const parameters = z.object({
  wallet_id: z.string().describe("ID of the wallet to send from"),
  to: z.string().describe("Recipient address"),
  // Native or token
  amount: z.string().optional().describe("Amount to send (in human readable units, e.g., '0.5' for 0.5 ETH)"),
  token_address: z.string().optional().describe("Token contract address (omit for native currency)"),
  token_symbol: z.string().optional().describe("Token symbol (e.g., 'USDC')"),
  // Or raw contract call
  data: z.string().optional().describe("Raw transaction data (hex) for contract calls"),
  // Gas settings
  gas_limit: z.string().optional().describe("Gas limit (default: estimated)"),
  max_fee_per_gas: z.string().optional().describe("Max fee per gas in gwei"),
  max_priority_fee: z.string().optional().describe("Max priority fee in gwei"),
  // Description
  description: z.string().describe("What this transaction is for"),
});

export async function execute(args: z.infer<typeof parameters>) {
  // Get wallet
  const wallet = await getWallet(args.wallet_id);
  
  if (!wallet) {
    return { success: false, error: "Wallet not found" };
  }
  
  if (!wallet.enabled) {
    return { success: false, error: "Wallet is disabled" };
  }
  
  if (!wallet.allowedOperations.includes("send")) {
    return { success: false, error: "This wallet is not allowed to send transactions" };
  }
  
  // Validate recipient address (basic check)
  const chainConfig = CHAIN_CONFIG[wallet.chain];
  
  // Determine transaction type
  let txType: CryptoTransaction["type"] = "send";
  if (args.data) {
    txType = "contract";
  }
  
  // Create pending transaction
  const txId = randomUUID();
  const transaction: CryptoTransaction = {
    id: txId,
    walletId: wallet.id,
    chain: wallet.chain,
    type: txType,
    status: "pending",
    from: wallet.address,
    to: args.to,
    value: args.amount,
    tokenAddress: args.token_address,
    tokenSymbol: args.token_symbol,
    gasLimit: args.gas_limit,
    maxFeePerGas: args.max_fee_per_gas,
    maxPriorityFeePerGas: args.max_priority_fee,
    description: args.description,
    createdAt: new Date().toISOString(),
  };
  
  await logCryptoTransaction(transaction);
  
  const amountDisplay = args.token_symbol 
    ? `${args.amount} ${args.token_symbol}`
    : `${args.amount} ${chainConfig?.nativeCurrency ?? "tokens"}`;
  
  return {
    success: true,
    transaction_id: txId,
    status: "pending",
    summary: {
      from: `${wallet.nickname} (${wallet.address.slice(0, 10)}...)`,
      to: `${args.to.slice(0, 10)}...${args.to.slice(-8)}`,
      amount: amountDisplay,
      chain: chainConfig?.name ?? wallet.chain,
      type: txType,
      description: args.description,
    },
    wallet_type: wallet.type,
    next_step: wallet.type === "hardware" 
      ? "Connect your hardware wallet and call sign_crypto_tx to sign on device"
      : "Call sign_crypto_tx to sign and broadcast the transaction",
    warning: "NO TRANSACTION has been broadcast yet. You must sign to proceed.",
  };
}
