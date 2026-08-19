/**
 * Extraction de texte depuis un fichier .docx — sans dependance externe.
 *
 * Un .docx est une archive ZIP contenant du XML. On lit le repertoire central
 * du ZIP, on decompresse `word/document.xml` avec l'API native
 * DecompressionStream('deflate-raw'), puis on convertit les balises de
 * paragraphe et de saut de ligne en texte.
 *
 * Meme mecanisme pour .odt (`content.xml`), ce qui vient gratuitement.
 */

const SIGNATURE_EOCD = 0x06054b50;
const SIGNATURE_CENTRAL = 0x02014b50;

export async function extractDocx(file) {
  const buffer = await file.arrayBuffer();
  const entries = readZipEntries(new DataView(buffer), buffer);

  const documentEntry = entries.find((e) => e.name === 'word/document.xml')
    ?? entries.find((e) => e.name === 'content.xml');

  if (!documentEntry) {
    throw new Error('Archive invalide : ni word/document.xml (DOCX) ni content.xml (ODT) trouve.');
  }

  const xml = await inflateEntry(documentEntry, buffer);
  return xmlToText(xml);
}

/** Lit le repertoire central du ZIP (robuste au commentaire de fin d'archive). */
function readZipEntries(view, buffer) {
  let eocd = -1;
  for (let i = view.byteLength - 22; i >= 0 && i > view.byteLength - 66000; i -= 1) {
    if (view.getUint32(i, true) === SIGNATURE_EOCD) { eocd = i; break; }
  }
  if (eocd === -1) throw new Error('Fichier illisible : ce n\'est pas une archive ZIP valide.');

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
  if (entry.method !== 8) throw new Error(`Methode de compression non supportee (${entry.method}).`);
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Ce navigateur ne sait pas decompresser les .docx. Convertissez le fichier en .txt.');
  }

  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(stream).text();
}

/** Convertit le XML WordprocessingML / ODF en texte brut structure. */
function xmlToText(xml) {
  return xml
    // Sauts de ligne et tabulations explicites.
    .replace(/<w:br\s*\/?>/g, '\n')
    .replace(/<w:tab\s*\/?>/g, '\t')
    .replace(/<text:line-break\s*\/?>/g, '\n')
    .replace(/<text:tab\s*\/?>/g, '\t')
    // Fin de paragraphe.
    .replace(/<\/w:p>/g, '\n\n')
    .replace(/<\/text:p>/g, '\n\n')
    .replace(/<\/text:h>/g, '\n\n')
    // Cellules de tableau.
    .replace(/<\/w:tc>/g, '\t')
    .replace(/<\/table:table-cell>/g, '\t')
    // Suppression de toutes les autres balises.
    .replace(/<[^>]+>/g, '')
    // Entites XML.
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
