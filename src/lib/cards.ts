/**
 * Payment Card Management
 * 
 * Secure storage for payment cards with encryption at rest.
 * Uses the same crypto system as mail-manager for consistency.
 * 
 * Security model:
 * - Card numbers stored encrypted (only last 4 digits visible in plaintext)
 * - CVV encrypted with PIN-derived key (requires unlock to use)
 * - Expiration dates encrypted
 * - All sensitive operations require explicit confirmation
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { encrypt, decrypt, isEncrypted } from "./crypto";
import { encryptCvv, decryptCvv, isCvvEncrypted } from "./cvv-crypto";
import { isUnlocked } from "./pin-manager";

// Fields that must be encrypted with system key
const SENSITIVE_FIELDS = ["cardNumber", "expirationDate"];
// CVV is encrypted with PIN-derived key (separate)

export type CardType = "visa" | "mastercard" | "amex" | "discover" | "other";
export type CardUsage = "flight" | "train" | "hotel" | "general" | "all";

export interface PaymentCard {
  id: string;
  nickname: string; // e.g., "Visa perso", "Amex pro"
  cardType: CardType;
  lastFourDigits: string; // Always stored in plaintext for identification
  cardNumber: string; // Encrypted - full card number
  expirationDate: string; // Encrypted - MM/YY format
  cvv?: string; // Encrypted with PIN-derived key
  cardholderName: string;
  billingAddress?: {
    street: string;
    city: string;
    postalCode: string;
    country: string;
  };
  // Usage restrictions
  allowedUsage: CardUsage[];
  enabled: boolean;
  // Spending limits (optional)
  limits?: {
    perTransaction?: number;
    daily?: number;
    monthly?: number;
    currency: string;
  };
  // Metadata
  addedAt: string;
  lastUsedAt?: string;
}

// Transaction for audit log
export interface Transaction {
  id: string;
  cardId: string;
  type: "flight" | "train" | "hotel" | "general";
  amount: number;
  currency: string;
  description: string;
  provider: string;
  status: "pending" | "confirmed" | "completed" | "failed" | "refunded";
  createdAt: string;
  confirmedAt?: string;
  completedAt?: string;
  reference?: string; // Booking reference
  details?: Record<string, unknown>;
}

const CONFIG_DIR = join(homedir(), ".mcp-ecosystem");
const CARDS_FILE = join(CONFIG_DIR, "payment-cards.json");
const TRANSACTIONS_FILE = join(CONFIG_DIR, "payment-transactions.json");

/**
 * Detect card type from number
 */
export function detectCardType(cardNumber: string): CardType {
  const cleaned = cardNumber.replace(/\D/g, "");
  
  if (/^4/.test(cleaned)) return "visa";
  if (/^5[1-5]/.test(cleaned) || /^2[2-7]/.test(cleaned)) return "mastercard";
  if (/^3[47]/.test(cleaned)) return "amex";
  if (/^6(?:011|5)/.test(cleaned)) return "discover";
  
  return "other";
}

/**
 * Validate card number using Luhn algorithm
 */
export function validateCardNumber(cardNumber: string): boolean {
  const cleaned = cardNumber.replace(/\D/g, "");
  
  if (cleaned.length < 13 || cleaned.length > 19) return false;
  
  let sum = 0;
  let isEven = false;
  
  for (let i = cleaned.length - 1; i >= 0; i--) {
    let digit = parseInt(cleaned[i]!, 10);
    
    if (isEven) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    
    sum += digit;
    isEven = !isEven;
  }
  
  return sum % 10 === 0;
}

/**
 * Validate expiration date
 */
export function validateExpiration(expiration: string): boolean {
  const match = expiration.match(/^(\d{2})\/(\d{2})$/);
  if (!match) return false;
  
  const month = parseInt(match[1]!, 10);
  const year = parseInt(match[2]!, 10) + 2000;
  
  if (month < 1 || month > 12) return false;
  
  const now = new Date();
  const expDate = new Date(year, month, 0); // Last day of expiration month
  
  return expDate > now;
}

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

/**
 * Decrypt sensitive fields in a card
 */
async function decryptCard(card: PaymentCard): Promise<PaymentCard> {
  const decrypted = { ...card };
  
  for (const field of SENSITIVE_FIELDS) {
    const value = (decrypted as any)[field];
    if (value && typeof value === "string" && isEncrypted(value)) {
      try {
        (decrypted as any)[field] = await decrypt(value);
      } catch (err) {
        console.error(`[cards] Failed to decrypt ${field} for card ${card.nickname}`);
      }
    }
  }
  
  return decrypted;
}

/**
 * Encrypt sensitive fields in a card
 */
async function encryptCard(card: PaymentCard): Promise<PaymentCard> {
  const encrypted = { ...card };
  
  for (const field of SENSITIVE_FIELDS) {
    const value = (encrypted as any)[field];
    if (value && typeof value === "string" && !isEncrypted(value)) {
      (encrypted as any)[field] = await encrypt(value);
    }
  }
  
  return encrypted;
}

// ============================================================================
// Card CRUD
// ============================================================================

export async function getCards(): Promise<PaymentCard[]> {
  ensureConfigDir();
  
  if (!existsSync(CARDS_FILE)) {
    return [];
  }

  try {
    const data = readFileSync(CARDS_FILE, "utf-8");
    const cards: PaymentCard[] = JSON.parse(data);
    return Promise.all(cards.map(decryptCard));
  } catch {
    return [];
  }
}

