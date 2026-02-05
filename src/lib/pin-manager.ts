/**
 * PIN Manager - Master PIN for card access
 * 
 * Security model:
 * - CVV is encrypted with a key derived from the master PIN
 * - PIN is stored in memory only (never persisted)
 * - PIN auto-expires after inactivity timeout
 * - Without PIN, cards cannot be used for payments
 * 
 * Flow:
 * 1. User sets PIN once (stored as hash for verification)
 * 2. User unlocks with PIN → PIN held in memory
 * 3. Payments work while unlocked
 * 4. After timeout or explicit lock → PIN cleared from memory
 */

import { createHash, scryptSync, randomBytes } from "crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const CONFIG_DIR = join(homedir(), ".mcp-ecosystem");
const PIN_CONFIG_FILE = join(CONFIG_DIR, "pin-config.json");

// In-memory PIN storage (never persisted)
let currentPin: string | null = null;
let lastActivity: number = 0;
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

interface PinConfig {
  // Hash of PIN for verification (not the PIN itself)
  pinHash: string;
  // Salt for PIN hashing
  salt: string;
  // Salt for CVV encryption key derivation
  cvvKeySalt: string;
  // When PIN was set
  createdAt: string;
}

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

/**
 * Hash PIN for storage (verification only)
 */
function hashPin(pin: string, salt: string): string {
  return createHash("sha256")
    .update(pin + salt)
    .digest("hex");
}

/**
 * Derive encryption key from PIN (for CVV encryption)
 */
export function deriveKeyFromPin(pin: string, salt: string): Buffer {
  return scryptSync(pin, salt, 32);
}

/**
 * Check if PIN is configured
 */
export function isPinConfigured(): boolean {
  return existsSync(PIN_CONFIG_FILE);
}

/**
 * Get PIN config (without sensitive data)
 */
function getPinConfig(): PinConfig | null {
  if (!existsSync(PIN_CONFIG_FILE)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(PIN_CONFIG_FILE, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * Set up master PIN (first time)
 */
export function setupPin(pin: string): { success: boolean; error?: string } {
  if (pin.length < 4 || pin.length > 8) {
    return { success: false, error: "PIN must be 4-8 characters" };
  }
  
  if (isPinConfigured()) {
    return { success: false, error: "PIN already configured. Use change_pin to modify." };
  }
  
  ensureConfigDir();
  
  const salt = randomBytes(16).toString("hex");
  const cvvKeySalt = randomBytes(16).toString("hex");
  const pinHash = hashPin(pin, salt);
  
  const config: PinConfig = {
    pinHash,
    salt,
    cvvKeySalt,
    createdAt: new Date().toISOString(),
  };
  
  writeFileSync(PIN_CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
  
  // Auto-unlock after setup
  currentPin = pin;
  lastActivity = Date.now();
  
  console.error("[pin-manager] Master PIN configured and unlocked");
  return { success: true };
}

/**
 * Change master PIN (requires current PIN)
 */
export function changePin(currentPinInput: string, newPin: string): { success: boolean; error?: string } {
  const config = getPinConfig();
  if (!config) {
    return { success: false, error: "No PIN configured" };
  }
  
  // Verify current PIN
  if (hashPin(currentPinInput, config.salt) !== config.pinHash) {
    return { success: false, error: "Current PIN is incorrect" };
  }
  
  if (newPin.length < 4 || newPin.length > 8) {
    return { success: false, error: "New PIN must be 4-8 characters" };
  }
  
  // Generate new salts
  const salt = randomBytes(16).toString("hex");
  const cvvKeySalt = randomBytes(16).toString("hex");
  const pinHash = hashPin(newPin, salt);
  
  const newConfig: PinConfig = {
    pinHash,
    salt,
    cvvKeySalt,
    createdAt: new Date().toISOString(),
  };
  
  writeFileSync(PIN_CONFIG_FILE, JSON.stringify(newConfig, null, 2), { mode: 0o600 });
  
  // Update in-memory PIN
  currentPin = newPin;
  lastActivity = Date.now();
  
  console.error("[pin-manager] Master PIN changed");
  return { success: true };
}

/**
 * Unlock cards with PIN
 */
export function unlock(pin: string): { success: boolean; error?: string; expiresIn?: number } {
  const config = getPinConfig();
  if (!config) {
    return { success: false, error: "No PIN configured. Use setup_pin first." };
  }
  
  if (hashPin(pin, config.salt) !== config.pinHash) {
    return { success: false, error: "Invalid PIN" };
  }
  
  currentPin = pin;
  lastActivity = Date.now();
  
  console.error("[pin-manager] Cards unlocked");
  return { 
    success: true, 
    expiresIn: SESSION_TIMEOUT_MS / 1000 / 60 // in minutes
  };
}

/**
 * Lock cards (clear PIN from memory)
 */
export function lock(): void {
  currentPin = null;
  lastActivity = 0;
  console.error("[pin-manager] Cards locked");
}

/**
 * Check if cards are currently unlocked
 */
export function isUnlocked(): boolean {
  if (!currentPin) {
    return false;
  }
  
  // Check timeout
  if (Date.now() - lastActivity > SESSION_TIMEOUT_MS) {
    lock();
    return false;
  }
  
  return true;
}

/**
 * Refresh activity (extend session)
 */
export function refreshActivity(): void {
  if (currentPin) {
    lastActivity = Date.now();
  }
}

/**
 * Get CVV encryption key (only works when unlocked)
 */
export function getCvvEncryptionKey(): Buffer | null {
  if (!isUnlocked()) {
    return null;
  }
  
  const config = getPinConfig();
  if (!config || !currentPin) {
    return null;
  }
  
  refreshActivity();
  return deriveKeyFromPin(currentPin, config.cvvKeySalt);
}

/**
 * Get status
 */
export function getStatus(): { 
  configured: boolean; 
  unlocked: boolean; 
  remainingMinutes?: number;
} {
  const configured = isPinConfigured();
  const unlocked = isUnlocked();
  
  let remainingMinutes: number | undefined;
  if (unlocked && lastActivity > 0) {
    const elapsed = Date.now() - lastActivity;
    remainingMinutes = Math.ceil((SESSION_TIMEOUT_MS - elapsed) / 1000 / 60);
  }
  
  return { configured, unlocked, remainingMinutes };
}
