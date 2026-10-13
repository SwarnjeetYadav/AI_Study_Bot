import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
function numberEnv(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive number`);
  return value;
}
export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: numberEnv('PORT', 3000),
  telegramToken: () => required('TELEGRAM_BOT_TOKEN'),
  mongoUri: () => required('MONGODB_URI'),
  redisUrl: () => required('REDIS_URL'),
  openAiKey: () => required('OPENAI_API_KEY'),
  aiModel: process.env.AI_MODEL ?? 'gpt-4o-mini',
  adminIds: (process.env.ADMIN_TELEGRAM_IDS ?? '').split(',').map(v => v.trim()).filter(Boolean),
  tempDir: process.env.TEMP_FILE_DIR ?? '.tmp',
  maxUploadBytes: numberEnv('MAX_UPLOAD_BYTES', 20_000_000),
  maxPages: numberEnv('MAX_PAGES', 150),
  maxWords: numberEnv('MAX_EXTRACTED_WORDS', 80_000),
  freeDocsPerMonth: numberEnv('FREE_DOCS_PER_MONTH', 3),
  freeQuestionsPerDocument: numberEnv('FREE_QUESTIONS_PER_DOCUMENT', 15),
  studyPrice: numberEnv('STUDY_PRICE_INR', 149),
  proPrice: numberEnv('PRO_PRICE_INR', 299),
  privacyUrl: process.env.PUBLIC_PRIVACY_URL ?? '',
  termsUrl: process.env.PUBLIC_TERMS_URL ?? '',
  supportUsername: process.env.SUPPORT_USERNAME ?? '',
  paymentProvider: process.env.PAYMENT_PROVIDER ?? 'disabled'
};
