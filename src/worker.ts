import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { Worker } from 'bullmq';
import { env } from './config/env';
import { redisConnection } from './services/queue';
import { getBot, sendLongMessage } from './services/telegram';
import { extractDocument, normalizeText } from './services/extract';
import { createStudyPack } from './services/ai';
import { renderStudyPdf } from './services/pdf';
import { AdminAuditLog, ProcessingJob, QuestionSet, StudyDocument, User } from './models';
import { getPlan } from './config/plans';
import { settleDocumentQuota } from './services/usage';
import { InlineKeyboard } from 'grammy';

async function downloadTelegramFile(fileId: string, dest: string) {
  const bot = getBot(); const file = await bot.api.getFile(fileId); if (!file.file_path) throw new Error('TELEGRAM_FILE_PATH_MISSING');
  const url = `https://api.telegram.org/file/bot${env.telegramToken()}/${file.file_path}`;
  const response = await fetch(url); if (!response.ok) throw new Error(`TELEGRAM_DOWNLOAD_${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer()); if (buffer.length > env.maxUploadBytes) throw new Error('FILE_TOO_LARGE');
  await fs.writeFile(dest, buffer, { flag: 'wx', mode: 0o600 });
}
async function updateProgress(jobId: string, stage: string, progress: number, message: string) {
  const record = await ProcessingJob.findOneAndUpdate({ jobId }, { stage, progress, status: 'processing' }, { new: true });
  if (record?.progressMessageId) { try { await getBot().api.editMessageText(record.chatId, record.progressMessageId, `📄 Study pack processing\nStage: ${stage}\nProgress: ${progress}%\n${message}`); } catch { /* Telegram may reject unchanged message */ } }
}
async function processDocument(jobId: string) {
  const job = await ProcessingJob.findOne({ jobId }); if (!job) throw new Error('JOB_NOT_FOUND');
  const doc = await StudyDocument.findById(job.documentId); const user = await User.findById(job.userId); if (!doc || !user) throw new Error('DOCUMENT_OR_USER_NOT_FOUND');
  const plan = getPlan(user.planId); const tmpDir = path.resolve(env.tempDir); await fs.mkdir(tmpDir, { recursive: true, mode: 0o700 });
  const localPath = path.join(tmpDir, `${crypto.randomUUID()}${path.extname(doc.originalName).toLowerCase()}`); const pdfPath = path.join(tmpDir, `${crypto.randomUUID()}.pdf`);
  let success = false;
  try {
    await updateProgress(jobId, 'downloading', 10, 'Downloading your document securely.'); await downloadTelegramFile(doc.telegramFileId, localPath);
    await updateProgress(jobId, 'extracting', 25, 'Extracting document text.'); const extracted = await extractDocument(localPath, path.extname(doc.originalName).toLowerCase());
    const text = normalizeText(extracted.text); const words = text.split(/\s+/).filter(Boolean).length;
    if (!text || words < 30) throw new Error('INSUFFICIENT_TEXT');
    if (extracted.pageCount && extracted.pageCount > Math.min(env.maxPages, plan.pagesPerDocument)) throw new Error('PAGE_LIMIT_EXCEEDED');
    if (words > env.maxWords) throw new Error('WORD_LIMIT_EXCEEDED');
    doc.pageCount = extracted.pageCount; doc.extractedWords = words; doc.status = 'generating'; await doc.save();
    await updateProgress(jobId, 'generating', 45, 'Creating structured notes and questions.');
    const pack = await createStudyPack(text, doc.originalName, plan.questionsPerDocument);
    await updateProgress(jobId, 'validating', 70, 'Checking answer options and source evidence.');
    const qset = await QuestionSet.create({ documentId: doc._id, questions: pack.questions, validationStatus: 'passed', version: 1 });
    doc.summary = pack.summary; doc.questionSetId = qset._id; doc.status = 'completed'; await doc.save();
    await updateProgress(jobId, 'rendering', 82, 'Rendering your study PDF.'); await renderStudyPdf(pack, doc.originalName, pdfPath);
    await updateProgress(jobId, 'delivering', 94, 'Sending your summary and practice PDF.');
    const summary = `📘 ${pack.summary.title}\n\n${pack.summary.overview}\n\n${pack.summary.sections.map(s=>`▪️ ${s.heading}\n${s.keyPoints.map(p=>`• ${p}`).join('\n')}`).join('\n\n')}\n\n🔑 Key terms\n${pack.summary.keyTerms.slice(0,15).map(t=>`• ${t.term}: ${t.definition}`).join('\n')}\n\n⚡ Quick revision\n${pack.summary.revisionPoints.map(p=>`• ${p}`).join('\n')}\n\nGenerated ${pack.questions.length} source-grounded questions.`;
    await sendLongMessage(job.chatId, summary);
    await getBot().api.sendDocument(job.chatId, new (await import('grammy')).InputFile(pdfPath, `${path.parse(doc.originalName).name}-study-pack.pdf`), { caption: '📄 Your study pack PDF: summary, Easy/Medium/Hard practice questions and answer explanations.' });
    const keyboard = new InlineKeyboard().text('Easy Quiz', `difficulty:${doc._id}:easy`).text('Medium Quiz', `difficulty:${doc._id}:medium`).row().text('Hard Quiz', `difficulty:${doc._id}:hard`).text('Delete study pack', `delete:${doc._id}`);
    await getBot().api.sendMessage(job.chatId, 'Choose a difficulty to begin your interactive quiz. After each answer, I’ll explain the correct option.', { reply_markup: keyboard });
    success = true; await ProcessingJob.findOneAndUpdate({ jobId }, { status: 'completed', stage: 'completed', progress: 100, completedAt: new Date() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'UNKNOWN_ERROR'; const code = message.startsWith('AI_OUTPUT_INVALID') ? 'AI_OUTPUT_INVALID' : message;
    await StudyDocument.findByIdAndUpdate(doc._id, { status: 'failed', errorCode: code }); await ProcessingJob.findOneAndUpdate({ jobId }, { status: 'failed', stage: 'failed', errorCode: code });
    const userMessage = code === 'INSUFFICIENT_TEXT' ? 'I could not extract enough selectable text. This may be a scanned PDF; OCR is not configured in this MVP.' : code === 'PAGE_LIMIT_EXCEEDED' ? `This document exceeds your plan's page limit (${plan.pagesPerDocument}). Use /plans or upload fewer pages.` : code === 'WORD_LIMIT_EXCEEDED' ? 'This document exceeds the configured extracted-text limit. Please upload a shorter document.' : 'Processing failed temporarily. Your document credit will be released. Please try again with a clearer PDF/DOCX.';
    await getBot().api.sendMessage(job.chatId, userMessage);
    throw error;
  } finally {
    await fs.rm(localPath, { force: true }).catch(()=>{}); await fs.rm(pdfPath, { force: true }).catch(()=>{});
    await settleDocumentQuota(String(user._id), job.periodKey || new Date().toISOString().slice(0,7), success);
  }
}
async function main() {
  await mongoose.connect(env.mongoUri());
  const worker = new Worker('document-processing', async job => processDocument(String(job.data.jobId)), { connection: redisConnection, concurrency: 2 });
  worker.on('completed', job => console.log(`Completed job ${job.id}`));
  worker.on('failed', (job, err) => console.error(`Job ${job?.id} failed:`, err.message));
  console.log('Document worker started.');
}
main().catch(err => { console.error('Worker startup failed:', err); process.exit(1); });
