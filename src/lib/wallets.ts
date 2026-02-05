/**
 * Crypto Wallet Management
 * 
 * Secure storage for crypto wallets with encrypted private keys.
 * Supports multiple chains and watch-only wallets.
 * 
 * Security model:
 * - Private keys encrypted at rest (same as card numbers)
 * - Watch-only wallets for balance checking without spending
 * - Transaction signing requires explicit confirmation
 * - Support for hardware wallet addresses (no key storage)
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { encrypt, decrypt, isEncrypted } from "./crypto";

// Sensitive fields that must be encrypted
const SENSITIVE_FIELDS = ["privateKey", "mnemonic"];

export type Chain = 
  | "ethereum" 
  | "polygon" 
  | "arbitrum" 
  | "optimism"
  | "base"
  | "avalanche"
  | "bsc"
  | "bitcoin"
  | "solana"
  | "starknet";

export type WalletType = "hot" | "watch-only" | "hardware";

export interface CryptoWallet {
  id: string;
  nickname: string; // e.g., "ETH principal", "Trading wallet"
  address: string; // Public address
  chain: Chain;
  type: WalletType;
  // Only for hot wallets (encrypted)
  privateKey?: string;
  mnemonic?: string;
  // Hardware wallet info
  hardwareType?: "ledger" | "trezor" | "other";
  derivationPath?: string;
  // Settings
  enabled: boolean;
  allowedOperations: ("send" | "swap" | "approve" | "sign")[];
  // Spending limits (optional)
  limits?: {
    perTransaction?: number;
    daily?: number;
    tokenSymbol: string; // e.g., "ETH", "USDC"
  };
  // Metadata
  addedAt: string;
  lastUsedAt?: string;
}

export interface CryptoTransaction {
  id: string;
  walletId: string;
  chain: Chain;
  type: "send" | "swap" | "approve" | "contract";
  status: "pending" | "signed" | "broadcast" | "confirmed" | "failed";
  // Transaction details
  from: string;
  to: string;
  value?: string; // In wei/lamports/etc
  tokenAddress?: string;
  tokenSymbol?: string;
  tokenAmount?: string;
  // Gas/fees
  gasLimit?: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  // Result
  txHash?: string;
  blockNumber?: number;
  // Timestamps
  createdAt: string;
  signedAt?: string;
  broadcastAt?: string;
  confirmedAt?: string;
  // Description
  description: string;
}

const CONFIG_DIR = join(homedir(), ".mcp-ecosystem");
const WALLETS_FILE = join(CONFIG_DIR, "crypto-wallets.json");
const CRYPTO_TX_FILE = join(CONFIG_DIR, "crypto-transactions.json");

// Chain configurations
export const CHAIN_CONFIG: Record<Chain, { name: string; nativeCurrency: string; explorerUrl: string; rpcEnvVar: string }> = {
  ethereum: { name: "Ethereum", nativeCurrency: "ETH", explorerUrl: "https://etherscan.io", rpcEnvVar: "ETH_RPC_URL" },
  polygon: { name: "Polygon", nativeCurrency: "MATIC", explorerUrl: "https://polygonscan.com", rpcEnvVar: "POLYGON_RPC_URL" },
  arbitrum: { name: "Arbitrum", nativeCurrency: "ETH", explorerUrl: "https://arbiscan.io", rpcEnvVar: "ARBITRUM_RPC_URL" },
  optimism: { name: "Optimism", nativeCurrency: "ETH", explorerUrl: "https://optimistic.etherscan.io", rpcEnvVar: "OPTIMISM_RPC_URL" },
  base: { name: "Base", nativeCurrency: "ETH", explorerUrl: "https://basescan.org", rpcEnvVar: "BASE_RPC_URL" },
  avalanche: { name: "Avalanche", nativeCurrency: "AVAX", explorerUrl: "https://snowtrace.io", rpcEnvVar: "AVAX_RPC_URL" },
  bsc: { name: "BNB Chain", nativeCurrency: "BNB", explorerUrl: "https://bscscan.com", rpcEnvVar: "BSC_RPC_URL" },
  bitcoin: { name: "Bitcoin", nativeCurrency: "BTC", explorerUrl: "https://mempool.space", rpcEnvVar: "BTC_RPC_URL" },
  solana: { name: "Solana", nativeCurrency: "SOL", explorerUrl: "https://solscan.io", rpcEnvVar: "SOLANA_RPC_URL" },
  starknet: { name: "Starknet", nativeCurrency: "ETH", explorerUrl: "https://starkscan.co", rpcEnvVar: "STARKNET_RPC_URL" },
};

/**
 * Validate Ethereum-like address
 */
export function isValidEvmAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Validate Bitcoin address (basic check)
 */
