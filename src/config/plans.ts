export type PlanId = 'free' | 'study' | 'pro';
export interface Plan { id: PlanId; name: string; priceInr: number; docsPerMonth: number; pagesPerDocument: number; questionsPerDifficulty: number; ocr: boolean; priority: number }
export const plans: Record<PlanId, Plan> = {
  free: { id: 'free', name: 'Free', priceInr: 0, docsPerMonth: 5, pagesPerDocument: 20, questionsPerDifficulty: 20, ocr: false, priority: 1 },
  study: { id: 'study', name: 'Study', priceInr: Number(process.env.STUDY_PRICE_INR ?? 149), docsPerMonth: 40, pagesPerDocument: 100, questionsPerDifficulty: 30, ocr: true, priority: 2 },
  pro: { id: 'pro', name: 'Pro', priceInr: Number(process.env.PRO_PRICE_INR ?? 299), docsPerMonth: 100, pagesPerDocument: 250, questionsPerDifficulty: 40, ocr: true, priority: 3 }
};
export function getPlan(id?: string): Plan { return plans[(id as PlanId)] ?? plans.free; }
