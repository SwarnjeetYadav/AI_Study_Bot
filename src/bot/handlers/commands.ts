import { InlineKeyboard } from 'grammy';
import type { Context } from 'grammy';
import { env } from '../../config/env';
import { plans } from '../../config/plans';
import { AdminAuditLog, StudyDocument, User } from '../../models';
import { getUsage } from '../../services/usage';
export async function help(ctx: Context) { await ctx.reply('📚 How to use the bot\n1. Run /start and accept the terms.\n2. Upload a PDF, DOCX, or study image (PNG/JPG/WEBP).\n3. Read the summary and download the practice PDF.\n4. Tap Easy, Medium or Hard Quiz.\n5. Select an answer to see feedback and explanation.\n\nCommands: /start /help /plans /status /history /delete /cancel /privacy /terms'); }
export async function showPlans(ctx: Context) {
  const text = Object.values(plans).map(p => `${p.name} — ${p.priceInr ? `₹${p.priceInr}/month` : 'Free'}\n• ${p.docsPerMonth} documents/month\n• Up to ${p.pagesPerDocument} pages/document\n• Up to ${p.questionsPerDifficulty} questions per difficulty (Easy, Medium and Hard; ${p.questionsPerDifficulty * 3} total)\n• OCR: ${p.ocr ? 'included' : 'not included'}`).join('\n\n');
  await ctx.reply(`📦 Available plans\n\n${text}\n\nPaid checkout is not enabled in this deployment. No payment will be taken.`, { reply_markup: new InlineKeyboard().text('Check my usage', 'menu:status') });
}
export async function status(ctx: Context) { if (!ctx.from) return; const user = await User.findOne({ telegramUserId: String(ctx.from.id) }); if (!user) { await ctx.reply('Run /start first.'); return; } const u = await getUsage(String(user._id)); await ctx.reply(`📊 Your account\nPlan: ${u.plan.name}\nDocuments used this month: ${u.used}/${u.plan.docsPerMonth}\nRemaining: ${u.remaining}\nSubscription: ${user.subscriptionStatus}${user.subscriptionEndsAt ? `\nAccess until: ${user.subscriptionEndsAt.toLocaleDateString()}` : ''}`); }
export async function history(ctx: Context) { if (!ctx.from) return; const user = await User.findOne({ telegramUserId: String(ctx.from.id) }); if (!user) return void await ctx.reply('Run /start first.'); const docs = await StudyDocument.find({ userId: user._id }).sort({ createdAt: -1 }).limit(8); if (!docs.length) return void await ctx.reply('No study packs yet. Upload a PDF, DOCX or study image to begin.'); await ctx.reply('📚 Recent study packs\n' + docs.map((d:any,i:number)=>`${i+1}. ${d.originalName} — ${d.status} (${new Date(d.createdAt).toLocaleDateString()})`).join('\n')) }
export async function deleteCommand(ctx: Context) { if (!ctx.from) return; const user = await User.findOne({ telegramUserId: String(ctx.from.id) }); if (!user) return void await ctx.reply('Run /start first.'); const docs = await StudyDocument.find({ userId: user._id }).sort({ createdAt: -1 }).limit(5); if (!docs.length) return void await ctx.reply('There are no study packs to delete.'); const kb = new InlineKeyboard(); docs.forEach((d:any)=>kb.text(`Delete ${String(d.originalName).slice(0,25)}`, `delete:${d._id}`).row()); await ctx.reply('Choose a study pack to delete. This removes the stored summary and questions; any temporary source file is cleaned by the worker.', { reply_markup: kb }); }
export async function deleteCallback(ctx: Context) { const data = ctx.callbackQuery && 'data' in ctx.callbackQuery ? ctx.callbackQuery.data : ''; const id = (typeof data === 'string' ? data : '').replace('delete:', ''); if (!ctx.from || !/^[a-f\d]{24}$/i.test(id)) return; const user = await User.findOne({ telegramUserId: String(ctx.from.id) }); const doc = await StudyDocument.findById(id); if (!user || !doc || String(doc.userId) !== String(user._id)) { await ctx.answerCallbackQuery({ text: 'Study pack not found.' }); return; } const { QuestionSet, QuizSession, ProcessingJob } = await import('../../models/index'); await Promise.all([QuestionSet.deleteMany({ documentId: doc._id }), QuizSession.deleteMany({ documentId: doc._id }), ProcessingJob.deleteMany({ documentId: doc._id }), StudyDocument.deleteOne({ _id: doc._id })]); await ctx.answerCallbackQuery({ text: 'Deleted.' }); await ctx.editMessageText('🗑️ Study pack and associated results deleted.'); }
export async function adminCommand(ctx: Context) {
  if (!ctx.from) return;
  if (!env.adminIds.includes(String(ctx.from.id))) { await ctx.reply('Access denied.'); return; }
  const messageText = ctx.message && 'text' in ctx.message && typeof ctx.message.text === 'string' ? ctx.message.text : '';
  const parts = messageText.split(/\s+/);
  const action = parts[1];
  const telegramUserId = parts[2];
  const planId = parts[3];
  if (action === 'grant' && telegramUserId && (planId === 'study' || planId === 'pro')) {
    const target = await User.findOne({ telegramUserId });
    if (!target) return void await ctx.reply('User not found.');
    target.planId = planId;
    target.subscriptionStatus = 'active';
    target.subscriptionEndsAt = new Date(Date.now() + 30 * 86400000);
    await target.save();
    await AdminAuditLog.create({ adminTelegramUserId: String(ctx.from.id), action: 'grant_subscription', targetId: String(target._id), metadata: { planId } });
    await ctx.reply(`Granted ${planId} for 30 days to ${telegramUserId}.`);
    return;
  }
  if (action === 'jobs') {
    const { ProcessingJob } = await import('../../models/index');
    const jobs = await ProcessingJob.find().sort({ createdAt: -1 }).limit(10);
    await ctx.reply(jobs.map((j:any)=>`${j.status} | ${j.stage} | ${j.jobId}`).join('\n') || 'No jobs.');
    return;
  }
  await ctx.reply('Admin commands:\n/admin jobs\n/admin grant <telegram_user_id> <study|pro>');
}
export async function menuCallback(ctx: Context) { const data = ctx.callbackQuery && 'data' in ctx.callbackQuery ? ctx.callbackQuery.data : ''; if (data === 'menu:plans') await showPlans(ctx); else if (data === 'menu:help') await help(ctx); else if (data === 'menu:status') await status(ctx); await ctx.answerCallbackQuery(); }
export async function privacy(ctx: Context) { await ctx.reply(`Privacy summary: documents are processed to generate study material. Avoid uploading sensitive information. Temporary source files are deleted after processing; derived packs remain until you delete them or the retention policy expires. AI provider processing may apply. Full policy: ${env.privacyUrl || 'not configured — publish a privacy policy before launch'}`); }
export async function terms(ctx: Context) { await ctx.reply(`Terms summary: use only documents you have permission to process. AI-generated summaries and questions can be incorrect; verify against the original source. Full terms: ${env.termsUrl || 'not configured — publish terms before launch'}`); }
