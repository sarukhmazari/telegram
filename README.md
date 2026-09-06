# 🛍 Telegram Digital Products Store Bot

A production-ready, modular, and secure **Telegram Digital Products Marketplace Bot** built with Node.js, TypeScript, Telegraf v4, PostgreSQL, and Prisma ORM.

---

## 🌟 Key Features

* **Modular Architecture**: Layered separation of services, handlers, keyboards, and middleware.
* **Database & Concurrency Integrity**: PostgreSQL schema with atomic Prisma transactions (`$transaction`) and AES-256-GCM stock encryption at rest.
* **Modular Payment Abstraction Layer**:
  * `WALLET`: Internal wallet balance with transaction audit ledger.
  * `MANUAL`: Bank Transfer / JazzCash / EasyPaisa with proof submission & admin verification dialogs.
  * `TELEGRAM_PAYMENTS`: Native Telegram Payment invoices.
* **Automatic & Manual Fulfillment**:
  * Instant auto-delivery for credentials, license keys, and files with duplicate-prevention locks.
  * Guided admin manual delivery workflow for custom digital services.
* **Complete In-Bot Admin Panel**:
  * Real-time metrics dashboard.
  * Multiline bulk stock importer.
  * Product & category management.
  * Order and payment review dialogs.
  * User balance management & ban toggles.
  * Rate-limited broadcast sender.
* **Growth & Engagement**:
  * Coupon discount engine (percentage or fixed).
  * 1–5 star reviews & ratings.
  * Customer referral link system.
  * In-bot customer support ticket relay.

---

## 🚀 Quick Start (Local Development)

### 1. Prerequisites
* Node.js v18+
* PostgreSQL database instance

### 2. Installation
```bash
git clone <your-repository-url>
cd telegram
npm install
```

### 3. Environment Setup
Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

`.env` configuration example:
```ini
BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyZ
ADMIN_IDS=123456789
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/telegram_store?schema=public"
ENCRYPTION_KEY=d7f8a9e2b1c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9
STORE_NAME="Digital Store"
STORE_CURRENCY="USD"
SUPPORT_USERNAME="StoreSupport"
BOT_MODE=polling
```

### 4. Database Setup & Migration
```bash
npm run prisma:generate
npm run prisma:migrate
```

### 5. Running in Development
```bash
npm run dev
```

---

## 🧪 Running Unit Tests

```bash
npm test
```

---

## 🐳 Docker Deployment

To launch the bot alongside a PostgreSQL database container:

```bash
docker-compose up -d --build
```

---

## ⚙️ PM2 Production Deployment

```bash
npm run build
npm install -g pm2
pm2 start dist/bot/index.js --name "telegram-store-bot"
pm2 save
```

---

## 🛠 Admin Panel Commands

Open Telegram, start your bot with `/start` (using an account ID listed in `ADMIN_IDS`), and click `⚙️ Admin Panel`.

From there, you can:
1. Add product categories and products.
2. Define pricing plans/variants.
3. Import bulk stock credentials (`email:password` or keys).
4. Review pending manual payments with one-click approve/reject.
