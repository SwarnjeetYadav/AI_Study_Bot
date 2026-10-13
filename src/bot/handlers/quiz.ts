import type { Context } from 'grammy';
import { QuizSession, QuestionSet, StudyDocument } from '../../models';
import { answerKeyboard, findQuestion, startQuiz } from '../../services/quiz';
export async function beginQuiz(ctx: Context, documentId: string, difficulty: string) {
  if (!ctx.from || !ctx.chat) return;
  try {
    const doc = await StudyDocument.findById(documentId);
    const { User } = await import('../../models/index'); const user = await User.findOne({ telegramUserId: String(ctx.from.id) });
    if (!doc || !user || String(doc.userId) !== String(user._id)) { await ctx.reply('This study pack is not available for your account.'); return; }
    const result = await startQuiz(String(user._id), String(ctx.chat.id), documentId, difficulty);
    await ctx.reply(`📝 ${difficulty.toUpperCase()} QUIZ\n\n${result.question.question}`, { reply_markup: result.keyboard });
  } catch (e) { await ctx.reply('I could not start that quiz. Please generate a new study pack or choose another difficulty.'); }
}
export async function quizCallback(ctx: Context) {
  const data = ctx.callbackQuery && 'data' in ctx.callbackQuery ? ctx.callbackQuery.data : undefined;
  if (!data || !ctx.from) return;
  const match = /^quiz:([a-f\d]{24}):([^:]{1,80}):([ABCD])$/.exec(data);
  if (!match) { await ctx.answerCallbackQuery({ text: 'This quiz button is invalid.' }); return; }
  const [, sessionId, questionId, selected] = match;
  if (!sessionId || !questionId || !selected) { await ctx.answerCallbackQuery({ text: 'This quiz button is invalid.' }); return; }
  const { User } = await import('../../models/index'); const user = await User.findOne({ telegramUserId: String(ctx.from.id) });
  const session = await QuizSession.findById(sessionId);
  if (!user || !session || String(session.userId) !== String(user._id) || session.status !== 'active') { await ctx.answerCallbackQuery({ text: 'This quiz has expired.' }); return; }
  const prior = (session.answers as any[]).find(a => a.questionId === questionId);
  if (prior) { await ctx.answerCallbackQuery({ text: 'Your answer has already been recorded.' }); return; }
  const q = await findQuestion(session, questionId);
  if (!q || session.questionIds[session.currentIndex] !== questionId) { await ctx.answerCallbackQuery({ text: 'This question is no longer active.' }); return; }
  const correct = selected === q.correctOptionId;
  // Atomically advance only if this callback still targets the active question.
  // Telegram can deliver duplicate/rapid callbacks; a normal read-modify-save can skip questions.
  const update = await QuizSession.updateOne(
    { _id: session._id, status: 'active', currentIndex: session.currentIndex, 'answers.questionId': { $ne: questionId } },
    {
      $push: { answers: { questionId, selectedOptionId: selected, isCorrect: correct, answeredAt: new Date() } },
      $inc: { answeredCount: 1, currentIndex: 1, ...(correct ? { score: 1 } : {}) }
    }
  );
  if (update.modifiedCount !== 1) {
    await ctx.answerCallbackQuery({ text: 'This question was already answered or is no longer active.' });
    return;
  }
  const updatedSession = await QuizSession.findById(session._id);
  if (!updatedSession) { await ctx.answerCallbackQuery({ text: 'This quiz has expired.' }); return; }
  const nextId = updatedSession.questionIds[updatedSession.currentIndex];
  if (!nextId) {
    updatedSession.status = 'completed'; updatedSession.endedAt = new Date(); await updatedSession.save();
    await ctx.answerCallbackQuery({ text: correct ? 'Correct!' : 'Answer recorded.' });
    await ctx.editMessageReplyMarkup({ reply_markup: undefined });
    const accuracy = Math.round(updatedSession.score / Math.max(1, updatedSession.answeredCount) * 100);
    await ctx.reply(`🏁 Quiz completed!\nScore: ${updatedSession.score}/${updatedSession.answeredCount}\nAccuracy: ${accuracy}%\n\nUse the study pack buttons to practise another level.`);
    return;
  }
  await ctx.answerCallbackQuery({ text: correct ? 'Correct!' : 'Answer recorded.' });
  const answerText = q.options.find((o:any) => o.id === q.correctOptionId)?.text ?? '';
  await ctx.reply(`${correct ? '✅ Correct!' : '❌ Not quite.'}\nCorrect answer: ${q.correctOptionId}) ${answerText}\nWhy: ${q.explanation}${q.sourceSection ? `\nSource: ${q.sourceSection}` : ''}`);
  const next = await findQuestion(updatedSession, nextId); if (!next) { await ctx.reply('I could not load the next question. Please restart this quiz.'); return; }
  await ctx.reply(`Question ${session.currentIndex + 1}/${session.questionIds.length}\n\n${next.question}`, { reply_markup: answerKeyboard(String(updatedSession._id), next.id, next.options) });
}
