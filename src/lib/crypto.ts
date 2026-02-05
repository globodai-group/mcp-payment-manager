/**
 * Encryption for sensitive data with KMS support
 * 
 * Supports multiple backends:
 * 1. AWS KMS (recommended for production)
 * 2. Local AES-256-GCM (for development)
 * 
 * Configuration via environment:
 * - MCP_CRYPTO_BACKEND: "aws-kms" | "local" (default: "local")
 * - AWS_KMS_KEY_ID: ARN or alias of the KMS key
 * - AWS_REGION: AWS region for KMS
 * - MCP_MASTER_KEY: Local master key (if using local backend)
 * 
 * Security model with KMS:
 * - Even with root access to VPS, attacker needs AWS credentials
 * - AWS credentials should use IAM role with minimal permissions
 * - KMS provides audit logs of all decrypt operations
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { KMSClient, EncryptCommand, DecryptCommand, GenerateDataKeyCommand } from "@aws-sdk/client-kms";

// ============================================================================
// Configuration
// ============================================================================

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

const CONFIG_DIR = join(homedir(), ".mcp-ecosystem");
const KEY_FILE = join(CONFIG_DIR, ".master-key");
const DEK_CACHE_FILE = join(CONFIG_DIR, ".dek-cache");

// Prefixes to identify encryption version/backend
const PREFIX_LOCAL = "enc:local:";
const PREFIX_KMS = "enc:kms:";

type CryptoBackend = "local" | "aws-kms";

function getBackend(): CryptoBackend {
  const backend = process.env.MCP_CRYPTO_BACKEND?.toLowerCase();
  if (backend === "aws-kms" || backend === "kms") return "aws-kms";
  return "local";
}

// ============================================================================
// AWS KMS Backend
// ============================================================================

let kmsClient: KMSClient | null = null;
let cachedDataKey: Buffer | null = null;
let cachedEncryptedDataKey: Buffer | null = null;

function getKMSClient(): KMSClient {
  if (!kmsClient) {
    kmsClient = new KMSClient({
      region: process.env.AWS_REGION || "us-east-1",
    });
  }
  return kmsClient;
}

function getKMSKeyId(): string {
  const keyId = process.env.AWS_KMS_KEY_ID;
  if (!keyId) {
    throw new Error("AWS_KMS_KEY_ID environment variable required for KMS backend");
  }
  return keyId;
}

/**
 * Generate or retrieve Data Encryption Key (DEK) from KMS
 * Uses envelope encryption pattern
 */
async function getDataKey(): Promise<{ plaintext: Buffer; encrypted: Buffer }> {
  // Check memory cache first
  if (cachedDataKey && cachedEncryptedDataKey) {
    return { plaintext: cachedDataKey, encrypted: cachedEncryptedDataKey };
  }

  // Check disk cache (encrypted DEK)
  if (existsSync(DEK_CACHE_FILE)) {
    try {
      const encryptedDek = readFileSync(DEK_CACHE_FILE);
      const client = getKMSClient();
      
      const response = await client.send(new DecryptCommand({
        CiphertextBlob: encryptedDek,
        KeyId: getKMSKeyId(),
      }));

      if (response.Plaintext) {
        cachedDataKey = Buffer.from(response.Plaintext);
        cachedEncryptedDataKey = encryptedDek;
        return { plaintext: cachedDataKey, encrypted: cachedEncryptedDataKey };
      }
    } catch (err) {
      console.error("[crypto] Failed to decrypt cached DEK, generating new one");
    }
  }

  // Generate new DEK
  const client = getKMSClient();
  const response = await client.send(new GenerateDataKeyCommand({
    KeyId: getKMSKeyId(),
    KeySpec: "AES_256",
  }));

  if (!response.Plaintext || !response.CiphertextBlob) {
    throw new Error("KMS GenerateDataKey failed");
  }

  cachedDataKey = Buffer.from(response.Plaintext);
  cachedEncryptedDataKey = Buffer.from(response.CiphertextBlob);

  // Cache encrypted DEK to disk (safe - it's encrypted by KMS)
  ensureConfigDir();
  writeFileSync(DEK_CACHE_FILE, cachedEncryptedDataKey, { mode: 0o600 });

  console.error("[crypto] Generated new Data Encryption Key via KMS");
  return { plaintext: cachedDataKey, encrypted: cachedEncryptedDataKey };
}

