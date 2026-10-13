import { InlineKeyboard } from 'grammy';
import type { Context } from 'grammy';
import { User } from '../../models';
import { env } from '../../config/env';
export async function upsertUser(ctx: Context) {
  if (!ctx.from || !ctx.chat) return null;
  return User.findOneAndUpdate({ telegramUserId: String(ctx.from.id) }, { $set: { chatId: String(ctx.chat.id), username: ctx.from.username, firstName: ctx.from.first_name, lastSeenAt: new Date() }, $setOnInsert: { language: 'auto', planId: 'free', subscriptionStatus: 'free' } }, { upsert: true, new: true });
}
export async function startHandler(ctx: Context) {
  const user = await upsertUser(ctx); if (!user) return;
  const kb = new InlineKeyboard().text('I agree — Start learning', 'consent:accept').row().text('View plans', 'menu:plans').text('Help', 'menu:help');
  await ctx.reply(`👋 Welcome to AI Telegram Study Bot!\n\nUpload a PDF or DOCX and I’ll create structured revision notes, Easy/Medium/Hard MCQs, a practice PDF, and interactive quizzes with explanations.\n\n⚠️ AI output can contain mistakes. Check important facts against your source.\n\nBy continuing, you confirm you have the right to upload this document and agree to the Terms and Privacy Policy.${env.termsUrl ? `\nTerms: ${env.termsUrl}` : ''}${env.privacyUrl ? `\nPrivacy: ${env.privacyUrl}` : ''}`, { reply_markup: kb });
}
