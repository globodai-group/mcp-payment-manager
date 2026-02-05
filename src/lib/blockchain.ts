/**
 * Blockchain API Client
 * 
 * Fetches balances and transactions from various blockchains.
 * Uses public RPC endpoints and explorer APIs.
 */

import { CHAIN_CONFIG, type Chain } from "./wallets";

// Default public RPC endpoints (can be overridden via env vars)
const DEFAULT_RPC: Record<Chain, string> = {
  ethereum: "https://eth.llamarpc.com",
  polygon: "https://polygon-rpc.com",
  arbitrum: "https://arb1.arbitrum.io/rpc",
  optimism: "https://mainnet.optimism.io",
  base: "https://mainnet.base.org",
  avalanche: "https://api.avax.network/ext/bc/C/rpc",
  bsc: "https://bsc-dataseed.binance.org",
  bitcoin: "", // Needs special handling
  solana: "https://api.mainnet-beta.solana.com",
  starknet: "https://starknet-mainnet.public.blastapi.io",
};

// Explorer APIs for transactions
const EXPLORER_API: Partial<Record<Chain, string>> = {
  ethereum: "https://api.etherscan.io/api",
  polygon: "https://api.polygonscan.com/api",
  arbitrum: "https://api.arbiscan.io/api",
  optimism: "https://api-optimistic.etherscan.io/api",
  base: "https://api.basescan.org/api",
  bsc: "https://api.bscscan.com/api",
};

export interface WalletBalance {
  address: string;
  chain: Chain;
  nativeBalance: string;
  nativeBalanceFormatted: string;
  nativeCurrency: string;
  usdValue?: number;
  tokens?: TokenBalance[];
}

export interface TokenBalance {
  symbol: string;
  name: string;
  balance: string;
  balanceFormatted: string;
  contractAddress: string;
  decimals: number;
  usdValue?: number;
}

export interface WalletTransaction {
  hash: string;
  from: string;
  to: string;
  value: string;
  valueFormatted: string;
  timestamp: number;
  blockNumber: number;
  isIncoming: boolean;
  status: "success" | "failed" | "pending";
  fee?: string;
  tokenSymbol?: string;
}

/**
 * Get RPC URL for a chain
 */
function getRpcUrl(chain: Chain): string {
  const envVar = CHAIN_CONFIG[chain]?.rpcEnvVar;
  if (envVar && process.env[envVar]) {
    return process.env[envVar]!;
  }
  return DEFAULT_RPC[chain] || "";
}

/**
 * Get explorer API key (optional, for higher rate limits)
 */
function getExplorerApiKey(chain: Chain): string | undefined {
  const keyMap: Partial<Record<Chain, string>> = {
    ethereum: "ETHERSCAN_API_KEY",
    polygon: "POLYGONSCAN_API_KEY",
    arbitrum: "ARBISCAN_API_KEY",
    bsc: "BSCSCAN_API_KEY",
  };
  const envVar = keyMap[chain];
  return envVar ? process.env[envVar] : undefined;
}

/**
 * Make JSON-RPC call
 */
async function rpcCall(chain: Chain, method: string, params: unknown[]): Promise<unknown> {
  const url = getRpcUrl(chain);
  if (!url) {
    throw new Error(`No RPC URL configured for ${chain}`);
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    }),
  });

  const data = await response.json();
  if (data.error) {
    throw new Error(data.error.message || "RPC error");
  }
  return data.result;
}

/**
 * Format wei to ETH (or equivalent)
 */
function formatWei(wei: string, decimals = 18): string {
  const weiNum = BigInt(wei);
  const divisor = BigInt(10 ** decimals);
  const whole = weiNum / divisor;
  const fraction = weiNum % divisor;
  const fractionStr = fraction.toString().padStart(decimals, "0").slice(0, 6);
  return `${whole}.${fractionStr}`.replace(/\.?0+$/, "") || "0";
}

/**
 * Get native balance for EVM chains
 */
async function getEvmBalance(address: string, chain: Chain): Promise<WalletBalance> {
  const result = await rpcCall(chain, "eth_getBalance", [address, "latest"]) as string;
  const config = CHAIN_CONFIG[chain];
  
  return {
    address,
    chain,
    nativeBalance: result,
    nativeBalanceFormatted: formatWei(result),
    nativeCurrency: config?.nativeCurrency || "ETH",
  };
}

/**
 * Get Solana balance
 */
async function getSolanaBalance(address: string): Promise<WalletBalance> {
  const url = getRpcUrl("solana");
  
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getBalance",
      params: [address],
    }),
  });

  const data = await response.json();
  const lamports = data.result?.value || 0;
  
  return {
    address,
    chain: "solana",
    nativeBalance: lamports.toString(),
    nativeBalanceFormatted: (lamports / 1e9).toFixed(4),
    nativeCurrency: "SOL",
  };
}

/**
 * Get Bitcoin balance via public API
 */