async function encryptWithKMS(plaintext: string): Promise<string> {
  const { plaintext: dek } = await getDataKey();
  
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, dek, iv);

  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");
  const authTag = cipher.getAuthTag();

  // Format: enc:kms:<iv>:<authTag>:<ciphertext>
  return `${PREFIX_KMS}${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted}`;
}

async function decryptWithKMS(encrypted: string): Promise<string> {
  const { plaintext: dek } = await getDataKey();
  
  const parts = encrypted.slice(PREFIX_KMS.length).split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid KMS encrypted format");
  }

  const iv = Buffer.from(parts[0]!, "base64");
  const authTag = Buffer.from(parts[1]!, "base64");
  const ciphertext = parts[2]!;

  const decipher = createDecipheriv(ALGORITHM, dek, iv);
  decipher.setAuthTag(authTag);

  let decrypted: string = decipher.update(ciphertext, "base64", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

// ============================================================================
// Local Backend (for development)
// ============================================================================

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function getLocalMasterKey(): Buffer {
  if (process.env.MCP_MASTER_KEY) {
    return scryptSync(process.env.MCP_MASTER_KEY, "mcp-ecosystem-salt-v1", KEY_LENGTH);
  }

  if (existsSync(KEY_FILE)) {
    const keyData = readFileSync(KEY_FILE, "utf-8").trim();
    return scryptSync(keyData, "mcp-ecosystem-salt-v1", KEY_LENGTH);
  }

  console.error("[crypto] Generating new local master key...");
  const newKey = randomBytes(32).toString("base64");
  
  ensureConfigDir();
  writeFileSync(KEY_FILE, newKey, { mode: 0o600 });
  chmodSync(KEY_FILE, 0o600);
  
  console.error(`[crypto] Master key saved to ${KEY_FILE}`);
  return scryptSync(newKey, "mcp-ecosystem-salt-v1", KEY_LENGTH);
}

function encryptLocal(plaintext: string): string {
  const key = getLocalMasterKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");
  const authTag = cipher.getAuthTag();

  return `${PREFIX_LOCAL}${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted}`;
}

function decryptLocal(encrypted: string): string {
  const key = getLocalMasterKey();
  const parts = encrypted.slice(PREFIX_LOCAL.length).split(":");
  
  if (parts.length !== 3) {
    throw new Error("Invalid local encrypted format");
  }

  const iv = Buffer.from(parts[0]!, "base64");
  const authTag = Buffer.from(parts[1]!, "base64");
  const ciphertext = parts[2]!;

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted: string = decipher.update(ciphertext, "base64", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Check if a value is encrypted
 */
export function isEncrypted(value: string): boolean {
  return value?.startsWith(PREFIX_LOCAL) || value?.startsWith(PREFIX_KMS) || false;
}

/**
 * Encrypt sensitive data using configured backend
 */
export async function encrypt(plaintext: string): Promise<string> {
  if (!plaintext || isEncrypted(plaintext)) {
    return plaintext;
  }

  const backend = getBackend();
  
  if (backend === "aws-kms") {
    return encryptWithKMS(plaintext);
  }
  
  return encryptLocal(plaintext);
}

/**
 * Decrypt sensitive data (auto-detects backend from prefix)
 */
export async function decrypt(encrypted: string): Promise<string> {
  if (!encrypted || !isEncrypted(encrypted)) {
    return encrypted;
  }

  if (encrypted.startsWith(PREFIX_KMS)) {
    return decryptWithKMS(encrypted);
  }
  
  if (encrypted.startsWith(PREFIX_LOCAL)) {
    return decryptLocal(encrypted);
  }

  throw new Error("Unknown encryption format");
}

/**
 * Get current crypto backend info
 */
export function getCryptoInfo(): { backend: CryptoBackend; kmsKeyId?: string } {
  const backend = getBackend();
  return {
    backend,
    kmsKeyId: backend === "aws-kms" ? process.env.AWS_KMS_KEY_ID : undefined,
  };
}
