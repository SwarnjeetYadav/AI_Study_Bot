import { InlineKeyboard } from 'grammy';
import { QuizSession, QuestionSet } from '../models';
export async function startQuiz(userId: string, chatId: string, documentId: string, difficulty: string) {
  const set = await QuestionSet.findOne({ documentId }).sort({ createdAt: -1 }); if (!set) throw new Error('QUESTION_SET_NOT_FOUND');
  const questions = (set.questions as any[]).filter(q => q.difficulty === difficulty);
  if (!questions.length) throw new Error('NO_QUESTIONS_FOR_LEVEL');
  const session = await QuizSession.create({ userId, chatId, documentId, questionSetId: set._id, mode: 'inline', difficulty, questionIds: questions.map(q => q.id), currentIndex: 0, answers: [], status: 'active' });
  return { session, question: questions[0], keyboard: answerKeyboard(String(session._id), questions[0].id, questions[0].options) };
}
export function answerKeyboard(sessionId: string, questionId: string, options: Array<{id:string;text:string}>) {
  const kb = new InlineKeyboard(); for (const o of options) kb.text(`${o.id}. ${o.text.slice(0, 32)}`, `quiz:${sessionId}:${questionId}:${o.id}`).row(); return kb;
}
export async function findQuestion(session: any, questionId: string) {
  const set = await QuestionSet.findById(session.questionSetId); return (set?.questions as any[] | undefined)?.find(q => q.id === questionId);
}
