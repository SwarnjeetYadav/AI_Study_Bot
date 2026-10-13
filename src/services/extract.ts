import fs from 'node:fs/promises';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
export interface ExtractedDocument { text: string; pageCount: number; title?: string }
export async function extractDocument(path: string, ext: string): Promise<ExtractedDocument> {
  if (ext === '.pdf') {
    const data = await pdfParse(await fs.readFile(path));
    return { text: data.text.replace(/\u0000/g, '').trim(), pageCount: data.numpages, title: data.info?.Title };
  }
  if (ext === '.docx') {
    const result = await mammoth.extractRawText({ path });
    return { text: result.value.trim(), pageCount: 0 };
  }
  throw new Error('UNSUPPORTED_FILE_TYPE');
}
export function normalizeText(text: string): string {
  return text.replace(/\r/g, '\n').replace(/[\t ]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}