export async function getCard(id: string): Promise<PaymentCard | null> {
  const cards = await getCards();
  return cards.find((c) => c.id === id) ?? null;
}

/**
 * Get cards without sensitive data (for listing)
 */
export async function getCardsSafe(): Promise<Omit<PaymentCard, "cardNumber" | "expirationDate" | "cvv">[]> {
  const cards = await getCards();
  return cards.map(({ cardNumber, expirationDate, cvv, ...safe }) => safe);
}

/**
 * Get decrypted CVV for a card (requires PIN unlock)
 */
export async function getCardCvv(cardId: string): Promise<string | null> {
  if (!isUnlocked()) {
    return null; // Must be unlocked
  }
  
  // Read raw card to get encrypted CVV
  if (!existsSync(CARDS_FILE)) {
    return null;
  }
  
  try {
    const rawCards: PaymentCard[] = JSON.parse(readFileSync(CARDS_FILE, "utf-8"));
    const card = rawCards.find((c) => c.id === cardId);
    
    if (!card?.cvv) {
      return null;
    }
    
    return decryptCvv(card.cvv);
  } catch {
    return null;
  }
}

export async function addCard(card: PaymentCard): Promise<void> {
  ensureConfigDir();
  
  // Validate card
  if (!validateCardNumber(card.cardNumber)) {
    throw new Error("Invalid card number");
  }
  if (!validateExpiration(card.expirationDate)) {
    throw new Error("Card is expired or invalid expiration date");
  }
  
  // Set derived fields
  card.cardType = detectCardType(card.cardNumber);
  card.lastFourDigits = card.cardNumber.replace(/\D/g, "").slice(-4);
  card.addedAt = new Date().toISOString();
  
  // Load existing (raw/encrypted)
  let rawCards: PaymentCard[] = [];
  if (existsSync(CARDS_FILE)) {
    try {
      rawCards = JSON.parse(readFileSync(CARDS_FILE, "utf-8"));
    } catch {
      rawCards = [];
    }
  }
  
  // Encrypt and save
  const encryptedCard = await encryptCard(card);
  
  const existingIndex = rawCards.findIndex((c) => c.id === card.id);
  if (existingIndex >= 0) {
    rawCards[existingIndex] = encryptedCard;
  } else {
    rawCards.push(encryptedCard);
  }
  
  writeFileSync(CARDS_FILE, JSON.stringify(rawCards, null, 2), { mode: 0o600 });
  console.error(`[cards] Saved card ${card.nickname} (****${card.lastFourDigits}) - encrypted`);
}

export async function removeCard(id: string): Promise<boolean> {
  if (!existsSync(CARDS_FILE)) {
    return false;
  }
  
  let rawCards: PaymentCard[] = [];
  try {
    rawCards = JSON.parse(readFileSync(CARDS_FILE, "utf-8"));
  } catch {
    return false;
  }
  
  const filtered = rawCards.filter((c) => c.id !== id);
  
  if (filtered.length === rawCards.length) {
    return false;
  }
  
  writeFileSync(CARDS_FILE, JSON.stringify(filtered, null, 2), { mode: 0o600 });
  console.error(`[cards] Removed card ${id}`);
  return true;
}

export async function updateCardUsage(id: string): Promise<void> {
  const cards = await getCards();
  const card = cards.find((c) => c.id === id);
  
  if (card) {
    card.lastUsedAt = new Date().toISOString();
    
    // Re-encrypt and save all
    const encrypted = await Promise.all(cards.map(encryptCard));
    writeFileSync(CARDS_FILE, JSON.stringify(encrypted, null, 2), { mode: 0o600 });
  }
}

// ============================================================================
// Transaction Log
// ============================================================================

export async function getTransactions(limit = 50): Promise<Transaction[]> {
  ensureConfigDir();
  
  if (!existsSync(TRANSACTIONS_FILE)) {
    return [];
  }

  try {
    const data = readFileSync(TRANSACTIONS_FILE, "utf-8");
    const transactions: Transaction[] = JSON.parse(data);
    return transactions.slice(-limit);
  } catch {
    return [];
  }
}

export async function logTransaction(tx: Transaction): Promise<void> {
  ensureConfigDir();
  
  let transactions: Transaction[] = [];
  if (existsSync(TRANSACTIONS_FILE)) {
    try {
      transactions = JSON.parse(readFileSync(TRANSACTIONS_FILE, "utf-8"));
    } catch {
      transactions = [];
    }
  }
  
  transactions.push(tx);
  
  // Keep last 1000 transactions
  if (transactions.length > 1000) {
    transactions = transactions.slice(-1000);
  }
  
  writeFileSync(TRANSACTIONS_FILE, JSON.stringify(transactions, null, 2), { mode: 0o600 });
}

export async function updateTransaction(id: string, updates: Partial<Transaction>): Promise<void> {
  if (!existsSync(TRANSACTIONS_FILE)) return;
  
  let transactions: Transaction[] = [];
  try {
    transactions = JSON.parse(readFileSync(TRANSACTIONS_FILE, "utf-8"));
  } catch {
    return;
  }
  
  const idx = transactions.findIndex((t) => t.id === id);
  if (idx >= 0) {
    transactions[idx] = { ...transactions[idx]!, ...updates };
    writeFileSync(TRANSACTIONS_FILE, JSON.stringify(transactions, null, 2), { mode: 0o600 });
  }
}
