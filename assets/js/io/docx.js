/**
 * Text extraction from a .docx file — with no external dependency.
 *
 * A .docx is a ZIP archive containing XML. We read the ZIP central directory,
 * inflate `word/document.xml` with the native DecompressionStream('deflate-raw')
 * API, then convert paragraph and line-break tags into text.
 *
 * The same mechanism handles .odt (`content.xml`), which comes for free.
 */

const SIGNATURE_EOCD = 0x06054b50;
const SIGNATURE_CENTRAL = 0x02014b50;

import { t } from '../i18n/index.js';

export async function extractDocx(file) {
  const buffer = await file.arrayBuffer();
  const entries = readZipEntries(new DataView(buffer), buffer);

  const documentEntry = entries.find((e) => e.name === 'word/document.xml')
    ?? entries.find((e) => e.name === 'content.xml');

  if (!documentEntry) {
    throw new Error(t('errors.docxInvalid'));
  }

  const xml = await inflateEntry(documentEntry, buffer);
  return xmlToText(xml);
}

/** Read the ZIP central directory (tolerant of a trailing archive comment). */
function readZipEntries(view, buffer) {
  let eocd = -1;
  for (let i = view.byteLength - 22; i >= 0 && i > view.byteLength - 66000; i -= 1) {
    if (view.getUint32(i, true) === SIGNATURE_EOCD) { eocd = i; break; }
  }
  if (eocd === -1) throw new Error(t('errors.zipInvalid'));

  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const entries = [];

  for (let i = 0; i < count; i += 1) {
    if (view.getUint32(offset, true) !== SIGNATURE_CENTRAL) break;
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = new TextDecoder().decode(new Uint8Array(buffer, offset + 46, nameLength));

    entries.push({ name, method, compressedSize, localOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

async function inflateEntry(entry, buffer) {
  const view = new DataView(buffer);
  const nameLength = view.getUint16(entry.localOffset + 26, true);
  const extraLength = view.getUint16(entry.localOffset + 28, true);
  const dataStart = entry.localOffset + 30 + nameLength + extraLength;
  const data = new Uint8Array(buffer, dataStart, entry.compressedSize);

  if (entry.method === 0) return new TextDecoder().decode(data);
  if (entry.method !== 8) throw new Error(t('errors.zipMethod', { method: entry.method }));
  if (typeof DecompressionStream === 'undefined') {
    throw new Error(t('errors.noDecompression'));
  }

  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(stream).text();
}

/** Convert WordprocessingML / ODF XML into structured plain text. */
function xmlToText(xml) {
  return xml
    // Explicit line breaks and tabs.
    .replace(/<w:br\s*\/?>/g, '\n')
    .replace(/<w:tab\s*\/?>/g, '\t')
    .replace(/<text:line-break\s*\/?>/g, '\n')
    .replace(/<text:tab\s*\/?>/g, '\t')
    // Paragraph end.
    .replace(/<\/w:p>/g, '\n\n')
    .replace(/<\/text:p>/g, '\n\n')
    .replace(/<\/text:h>/g, '\n\n')
    // Table cells.
    .replace(/<\/w:tc>/g, '\t')
    .replace(/<\/table:table-cell>/g, '\t')
    // Strip every remaining tag.
    .replace(/<[^>]+>/g, '')
    // XML entities.
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
