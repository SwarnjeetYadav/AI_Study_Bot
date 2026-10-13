import mongoose, { Schema, type Model } from 'mongoose';

const UserSchema = new Schema({
  telegramUserId: { type: String, unique: true, required: true, index: true }, chatId: { type: String, required: true },
  username: String, firstName: String, language: { type: String, default: 'auto' }, acceptedTermsAt: Date,
  planId: { type: String, enum: ['free','study','pro'], default: 'free' }, subscriptionStatus: { type: String, default: 'free' },
  subscriptionEndsAt: Date, createdAt: { type: Date, default: Date.now }, lastSeenAt: { type: Date, default: Date.now }
}, { timestamps: true });
const DocumentSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true }, telegramFileId: { type: String, required: true },
  originalName: { type: String, required: true }, mimeType: String, sizeBytes: Number, checksum: String, pageCount: Number,
  extractedWords: Number, status: { type: String, default: 'queued' }, retentionUntil: Date, summary: Schema.Types.Mixed,
  questionSetId: { type: Schema.Types.ObjectId, ref: 'QuestionSet' }, errorCode: String
}, { timestamps: true });
const JobSchema = new Schema({
  jobId: { type: String, unique: true, required: true }, userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  documentId: { type: Schema.Types.ObjectId, ref: 'Document', required: true }, chatId: { type: String, required: true },
  periodKey: String, stage: { type: String, default: 'queued' }, progress: { type: Number, default: 0 }, attempts: { type: Number, default: 0 },
  status: { type: String, default: 'queued', index: true }, errorCode: String, progressMessageId: Number, completedAt: Date
}, { timestamps: true });
const QuestionSetSchema = new Schema({ documentId: { type: Schema.Types.ObjectId, ref: 'Document', required: true, index: true }, questions: [Schema.Types.Mixed], validationStatus: String, version: { type: Number, default: 1 } }, { timestamps: true });
const QuizSessionSchema = new Schema({ userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true }, documentId: { type: Schema.Types.ObjectId, ref: 'Document', required: true }, questionSetId: { type: Schema.Types.ObjectId, ref: 'QuestionSet', required: true }, mode: String, difficulty: String, questionIds: [String], currentIndex: { type: Number, default: 0 }, status: { type: String, default: 'active' }, score: { type: Number, default: 0 }, answeredCount: { type: Number, default: 0 }, answers: [Schema.Types.Mixed], chatId: String, startedAt: { type: Date, default: Date.now }, endedAt: Date }, { timestamps: true });
const UsageSchema = new Schema({ userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true }, periodKey: { type: String, required: true }, metric: { type: String, required: true }, consumed: { type: Number, default: 0 }, reserved: { type: Number, default: 0 } }, { timestamps: true });
const PaymentSchema = new Schema({ orderId: { type: String, unique: true }, userId: { type: Schema.Types.ObjectId, ref: 'User', required: true }, provider: String, providerPaymentId: String, amount: Number, currency: { type: String, default: 'INR' }, status: String, verifiedAt: Date }, { timestamps: true });
const AuditSchema = new Schema({ adminTelegramUserId: String, action: String, targetId: String, metadata: Schema.Types.Mixed }, { timestamps: true });
export const User = (mongoose.models.User as Model<any> | undefined) ?? mongoose.model<any>('User', UserSchema);
export const StudyDocument = (mongoose.models.StudyDocument as Model<any> | undefined) ?? mongoose.model<any>('StudyDocument', DocumentSchema);
export const ProcessingJob = (mongoose.models.ProcessingJob as Model<any> | undefined) ?? mongoose.model<any>('ProcessingJob', JobSchema);
export const QuestionSet = (mongoose.models.QuestionSet as Model<any> | undefined) ?? mongoose.model<any>('QuestionSet', QuestionSetSchema);
export const QuizSession = (mongoose.models.QuizSession as Model<any> | undefined) ?? mongoose.model<any>('QuizSession', QuizSessionSchema);
export const UsageLedger = (mongoose.models.UsageLedger as Model<any> | undefined) ?? mongoose.model<any>('UsageLedger', UsageSchema);
export const Payment = (mongoose.models.Payment as Model<any> | undefined) ?? mongoose.model<any>('Payment', PaymentSchema);
export const AdminAuditLog = (mongoose.models.AdminAuditLog as Model<any> | undefined) ?? mongoose.model<any>('AdminAuditLog', AuditSchema);
