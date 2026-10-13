import crypto from 'node:crypto';
import path from 'node:path';
import type { Context } from 'grammy';
import { env } from '../../config/env';
import { StudyDocument, ProcessingJob } from '../../models';
import { enqueueDocument } from '../../services/queue';
import { reserveDocumentQuota, settleDocumentQuota } from '../../services/usage';
import { upsertUser } from './start';

const allowedExtensions = new Set(['.pdf', '.docx', '.png', '.jpg', '.jpeg', '.webp']);
const imageMimeTypes: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

export async function documentHandler(ctx: Context) {
  const message = ctx.message;
  if (!message || !ctx.from || !ctx.chat) return;

  let fileId = '';
  let name = '';
  let mimeType: string | undefined;
  let fileSize: number | undefined;

  if ('document' in message && message.document) {
    const file = message.document;
    name = file.file_name ?? 'upload';
    const ext = path.extname(name).toLowerCase();
    mimeType = file.mime_type;
    if (!allowedExtensions.has(ext)) {
      await ctx.reply('Please upload a PDF, DOCX, PNG, JPG/JPEG or WEBP image.');
      return;
    }
    fileId = file.file_id;
    fileSize = file.file_size;
  
} else if ('photo' in message && message.photo?.length) {
  const photo = message.photo[message.photo.length - 1];

  if (!photo) {
    await ctx.reply('I could not read that image. Please upload it again.');
    return;
  }

  fileId = photo.file_id;
  name = `image-${Date.now()}.jpg`;
  mimeType = 'image/jpeg';
  fileSize = photo.file_size;
}
 else {
    return;
  }

  if (fileSize && fileSize > env.maxUploadBytes) {
    await ctx.reply(`This file is too large. Current upload limit is ${Math.round(env.maxUploadBytes / 1_000_000)} MB.`);
    return;
  }
  const user = await upsertUser(ctx); if (!user) return;
  if (!user.acceptedTermsAt) { await ctx.reply('Please run /start and accept the Terms and Privacy notice before uploading.'); return; }

  let periodKey = '';
  try { const reservation = await reserveDocumentQuota(String(user._id)); periodKey = reservation.periodKey; }
  catch (e) { if (e instanceof Error && e.message === 'QUOTA_EXCEEDED') { await ctx.reply('You have used all 5 document credits for this month on the Free plan. Use /plans to compare plans.'); return; } throw e; }

  const jobId = crypto.randomUUID();
  const saved = await StudyDocument.create({ userId: user._id, telegramFileId: fileId, originalName: name, mimeType: mimeType ?? imageMimeTypes[path.extname(name).toLowerCase()], sizeBytes: fileSize, status: 'queued', retentionUntil: new Date(Date.now() + 7 * 86400000) });
  const progress = await ctx.reply(`📄 Received: ${name}\n⏳ Queued for processing. I’ll send your summary, practice PDF and quiz buttons when ready.`);
  await ProcessingJob.create({ jobId, userId: user._id, documentId: saved._id, chatId: String(ctx.chat.id), stage: 'queued', progress: 0, status: 'queued', progressMessageId: progress.message_id, periodKey });
  try { await enqueueDocument({ jobId }); }
  catch (error) { await StudyDocument.findByIdAndUpdate(saved._id, { status: 'failed', errorCode: 'QUEUE_UNAVAILABLE' }); await ProcessingJob.findOneAndUpdate({ jobId }, { status: 'failed', errorCode: 'QUEUE_UNAVAILABLE' }); await settleDocumentQuota(String(user._id), periodKey, false); await ctx.reply('The processing queue is temporarily unavailable. Your document credit was released; please retry later.'); }
}
