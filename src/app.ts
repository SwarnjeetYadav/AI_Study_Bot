import express from 'express';
import mongoose from 'mongoose';
import { env } from './config/env';
import { getBot } from './services/telegram';
import { startHandler, upsertUser } from './bot/handlers/start';
import { documentHandler } from './bot/handlers/document';
import { quizCallback, beginQuiz } from './bot/handlers/quiz';
import { adminCommand, deleteCallback, deleteCommand, help, history, menuCallback, privacy, showPlans, status, terms } from './bot/handlers/commands';
import { StudyDocument } from './models';

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