async function getBitcoinBalance(address: string): Promise<WalletBalance> {
  // Using blockchain.info API
  const response = await fetch(`https://blockchain.info/balance?active=${address}`);
  const data = await response.json();
  
  const satoshis = data[address]?.final_balance || 0;
  
  return {
    address,
    chain: "bitcoin",
    nativeBalance: satoshis.toString(),
    nativeBalanceFormatted: (satoshis / 1e8).toFixed(8),
    nativeCurrency: "BTC",
  };
}

/**
 * Get wallet balance
 */
export async function getWalletBalance(address: string, chain: Chain): Promise<WalletBalance> {
  switch (chain) {
    case "bitcoin":
      return getBitcoinBalance(address);
    case "solana":
      return getSolanaBalance(address);
    default:
      // All EVM chains
      return getEvmBalance(address, chain);
  }
}

/**
 * Get EVM transactions via explorer API
 */
async function getEvmTransactions(
  address: string,
  chain: Chain,
  limit = 20
): Promise<WalletTransaction[]> {
  const apiUrl = EXPLORER_API[chain];
  if (!apiUrl) {
    return []; // No explorer API for this chain
  }

  const apiKey = getExplorerApiKey(chain);
  const url = new URL(apiUrl);
  url.searchParams.set("module", "account");
  url.searchParams.set("action", "txlist");
  url.searchParams.set("address", address);
  url.searchParams.set("sort", "desc");
  url.searchParams.set("page", "1");
  url.searchParams.set("offset", limit.toString());
  if (apiKey) {
    url.searchParams.set("apikey", apiKey);
  }

  const response = await fetch(url.toString());
  const data = await response.json();

  if (data.status !== "1" || !Array.isArray(data.result)) {
    return [];
  }

  const config = CHAIN_CONFIG[chain];
  
  return data.result.map((tx: any) => ({
    hash: tx.hash,
    from: tx.from,
    to: tx.to,
    value: tx.value,
    valueFormatted: `${formatWei(tx.value)} ${config?.nativeCurrency || "ETH"}`,
    timestamp: parseInt(tx.timeStamp) * 1000,
    blockNumber: parseInt(tx.blockNumber),
    isIncoming: tx.to.toLowerCase() === address.toLowerCase(),
    status: tx.isError === "0" ? "success" : "failed",
    fee: formatWei((BigInt(tx.gasUsed) * BigInt(tx.gasPrice)).toString()),
  }));
}

/**
 * Get Solana transactions
 */
async function getSolanaTransactions(
  address: string,
  limit = 20
): Promise<WalletTransaction[]> {
  const url = getRpcUrl("solana");
  
  // Get signatures
  const sigResponse = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getSignaturesForAddress",
      params: [address, { limit }],
    }),
  });

  const sigData = await sigResponse.json();
  const signatures = sigData.result || [];

  return signatures.map((sig: any) => ({
    hash: sig.signature,
    from: address,
    to: "",
    value: "0",
    valueFormatted: "N/A",
    timestamp: sig.blockTime ? sig.blockTime * 1000 : Date.now(),
    blockNumber: sig.slot,
    isIncoming: false,
    status: sig.err ? "failed" : "success",
  }));
}

/**
 * Get Bitcoin transactions
 */
async function getBitcoinTransactions(
  address: string,
  limit = 20
): Promise<WalletTransaction[]> {
  const response = await fetch(
    `https://blockchain.info/rawaddr/${address}?limit=${limit}`
  );
  const data = await response.json();

  if (!data.txs) return [];

  return data.txs.map((tx: any) => {
    const isIncoming = tx.out.some(
      (o: any) => o.addr === address
    );
    const value = tx.out
      .filter((o: any) => (isIncoming ? o.addr === address : o.addr !== address))
      .reduce((sum: number, o: any) => sum + o.value, 0);

    return {
      hash: tx.hash,
      from: tx.inputs[0]?.prev_out?.addr || "coinbase",
      to: tx.out[0]?.addr || "",
      value: value.toString(),
      valueFormatted: `${(value / 1e8).toFixed(8)} BTC`,
      timestamp: tx.time * 1000,
      blockNumber: tx.block_height || 0,
      isIncoming,
      status: "success",
    };
  });
}

/**
 * Get wallet transactions
 */
export async function getWalletTransactions(
  address: string,
  chain: Chain,
  limit = 20
): Promise<WalletTransaction[]> {
  switch (chain) {
    case "bitcoin":
      return getBitcoinTransactions(address, limit);
    case "solana":
      return getSolanaTransactions(address, limit);
    default:
      return getEvmTransactions(address, chain, limit);
  }
}

/**
 * Get USD price for a currency (simple coingecko fetch)
 */
export async function getUsdPrice(currency: string): Promise<number | null> {
  const coinIds: Record<string, string> = {
    ETH: "ethereum",
    BTC: "bitcoin",
    SOL: "solana",
    MATIC: "matic-network",
    AVAX: "avalanche-2",
    BNB: "binancecoin",
  };

  const coinId = coinIds[currency.toUpperCase()];
  if (!coinId) return null;

  try {
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`
    );
    const data = await response.json();
    return data[coinId]?.usd || null;
  } catch {
    return null;
  }
}
