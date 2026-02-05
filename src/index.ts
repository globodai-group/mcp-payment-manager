#!/usr/bin/env node

/**
 * Payment Manager MCP Server
 * 
 * Comprehensive personal finance management with bank cards and crypto wallets:
 * 
 * 🏦 CARDS (Fiat):
 * - Encrypted card storage (AES-256-GCM + AWS KMS)
 * - PIN-protected CVV access
 * - Two-step payment flow (prepare → confirm)
 * - Card status management (lock/unlock)
 * 
 * 🪙 WALLETS (Crypto):
 * - Multi-chain support (ETH, Polygon, Arbitrum, Base, Solana, Bitcoin)
 * - Hot, watch-only, and hardware wallet types
 * - Encrypted private key storage
 * - Real-time balance and transaction fetching
 * 
 * 🔐 SECURITY:
 * - All sensitive data encrypted at rest
 * - PIN-based access control
 * - Complete audit logging
 * - AWS KMS integration for enterprise security
 * 
 * Environment Variables:
 * - MCP_MASTER_KEY: Master encryption key (256-bit)
 * - AWS_KMS_KEY_ID: AWS KMS key ARN
 * - ETHERSCAN_API_KEY: For Ethereum data
 * - [CHAIN]SCAN_API_KEY: For other chain data
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// Card management tools
import * as addCard from "./tools/add-card.js";
import * as listCards from "./tools/list-cards.js";
import * as removeCard from "./tools/remove-card.js";
import * as cardStatus from "./tools/card-status.js";
import * as lockCards from "./tools/lock-cards.js";
import * as unlockCards from "./tools/unlock-cards.js";

// Wallet management tools
import * as addWallet from "./tools/add-wallet.js";
import * as listWallets from "./tools/list-wallets.js";
import * as removeWallet from "./tools/remove-wallet.js";
import * as getWalletBalance from "./tools/get-wallet-balance.js";
import * as getTotalBalance from "./tools/get-total-balance.js";
import * as listWalletTransactions from "./tools/list-wallet-transactions.js";

// Transaction tools
import * as getTransactions from "./tools/get-transactions.js";
import * as preparePayment from "./tools/prepare-payment.js";
import * as confirmPayment from "./tools/confirm-payment.js";
import * as prepareCryptoTx from "./tools/prepare-crypto-tx.js";
import * as signCryptoTx from "./tools/sign-crypto-tx.js";

// Security tools
import * as setupPin from "./tools/setup-pin.js";

const tools = [
  // Card Management
  addCard,
  listCards,
  removeCard,
  cardStatus,
  lockCards,
  unlockCards,
  // Wallet Management
  addWallet,
  listWallets,
  removeWallet,
  getWalletBalance,
  getTotalBalance,
  listWalletTransactions,
  // Transactions
  getTransactions,
  preparePayment,
  confirmPayment,
  prepareCryptoTx,
  signCryptoTx,
  // Security
  setupPin,
];

async function main() {
  // Verify critical environment variables
  const requiredEnvs = ['MCP_MASTER_KEY'];
  const missing = requiredEnvs.filter(env => !process.env[env]);
  if (missing.length > 0) {
    console.error(`❌ Missing critical environment variables: ${missing.join(', ')}`);
    console.error('⚠️  Payment Manager requires encryption keys for security!');
    process.exit(1);
  }

  const server = new McpServer({
    name: "mcp-payment-manager",
    version: "1.0.0",
  });

  // Register all tools
  for (const tool of tools) {
    server.tool(
      tool.name,
      tool.description,
      tool.parameters.shape,
      async (args: Record<string, unknown>) => {
        try {
          const result = await tool.execute(args as any);
          return {
            content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  success: false,
                  error: error instanceof Error ? error.message : "Unknown error",
                }),
              },
            ],
            isError: true,
          };
        }
      }
    );
  }

  // Connect to stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  console.error("🔒 Payment Manager MCP Server started - All data encrypted at rest");
}

main().catch(console.error);
