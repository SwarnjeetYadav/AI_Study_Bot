import crypto from 'node:crypto';
import path from 'node:path';
import type { Context } from 'grammy';
import { env } from '../../config/env';
import { StudyDocument, ProcessingJob } from '../../models';
import { enqueueDocument } from '../../services/queue';
import { reserveDocumentQuota, settleDocumentQuota } from '../../services/usage';
import { upsertUser } from './start';
export async function documentHandler(ctx: Context) {
  const doc = ctx.message?.document; if (!doc || !ctx.from || !ctx.chat) return;
  const name = doc.file_name ?? 'upload'; const ext = path.extname(name).toLowerCase();
  if (!['.pdf','.docx'].includes(ext)) { await ctx.reply('Please upload a PDF or DOCX file. This file type is not supported.'); return; }
  if (doc.file_size && doc.file_size > env.maxUploadBytes) { await ctx.reply(`This file is too large. Current upload limit is ${Math.round(env.maxUploadBytes / 1_000_000)} MB.`); return; }
  const user = await upsertUser(ctx); if (!user) return;
  if (!user.acceptedTermsAt) { await ctx.reply('Please run /start and accept the Terms and Privacy notice before uploading.'); return; }
  let periodKey = '';
  try { const reservation = await reserveDocumentQuota(String(user._id)); periodKey = reservation.periodKey; }
  catch (e) { if (e instanceof Error && e.message === 'QUOTA_EXCEEDED') { await ctx.reply('You have used all document credits for this month. Use /plans to compare plans.'); return; } throw e; }
  const jobId = crypto.randomUUID();
  const saved = await StudyDocument.create({ userId: user._id, telegramFileId: doc.file_id, originalName: name, mimeType: doc.mime_type, sizeBytes: doc.file_size, status: 'queued', retentionUntil: new Date(Date.now() + 7 * 86400000) });
  const progress = await ctx.reply(`📄 Received: ${name}\n⏳ Queued for processing. I’ll send your summary, practice PDF and quiz buttons when ready.`);
  await ProcessingJob.create({ jobId, userId: user._id, documentId: saved._id, chatId: String(ctx.chat.id), stage: 'queued', progress: 0, status: 'queued', progressMessageId: progress.message_id, periodKey });
  try { await enqueueDocument({ jobId }); }
  catch (error) { await StudyDocument.findByIdAndUpdate(saved._id, { status: 'failed', errorCode: 'QUEUE_UNAVAILABLE' }); await ProcessingJob.findOneAndUpdate({ jobId }, { status: 'failed', errorCode: 'QUEUE_UNAVAILABLE' }); await settleDocumentQuota(String(user._id), periodKey, false); await ctx.reply('The processing queue is temporarily unavailable. Your document credit was released; please retry later.'); }
}
