import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '../config/env';
export const redisConnection = new IORedis(env.redisUrl(), { maxRetriesPerRequest: null });
export const documentQueue = new Queue('document-processing', { connection: redisConnection });
export async function enqueueDocument(payload: { jobId: string }) {
  await documentQueue.add('process-document', payload, { jobId: payload.jobId, attempts: 3, backoff: { type: 'exponential', delay: 3000 }, removeOnComplete: 500, removeOnFail: 1000 });
}
