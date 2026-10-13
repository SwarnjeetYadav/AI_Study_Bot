import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';
import type { StudyPack } from './ai';
function safe(value: string) { return value.replace(/[\u0000-\u0008]/g, ''); }
export async function renderStudyPdf(pack: StudyPack, filename: string, outPath: string): Promise<void> {
  await fs.promises.mkdir(path.dirname(outPath), { recursive: true });
  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 54, bottom: 54, left: 52, right: 52 }, bufferPages: true });
    const stream = fs.createWriteStream(outPath); doc.pipe(stream); stream.on('finish', resolve); stream.on('error', reject); doc.on('error', reject);
    doc.font('Helvetica-Bold').fontSize(22).fillColor('#16365c').text('AI TELEGRAM STUDY BOT');
    doc.moveDown(.5).fontSize(18).text(safe(pack.summary.title || filename));
    doc.font('Helvetica').fontSize(9).fillColor('#666666').text(`Source: ${safe(filename)} | Generated: ${new Date().toLocaleDateString('en-IN')}`);
    doc.moveDown().fillColor('#111111').font('Helvetica-Bold').fontSize(15).text('Quick Summary');
    doc.font('Helvetica').fontSize(10).text(safe(pack.summary.overview));
    for (const section of pack.summary.sections) { doc.moveDown(.5).font('Helvetica-Bold').fontSize(12).fillColor('#16365c').text(safe(section.heading)); doc.font('Helvetica').fontSize(10).fillColor('#111111'); for (const point of section.keyPoints) doc.list([safe(point)], { bulletIndent: 10, textIndent: 18 }); }
    if (pack.summary.keyTerms.length) { doc.addPage().font('Helvetica-Bold').fontSize(15).fillColor('#16365c').text('Key Terms'); doc.moveDown(.5); for (const term of pack.summary.keyTerms) { doc.font('Helvetica-Bold').fontSize(10).fillColor('#111111').text(safe(term.term)); doc.font('Helvetica').text(safe(term.definition)); doc.moveDown(.3); } }
    const levels = ['easy','medium','hard'] as const;
    for (const level of levels) { const qs = pack.questions.filter(q => q.difficulty === level); if (!qs.length) continue; doc.addPage().font('Helvetica-Bold').fontSize(17).fillColor('#16365c').text(`${level.toUpperCase()} QUESTIONS`); doc.moveDown(.5); qs.forEach((q, idx) => { doc.font('Helvetica-Bold').fontSize(10).fillColor('#111111').text(`${idx + 1}. ${safe(q.question)}`, { continued: false }); doc.font('Helvetica').fontSize(9); q.options.forEach(o => doc.text(`${o.id}) ${safe(o.text)}`, { indent: 12 })); doc.moveDown(.5); }); }
    doc.addPage().font('Helvetica-Bold').fontSize(17).fillColor('#16365c').text('ANSWER KEY & EXPLANATIONS'); doc.moveDown();
    for (const q of pack.questions) { const answer = q.options.find(o => o.id === q.correctOptionId); doc.font('Helvetica-Bold').fontSize(10).fillColor('#111111').text(`${q.id} (${q.difficulty.toUpperCase()}): ${q.correctOptionId}) ${safe(answer?.text ?? '')}`); doc.font('Helvetica').fontSize(9).text(safe(q.explanation)); if (q.sourceSection) doc.fillColor('#555555').text(`Source section: ${safe(q.sourceSection)}`); doc.moveDown(.5); }
    doc.moveDown().fontSize(8).fillColor('#666666').text('AI-generated learning material may contain errors. Verify important details against the original document.');
    const range = doc.bufferedPageRange(); for (let i = range.start; i < range.start + range.count; i++) { doc.switchToPage(i); doc.font('Helvetica').fontSize(8).fillColor('#777777').text(`Page ${i + 1} of ${range.count}`, 52, 800, { align: 'center', width: 491 }); }
    doc.end();
  });
}
