import express from 'express';
import mongoose from 'mongoose';
import { env } from './config/env';
import { getBot } from './services/telegram';
import { startHandler, upsertUser } from './bot/handlers/start';
import { documentHandler } from './bot/handlers/document';
import { quizCallback, beginQuiz } from './bot/handlers/quiz';
import { adminCommand, deleteCallback, deleteCommand, help, history, menuCallback, privacy, showPlans, status, terms } from './bot/handlers/commands';
import { StudyDocument, QuestionSet, User } from './models';
import { renderStudyPdf } from './services/pdf';
import { InputFile } from 'grammy';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

async function main() {
  await mongoose.connect(env.mongoUri());
  const bot = getBot();

  // Telegram displays these commands as suggestions when users type "/" in chat.
  // Keep this public list aligned with commands registered below; admin is intentionally hidden.
  await bot.api.setMyCommands([
    { command: 'start', description: 'Start the bot and review consent' },
    { command: 'help', description: 'How to use AI Study Bot' },
    { command: 'new', description: 'Start a new study pack' },
    { command: 'plans', description: 'View plans and document limits' },
    { command: 'status', description: 'Check your plan and remaining credits' },
    { command: 'history', description: 'View your recent study packs' },
    { command: 'delete', description: 'Delete a study pack and its results' },
    { command: 'cancel', description: 'View cancellation and queue guidance' },
    { command: 'privacy', description: 'Read the privacy summary' },
    { command: 'terms', description: 'Read the terms of use' },
  ]);

  bot.command('start', startHandler); bot.command('help', help); bot.command('plans', showPlans); bot.command('status', status); bot.command('history', history); bot.command('delete', deleteCommand); bot.command('privacy', privacy); bot.command('terms', terms); bot.command('admin', adminCommand);
  bot.command('new', async ctx => ctx.reply('Upload a PDF or DOCX file to start a new study pack.'));
  bot.command('cancel', async ctx => ctx.reply('No interactive cancellation is available at this moment. Queued jobs will be processed; contact support if a job is stuck.'));
  bot.on('message:document', documentHandler);
  bot.callbackQuery('consent:accept', async ctx => { const user = await upsertUser(ctx); if (user) { user.acceptedTermsAt = new Date(); await user.save(); } await ctx.answerCallbackQuery({ text: 'Consent saved.' }); await ctx.reply('You’re ready to learn! Upload a PDF or DOCX file.'); });
  bot.callbackQuery(/^mode:/, async ctx => {
    const data = ctx.callbackQuery && 'data' in ctx.callbackQuery ? ctx.callbackQuery.data : '';
    if (data === 'mode:end') {
      await ctx.answerCallbackQuery({ text: 'Study session ended.' });
      await ctx.reply('👋 Study session ended. Upload another PDF/DOCX or use /new whenever you are ready.');
      return;
    }
    const match = /^mode:([a-f\\d]{24}):(easy|medium|hard)$/.exec(data);
    if (!match || !match[1] || !match[2]) {
      await ctx.answerCallbackQuery({ text: 'This mode button is invalid.' });
      return;
    }
    await ctx.answerCallbackQuery();
    await beginQuiz(ctx, match[1], match[2]);
  });
  bot.callbackQuery(/^fullpdf:/, async ctx => {
    const data = ctx.callbackQuery && 'data' in ctx.callbackQuery ? ctx.callbackQuery.data : '';
    const documentId = data.split(':')[1];
    if (!ctx.from || !ctx.chat || !documentId) { await ctx.answerCallbackQuery({ text: 'Invalid PDF request.' }); return; }
    const user = await User.findOne({ telegramUserId: String(ctx.from.id) });
    const doc = await StudyDocument.findById(documentId);
    if (!user || !doc || String(doc.userId) !== String(user._id)) { await ctx.answerCallbackQuery({ text: 'Study pack not found.' }); return; }
    const set = await QuestionSet.findOne({ documentId }).sort({ createdAt: -1 });
    if (!set || !doc.summary) { await ctx.answerCallbackQuery({ text: 'Question PDF is still being generated. Please try again shortly.' }); return; }
    await ctx.answerCallbackQuery({ text: 'Preparing your question PDF.' });
    const out = path.join(env.tempDir, `questions-${crypto.randomUUID()}.pdf`);
    try {
      const mixedQuestions = [...set.questions] as any[];
      for (let i = mixedQuestions.length - 1; i > 0; i--) {
        const j = crypto.randomInt(i + 1);
        const temp = mixedQuestions[i]; mixedQuestions[i] = mixedQuestions[j]!; mixedQuestions[j] = temp!;
      }
      await renderStudyPdf({ summary: doc.summary, questions: mixedQuestions } as any, doc.originalName, out);
      await ctx.api.sendDocument(ctx.chat.id, new InputFile(out, `${path.parse(doc.originalName).name}-question-set.pdf`), { caption: 'Complete question set with answers and explanations.' });
    } finally { await fs.rm(out, { force: true }).catch(() => {}); }
  });
  bot.callbackQuery(/^quiz:/, quizCallback);
  bot.callbackQuery(/^delete:/, deleteCallback);
  bot.callbackQuery(/^menu:/, menuCallback);
  bot.callbackQuery(/^difficulty:/, async ctx => {
    const data = ctx.callbackQuery && 'data' in ctx.callbackQuery ? ctx.callbackQuery.data : '';
    const [, documentId, difficulty] = data.split(':');
    if (!documentId || !difficulty || !['easy', 'medium', 'hard'].includes(difficulty)) {
      await ctx.answerCallbackQuery({ text: 'This quiz link is invalid. Please try again.' });
      return;
    }
    await ctx.answerCallbackQuery();
    await beginQuiz(ctx, documentId, difficulty);
  });
  const app = express(); app.get('/health/live', (_req,res)=>res.json({ status: 'ok' })); app.get('/health/ready', (_req,res)=>res.json({ status: mongoose.connection.readyState === 1 ? 'ready' : 'not_ready' }));
  app.listen(env.port, () => console.log(`Health server listening on ${env.port}`));
  await bot.start({ onStart: info => console.log(`Telegram bot @${info.username} started (long polling)`), allowed_updates: ['message','callback_query','poll_answer'] });
}
main().catch(err => { console.error('Bot startup failed:', err); process.exit(1); });