export function isValidBtcAddress(address: string): boolean {
  // Supports legacy (1...), SegWit (3...), and native SegWit (bc1...)
  return /^(1|3)[a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(address) || /^bc1[a-z0-9]{39,59}$/.test(address);
}

/**
 * Validate Solana address
 */
export function isValidSolanaAddress(address: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
}

/**
 * Validate address based on chain
 */
export function isValidAddress(address: string, chain: Chain): boolean {
  if (chain === "bitcoin") return isValidBtcAddress(address);
  if (chain === "solana") return isValidSolanaAddress(address);
  // All EVM chains
  return isValidEvmAddress(address);
}

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

/**
 * Decrypt sensitive fields in a wallet
 */
async function decryptWallet(wallet: CryptoWallet): Promise<CryptoWallet> {
  const decrypted = { ...wallet };
  
  for (const field of SENSITIVE_FIELDS) {
    const value = (decrypted as any)[field];
    if (value && typeof value === "string" && isEncrypted(value)) {
      try {
        (decrypted as any)[field] = await decrypt(value);
      } catch (err) {
        console.error(`[wallets] Failed to decrypt ${field} for wallet ${wallet.nickname}`);
      }
    }
  }
  
  return decrypted;
}

/**
 * Encrypt sensitive fields in a wallet
 */
async function encryptWallet(wallet: CryptoWallet): Promise<CryptoWallet> {
  const encrypted = { ...wallet };
  
  for (const field of SENSITIVE_FIELDS) {
    const value = (encrypted as any)[field];
    if (value && typeof value === "string" && !isEncrypted(value)) {
      (encrypted as any)[field] = await encrypt(value);
    }
  }
  
  return encrypted;
}

// ============================================================================
// Wallet CRUD
// ============================================================================

export async function getWallets(): Promise<CryptoWallet[]> {
  ensureConfigDir();
  
  if (!existsSync(WALLETS_FILE)) {
    return [];
  }

  try {
    const data = readFileSync(WALLETS_FILE, "utf-8");
    const wallets: CryptoWallet[] = JSON.parse(data);
    return Promise.all(wallets.map(decryptWallet));
  } catch {
    return [];
  }
}

export async function getWallet(id: string): Promise<CryptoWallet | null> {
  const wallets = await getWallets();
  return wallets.find((w) => w.id === id) ?? null;
}

/**
 * Get wallets without sensitive data (for listing)
 */
export async function getWalletsSafe(): Promise<Omit<CryptoWallet, "privateKey" | "mnemonic">[]> {
  const wallets = await getWallets();
  return wallets.map(({ privateKey, mnemonic, ...safe }) => safe);
}

export async function addWallet(wallet: CryptoWallet): Promise<void> {
  ensureConfigDir();
  
  // Validate address
  if (!isValidAddress(wallet.address, wallet.chain)) {
    throw new Error(`Invalid ${wallet.chain} address`);
  }
  
  wallet.addedAt = new Date().toISOString();
  
  // Load existing
  let rawWallets: CryptoWallet[] = [];
  if (existsSync(WALLETS_FILE)) {
    try {
      rawWallets = JSON.parse(readFileSync(WALLETS_FILE, "utf-8"));
    } catch {
      rawWallets = [];
    }
  }
  
  // Encrypt and save
  const encryptedWallet = await encryptWallet(wallet);
  
  const existingIndex = rawWallets.findIndex((w) => w.id === wallet.id);
  if (existingIndex >= 0) {
    rawWallets[existingIndex] = encryptedWallet;
  } else {
    rawWallets.push(encryptedWallet);
  }
  
  writeFileSync(WALLETS_FILE, JSON.stringify(rawWallets, null, 2), { mode: 0o600 });
  console.error(`[wallets] Saved wallet ${wallet.nickname} (${wallet.address.slice(0, 8)}...) - ${wallet.type}`);
}

export async function removeWallet(id: string): Promise<boolean> {
  if (!existsSync(WALLETS_FILE)) {
    return false;
  }
  
  let rawWallets: CryptoWallet[] = [];
  try {
    rawWallets = JSON.parse(readFileSync(WALLETS_FILE, "utf-8"));
  } catch {
    return false;
  }
  
  const filtered = rawWallets.filter((w) => w.id !== id);
  
  if (filtered.length === rawWallets.length) {
    return false;
  }
  
  writeFileSync(WALLETS_FILE, JSON.stringify(filtered, null, 2), { mode: 0o600 });
  console.error(`[wallets] Removed wallet ${id}`);
  return true;
}

// ============================================================================
// Crypto Transaction Log
// ============================================================================

export async function getCryptoTransactions(limit = 50): Promise<CryptoTransaction[]> {
  ensureConfigDir();
  
  if (!existsSync(CRYPTO_TX_FILE)) {
    return [];
  }

  try {
    const data = readFileSync(CRYPTO_TX_FILE, "utf-8");
    const transactions: CryptoTransaction[] = JSON.parse(data);
    return transactions.slice(-limit);
  } catch {
    return [];
  }
}

export async function logCryptoTransaction(tx: CryptoTransaction): Promise<void> {
  ensureConfigDir();
  
  let transactions: CryptoTransaction[] = [];
  if (existsSync(CRYPTO_TX_FILE)) {
    try {
      transactions = JSON.parse(readFileSync(CRYPTO_TX_FILE, "utf-8"));
    } catch {
      transactions = [];
    }
  }
  
  transactions.push(tx);
  
  // Keep last 1000 transactions
  if (transactions.length > 1000) {
    transactions = transactions.slice(-1000);
  }
  
  writeFileSync(CRYPTO_TX_FILE, JSON.stringify(transactions, null, 2), { mode: 0o600 });
}

export async function updateCryptoTransaction(id: string, updates: Partial<CryptoTransaction>): Promise<void> {
  if (!existsSync(CRYPTO_TX_FILE)) return;
  
  let transactions: CryptoTransaction[] = [];
  try {
    transactions = JSON.parse(readFileSync(CRYPTO_TX_FILE, "utf-8"));
  } catch {
    return;
  }
  
  const idx = transactions.findIndex((t) => t.id === id);
  if (idx >= 0) {
    transactions[idx] = { ...transactions[idx]!, ...updates };
    writeFileSync(CRYPTO_TX_FILE, JSON.stringify(transactions, null, 2), { mode: 0o600 });
  }
}
