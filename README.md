# AI Telegram Study Bot

A runnable TypeScript MVP based on `AI_Telegram_Study_Bot_Complete_Documentation.docx`: upload PDF/DOCX in Telegram, extract text, generate a source-grounded summary and Easy/Medium/Hard MCQs, create a study PDF, and take an interactive quiz with answer explanations.

## Implemented in this codebase

- Telegram bot with `/start`, consent, `/help`, `/plans`, `/status`, `/history`, `/delete`, `/privacy`, `/terms`, `/new`, `/cancel`, and allowlisted `/admin` commands.
- PDF and DOCX intake, file-size/type checks, extraction, text normalization, page/word caps and temporary-file cleanup.
- BullMQ + Redis background worker with retries and progress updates.
- AI summary and MCQ generation using OpenAI Chat Completions JSON output and Zod validation; questions with no exact source-evidence match are discarded.
- PDF containing summary, key terms, Easy/Medium/Hard questions, answer key and explanations.
- Inline-button quizzes with per-answer feedback, score and completion state.
- MongoDB models for users, documents, processing jobs, question sets, quiz sessions, usage ledger, payments and admin audit events.
- Configurable Free/Study/Pro plan limits, monthly document quota reservation/settlement, and admin-granted test access.
- Health endpoints and Docker Compose for MongoDB, Redis, bot and worker.

## Important release boundary

This is a complete **MVP implementation**, not yet a public-production launch. Live checkout/renewal/refunds are intentionally disabled because the product specification leaves the payment provider undecided. The `/plans` screen explicitly says checkout is not enabled. Do not collect real payments until a provider, verified webhook, refund/cancellation policy and regional requirements have been implemented and tested. OCR is also not included; scanned PDFs receive a clear fallback message. The PDF renderer currently uses built-in Helvetica; add and test a Unicode font file before relying on Hindi/other non-Latin PDF output.

## Requirements

- Node.js 20.11+
- Telegram bot token from [@BotFather](https://t.me/BotFather)
- MongoDB 7+
- Redis 7+
- OpenAI API key with API billing enabled

## Local setup (Windows PowerShell or macOS/Linux)

1. Copy `.env.example` to `.env` and fill in `TELEGRAM_BOT_TOKEN`, `OPENAI_API_KEY`, and `ADMIN_TELEGRAM_IDS`. Keep `.env` private.
2. Start MongoDB and Redis locally, or use `docker compose up -d mongo redis`.
3. Install and build:

   ```bash
   npm install
   npm run build
   ```

4. In terminal 1, start the bot:

   ```bash
   npm run dev
   ```

5. In terminal 2, start the worker:

   ```bash
   npm run worker
   ```

6. Open your bot in Telegram, run `/start`, accept the notice, and upload a text-based PDF or DOCX.

### Full Docker setup

```bash
cp .env.example .env
# Edit .env first, then:
docker compose up --build -d
```

Docker Compose runs the bot and worker as separate services. Long polling is used for the bot; do not also configure a webhook for the same token.

## Admin tools

Set your numeric Telegram ID in `ADMIN_TELEGRAM_IDS` (comma-separated). Then use:

- `/admin jobs` — inspect recent processing jobs.
- `/admin grant <telegram_user_id> study` — grant 30 days of Study access for testing.
- `/admin grant <telegram_user_id> pro` — grant 30 days of Pro access for testing.

All grants are written to the admin audit collection. Never share admin IDs or bot credentials publicly.

## Environment variables

See `.env.example`. Plan quotas, upload size, page cap and extracted-word cap are configurable. `PUBLIC_PRIVACY_URL` and `PUBLIC_TERMS_URL` should point to real published policies before launch.

## Data handling and security notes

- Source files and generated PDFs are written to a private temporary directory and removed in a `finally` block after processing.
- The database stores document metadata, summary, question set and quiz state. `/delete` removes the selected study pack and associated question/quiz/job records.
- The bot does not log source document text or AI keys.
- AI output is treated as untrusted and schema-validated. Question evidence must match the extracted source text.
- Production should add malware scanning, OCR resource limits, stronger distributed quota transactions, backup/restore tests, alerting, rate limiting and an external error tracker.
- A retention worker should be added before launch to remove expired derived packs automatically; `retentionUntil` is recorded but automatic expiry is not yet enabled.

## Architecture

```text
Telegram user
  -> grammY bot process
  -> MongoDB (user/document/job metadata) + Redis/BullMQ
  -> worker: download -> extract -> AI summary/MCQs -> validate -> PDF
  -> Telegram summary + PDF + difficulty buttons
  -> quiz session -> answer feedback + score
```

## MVP acceptance checklist

- [ ] `/start` and consent work.
- [ ] Valid PDF and DOCX files queue; unsupported and oversized files are rejected.
- [ ] Worker processes a text-based PDF and DOCX without blocking Telegram updates.
- [ ] Summary, source-grounded questions and PDF are delivered.
- [ ] Easy/Medium/Hard quiz buttons start a user-owned quiz.
- [ ] Answers cannot be recorded twice; score matches recorded answers.
- [ ] Free quota blocks excess uploads and failed processing releases its reservation.
- [ ] Non-admin `/admin` access is denied.
- [ ] `/delete` removes stored derived results.
- [ ] Staging tests pass before real users or payments are enabled.

## Next production tasks

1. Add automated tests for extraction, quota concurrency, callback ownership and AI validation.
2. Add OCR (for example Tesseract) only with strict page/time caps.
3. Add bundled Unicode font support and verify Hindi PDF output visually.
4. Implement the selected payment provider's hosted checkout and signature-verified, idempotent webhook; test success, duplicate event, expiry, refund and cancellation.
5. Add automated retention cleanup, file malware scanning, request throttles, metrics/alerts and tested database restore.
6. Publish privacy, terms, support and cancellation/refund pages and review current Telegram/provider policies.
