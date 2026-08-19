/**
 * Extraction de texte depuis un PDF.
 *
 * Deux strategies, dans cet ordre :
 *   1. pdf.js charge a la demande depuis un CDN (extraction fiable, gere les
 *      encodages et la mise en page) ;
 *   2. si le CDN est injoignable (hors ligne, reseau filtre), un extracteur
 *      interne minimal lit les flux de texte non compresses et ceux compresses
 *      en Flate via DecompressionStream.
 *
 * La strategie 2 est volontairement presentee comme degradee : elle rate les
 * PDF scannes (images) et certains encodages exotiques. Un message clair le
 * signale plutot que de rendre un texte silencieusement tronque.
 */

const PDFJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.6.82/pdf.min.mjs';
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.6.82/pdf.worker.min.mjs';

let pdfjsPromise = null;

async function loadPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import(/* @vite-ignore */ PDFJS_URL).then((mod) => {
      mod.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
      return mod;
    });
  }
  return pdfjsPromise;
}

export async function extractPdf(file, onProgress = () => {}) {
  const buffer = await file.arrayBuffer();

  try {
    const pdfjs = await loadPdfJs();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
    const pages = [];
    for (let i = 1; i <= doc.numPages; i += 1) {
      onProgress(`Page ${i}/${doc.numPages}`, i / doc.numPages);
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      pages.push(joinTextItems(content.items));
    }
    const text = pages.join('\n\n').trim();
    if (text.length > 40) return { text, degraded: false, pages: doc.numPages };
    throw new Error('Aucun texte extrait (PDF probablement scanne).');
  } catch (err) {
    const fallback = await extractPdfFallback(buffer);
    if (fallback.length > 40) {
      return {
        text: fallback,
        degraded: true,
        warning: `Extraction de secours utilisee (${err.message}). Le texte peut etre incomplet ou mal ordonne — verifiez-le avant d'exploiter les scores.`,
      };
    }
    throw new Error(
      'Impossible d\'extraire le texte de ce PDF. S\'il s\'agit d\'un document scanne, il faut d\'abord le passer par un OCR.',
    );
  }
}

/** Reconstitue les sauts de ligne a partir de la position verticale des items. */
function joinTextItems(items) {
  let text = '';
  let lastY = null;
  for (const item of items) {
    const y = item.transform?.[5];
    if (lastY !== null && Math.abs(y - lastY) > 4) text += '\n';
    else if (text && !text.endsWith(' ') && !text.endsWith('\n')) text += ' ';
    text += item.str;
    if (item.hasEOL) text += '\n';
    lastY = y;
  }
  return text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

/** Extracteur de secours : lit les operateurs de texte des flux du PDF. */
async function extractPdfFallback(buffer) {
  const bytes = new Uint8Array(buffer);
  const latin = new TextDecoder('latin1').decode(bytes);
  const chunks = [];

  const streamRe = /stream\r?\n?([\s\S]*?)endstream/g;
  let match;
  while ((match = streamRe.exec(latin)) !== null) {
    const raw = match[1];
    let content = raw;
    // Flux compresse : on tente une decompression zlib.
    if (/^\x78[\x01\x9c\xda\x5e]/.test(raw)) {
      content = await inflate(raw) ?? '';
    }
    const extracted = extractTextOperators(content);
    if (extracted.trim().length > 5) chunks.push(extracted);
  }

  return chunks.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}

async function inflate(latinString) {
  if (typeof DecompressionStream === 'undefined') return null;
  try {
    const bytes = Uint8Array.from(latinString, (c) => c.charCodeAt(0) & 0xff);
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
    const out = await new Response(stream).arrayBuffer();
    return new TextDecoder('latin1').decode(new Uint8Array(out));
  } catch {
    return null;
  }
}

/** Recupere le contenu des operateurs Tj / TJ / ' / ". */
function extractTextOperators(content) {
  let text = '';
  const re = /\((?:\\.|[^\\()])*\)|\[(?:[^\][]|\\.)*\]\s*TJ|TD|Td|T\*|ET/g;
  let match;
  while ((match = re.exec(content)) !== null) {
    const token = match[0];
    if (token === 'TD' || token === 'Td' || token === 'T*' || token === 'ET') {
      text += '\n';
    } else if (token.startsWith('[')) {
      for (const part of token.matchAll(/\((?:\\.|[^\\()])*\)/g)) {
        text += decodePdfString(part[0]);
      }
    } else if (token.startsWith('(')) {
      text += decodePdfString(token);
    }
  }
  return text.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n');
}

function decodePdfString(token) {
  return token
    .slice(1, -1)
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\([()\\])/g, '$1')
    .replace(/\\(\d{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)));
}
