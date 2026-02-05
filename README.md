# 💳 Payment Manager MCP Server

[![npm version](https://img.shields.io/npm/v/@artik0din/mcp-payment-manager.svg)](https://www.npmjs.com/package/@artik0din/mcp-payment-manager)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![MCP](https://img.shields.io/badge/MCP-compatible-blue.svg)](https://modelcontextprotocol.io)

> A comprehensive, enterprise-grade personal finance management system with encrypted card storage and multi-chain crypto wallet support

## 🌟 Key Features

### 🏦 Bank Card Management
- **🔐 Military-Grade Encryption** - AES-256-GCM + AWS KMS for card data
- **🔑 PIN-Protected Access** - CVV encrypted with master PIN
- **🛡️ Two-Step Payments** - Prepare → Confirm workflow for safety
- **🔒 Card Controls** - Lock/unlock cards instantly
- **📊 Transaction History** - Complete audit trail with timestamps

### 🪙 Cryptocurrency Wallets
- **🌐 Multi-Chain Support** - Ethereum, Polygon, Arbitrum, Base, Solana, Bitcoin
- **🔥 Hot Wallets** - Encrypted private key storage for instant access
- **👀 Watch-Only** - Monitor addresses without spending capability
- **🔧 Hardware Integration** - Support for Ledger, Trezor workflows
- **⚡ Real-Time Data** - Live balances and transaction history via blockchain APIs
- **💰 Portfolio Tracking** - USD values and total balance calculation

### 🛡️ Enterprise Security
- **🔐 End-to-End Encryption** - All sensitive data encrypted at rest
- **🌩️ AWS KMS Integration** - Enterprise key management
- **📋 Complete Audit Logs** - Every action logged with timestamps
- **🎯 Zero-Knowledge Architecture** - Your keys, your control
- **🔄 Backup & Recovery** - Encrypted backup capabilities

## 📋 Prerequisites

- Node.js >= 20
- AWS account (for KMS encryption) OR local master key
- Blockchain API keys (Etherscan, Polygonscan, etc.)
- Basic understanding of cryptocurrency concepts

## 🚀 Quick Start

### Using npx (recommended)
```bash
npx @artik0din/mcp-payment-manager
```

### Install globally
```bash
npm install -g @artik0din/mcp-payment-manager
```

## ⚙️ Configuration

### Security Setup (Critical)

#### Option 1: AWS KMS (Recommended for Production)
1. Create AWS KMS key in your AWS account
2. Set environment variables:
```bash
export AWS_KMS_KEY_ID="arn:aws:kms:region:account:key/your-key-id"
export AWS_ACCESS_KEY_ID="your-aws-access-key"
export AWS_SECRET_ACCESS_KEY="your-aws-secret"
export AWS_REGION="us-east-1"
```

#### Option 2: Local Master Key (Development)
```bash
export MCP_MASTER_KEY="your-256-bit-master-key-here"
```

### Blockchain API Configuration

#### Required APIs for Full Functionality
| Provider | Purpose | Environment Variable |
|----------|---------|----------------------|
| [Etherscan](https://etherscan.io/apis) | Ethereum data | `ETHERSCAN_API_KEY` |
| [Polygonscan](https://polygonscan.com/apis) | Polygon data | `POLYGONSCAN_API_KEY` |
| [Arbiscan](https://arbiscan.io/apis) | Arbitrum data | `ARBISCAN_API_KEY` |
| [Basescan](https://basescan.org/apis) | Base data | `BASESCAN_API_KEY` |
| [BSCScan](https://bscscan.com/apis) | BSC data | `BSCSCAN_API_KEY` |

#### Solana Configuration
```bash
export SOLANA_RPC_URL="https://api.mainnet-beta.solana.com"
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MCP_MASTER_KEY` | Yes | 256-bit master encryption key |
| `AWS_KMS_KEY_ID` | Optional | AWS KMS key ARN (alternative to master key) |
| `AWS_ACCESS_KEY_ID` | If using KMS | AWS access key |
| `AWS_SECRET_ACCESS_KEY` | If using KMS | AWS secret key |
| `AWS_REGION` | If using KMS | AWS region |
| `ETHERSCAN_API_KEY` | For ETH | Ethereum blockchain data |
| `POLYGONSCAN_API_KEY` | For MATIC | Polygon blockchain data |
| `ARBISCAN_API_KEY` | For ARB | Arbitrum blockchain data |
| `BASESCAN_API_KEY` | For BASE | Base blockchain data |
| `BSCSCAN_API_KEY` | For BNB | BSC blockchain data |
| `SOLANA_RPC_URL` | For SOL | Solana RPC endpoint |
| `STRIPE_API_KEY` | Optional | Stripe integration |

### MCP Client Setup

#### Claude Desktop / Cursor
```json
{
  "mcpServers": {
    "payment-manager": {
      "command": "npx",
      "args": ["-y", "@artik0din/mcp-payment-manager"],
      "env": {
        "MCP_MASTER_KEY": "your-256-bit-encryption-key",
        "ETHERSCAN_API_KEY": "your-etherscan-api-key",
        "POLYGONSCAN_API_KEY": "your-polygonscan-api-key"
      }
    }
  }
}
```

## 🔧 Available Tools

### 🏦 Card Management Tools

#### add_card
Add a new payment card with full encryption.

**Parameters:**
- `nickname` (string, required): Friendly card name
- `card_number` (string, required): Full card number (encrypted)
- `expiration` (string, required): MM/YY format
- `cvv` (string, required): CVV/CVC (PIN-encrypted)
- `cardholder_name` (string, required): Name on card
- `brand` (string, optional): Card brand detection
- `usage` (string, optional): Card usage type (`personal`, `business`, `emergency`)

#### list_cards
List all stored cards with masked details.

**Parameters:**
- `include_locked` (boolean, optional): Include locked cards
- `usage_filter` (string, optional): Filter by usage type

#### remove_card
Permanently remove a card from storage.

**Parameters:**
- `card_id` (string, required): Card ID to remove
- `confirm` (boolean, required): Must be true to confirm

#### card_status
Check status and details of a specific card.

**Parameters:**
- `card_id` (string, required): Card ID to check

#### lock_cards / unlock_cards
Lock or unlock cards for security.

**Parameters:**
- `card_ids` (array of strings, optional): Specific cards (all if omitted)
- `reason` (string, optional): Lock reason

### 🪙 Wallet Management Tools

#### add_wallet
Add a cryptocurrency wallet (hot, watch-only, or hardware).

**Parameters:**
- `nickname` (string, required): Friendly wallet name
- `address` (string, required): Public wallet address
- `chain` (string, required): Blockchain (`ethereum`, `polygon`, `arbitrum`, `base`, `solana`, `bitcoin`)
- `type` (string, required): Wallet type (`hot`, `watch_only`, `hardware`)
- `private_key` (string, optional): Private key (for hot wallets - encrypted)
- `derivation_path` (string, optional): HD derivation path
- `hardware_device` (string, optional): Hardware device type

#### list_wallets
List all configured wallets.

**Parameters:**
- `chain` (string, optional): Filter by blockchain
- `type` (string, optional): Filter by wallet type

#### remove_wallet
Remove a wallet from storage.

**Parameters:**
- `wallet_id` (string, required): Wallet ID to remove
- `confirm` (boolean, required): Must be true to confirm

#### get_wallet_balance
Get real-time balance for a specific wallet.

**Parameters:**
- `wallet_id` (string, optional): Wallet ID
- `address` (string, optional): Wallet address (alternative)
- `include_usd` (boolean, optional): Include USD value

#### get_total_balance
Get total portfolio value across all wallets.

**Parameters:**
- `chain` (string, optional): Filter by specific chain
- `include_breakdown` (boolean, optional): Include per-wallet breakdown

#### list_wallet_transactions
Get transaction history for a wallet.

**Parameters:**
- `wallet_id` (string, required): Wallet ID
- `limit` (number, optional): Number of transactions (default: 50)
- `include_internal` (boolean, optional): Include internal transactions

### 💸 Transaction Tools

#### get_transactions
Get transaction history across cards and wallets.

**Parameters:**
- `account_type` (string, optional): Filter by `cards` or `wallets`
- `since_date` (string, optional): Start date (ISO format)
- `limit` (number, optional): Maximum transactions
- `include_pending` (boolean, optional): Include pending transactions

#### prepare_payment
Prepare a card payment for confirmation (Step 1 of 2).

**Parameters:**
- `card_id` (string, required): Card ID to charge
- `amount` (number, required): Amount in card currency
- `currency` (string, optional): Currency code (default: USD)
- `merchant` (string, required): Merchant/description
- `category` (string, optional): Expense category

#### confirm_payment
Confirm and execute a prepared payment (Step 2 of 2).

**Parameters:**
- `transaction_id` (string, required): Prepared transaction ID
- `cvv` (string, required): Card CVV for final authorization

#### prepare_crypto_tx
Prepare a cryptocurrency transaction.

**Parameters:**
- `wallet_id` (string, required): Source wallet
- `to_address` (string, required): Recipient address
- `amount` (string, required): Amount to send
- `token` (string, optional): Token contract (for ERC-20)
- `gas_price` (string, optional): Custom gas price

#### sign_crypto_tx
Sign and broadcast a prepared crypto transaction.

**Parameters:**
- `transaction_id` (string, required): Prepared transaction ID
- `confirm` (boolean, required): Must be true to sign

### 🔐 Security Tools

#### setup_pin
Configure or change master PIN for CVV encryption.

**Parameters:**
- `new_pin` (string, required): New PIN (4-8 digits)
- `current_pin` (string, optional): Current PIN (for changes)
- `confirm_pin` (string, required): PIN confirmation

## 🔒 Security Architecture

### Encryption Layers
1. **Card Numbers**: AES-256-GCM with AWS KMS or master key
2. **CVV Codes**: Encrypted with PIN-derived key (PBKDF2)
3. **Private Keys**: AES-256-GCM with additional entropy
4. **Metadata**: Encrypted storage of all sensitive fields

### Key Management
- **AWS KMS**: Enterprise-grade key management
- **Local Keys**: PBKDF2-derived from master password
- **PIN System**: Separate PIN for CVV access
- **Key Rotation**: Automatic key rotation support

### Access Controls
- **PIN Required**: CVV access requires PIN unlock
- **Session Timeout**: Automatic lock after inactivity
- **Audit Logging**: All actions logged with timestamps
- **No Plain Text**: No sensitive data stored in plain text

## 🌐 Supported Blockchains

| Blockchain | Symbol | RPC Support | Explorer API | Features |
|------------|--------|-------------|--------------|----------|
| **Ethereum** | ETH | ✅ | Etherscan | ERC-20, NFTs, DeFi |
| **Polygon** | MATIC | ✅ | Polygonscan | Low fees, fast |
| **Arbitrum** | ARB | ✅ | Arbiscan | Layer 2, cheap |
| **Base** | BASE | ✅ | Basescan | Coinbase L2 |
| **BSC** | BNB | ✅ | BSCScan | Binance Chain |
| **Solana** | SOL | ✅ | RPC Direct | High speed |
| **Bitcoin** | BTC | ⏳ | Coming Soon | Store of value |

## 🚨 Security Best Practices

### Environment Security
- Never commit API keys or encryption keys to version control
- Use AWS KMS for production deployments
- Rotate API keys regularly
- Monitor access logs

### Wallet Security
- Use hardware wallets for large amounts
- Keep hot wallets for spending amounts only
- Regular backup of encrypted data
- Test recovery procedures

### Card Security
- Use unique PINs not used elsewhere
- Enable card locks when not needed
- Monitor transaction logs regularly
- Keep CVV access locked when possible

## 📊 Data Storage

All data is stored locally in encrypted files:
- `~/.mcp-payment-manager/cards/` - Encrypted card data
- `~/.mcp-payment-manager/wallets/` - Encrypted wallet data
- `~/.mcp-payment-manager/transactions/` - Transaction logs
- `~/.mcp-payment-manager/audit/` - Security audit logs

## 🔄 Backup & Recovery

### Export Encrypted Data
```bash
# Backup entire data directory
tar -czf payment-manager-backup.tar.gz ~/.mcp-payment-manager/
```

### Recovery Process
1. Restore data directory
2. Ensure same encryption keys are available
3. Verify data integrity with `list_cards` and `list_wallets`

## ⚠️ Important Disclaimers

- **Not Financial Advice**: This tool is for personal finance management only
- **Security Responsibility**: You are responsible for securing your encryption keys
- **Backup Critical**: Always backup your encrypted data and keys
- **Test First**: Test with small amounts before storing significant value
- **Key Loss**: Lost encryption keys = lost data permanently

## 📄 License

MIT - See LICENSE for details

## 🙏 Credits

- **Author:** Kevin Valfin
- **MCP SDK:** @modelcontextprotocol/sdk
- **Cryptography:** Node.js crypto + AWS KMS
- **Blockchain APIs:** Etherscan, Polygonscan, and others
