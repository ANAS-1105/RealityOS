/**
 * Client-side document text extraction.
 *
 * Files are parsed in the browser and reduced to plain text before anything is
 * sent anywhere: the original PDF/DOCX never leaves the device, which is both a
 * privacy property and a cheaper round trip. The heavy parsers are dynamically
 * imported so they never affect first paint (each lands in its own chunk).
 */
export type AttachmentKind = 'pdf' | 'docx' | 'text' | 'image'

export interface ExtractedDocument {
  name: string
  kind: AttachmentKind
  text: string
  chars: number
  /** Set when a file type is accepted but its content cannot be read locally. */
  note?: string
}

export const MAX_FILE_BYTES = 12 * 1024 * 1024 // 12 MB
export const MAX_CHARS = 20_000
const ACCEPTED = '.pdf,.docx,.txt,.md,.markdown,.csv,.json,.log,.rtf,image/*'

export const ACCEPT_ATTRIBUTE = ACCEPTED

export function kindFor(file: File): AttachmentKind | null {
  const name = file.name.toLowerCase()
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf'
  if (name.endsWith('.docx')) return 'docx'
  if (file.type.startsWith('image/')) return 'image'
  if (
    file.type.startsWith('text/') ||
    /\.(txt|md|markdown|csv|json|log|rtf)$/.test(name)
  ) {
    return 'text'
  }
  return null
}

function post(text: string): string {
  const trimmed = text.replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  return trimmed.length > MAX_CHARS ? `${trimmed.slice(0, MAX_CHARS)}\n\n[truncated]` : trimmed
}

async function readPdf(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  // The worker is bundled by Vite as a separate asset (see vite.config.ts).
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  const data = new Uint8Array(await file.arrayBuffer())
  const document = await pdfjs.getDocument({ data, useSystemFonts: true }).promise
  const pages: string[] = []
  const pageLimit = Math.min(document.numPages, 12)
  for (let page = 1; page <= pageLimit; page += 1) {
    const content = await (await document.getPage(page)).getTextContent()
    const text = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (text) pages.push(text)
  }
  return post(pages.join('\n\n'))
}

async function readDocx(file: File): Promise<string> {
  // The browser build avoids Node-only modules (fs, path).
  // @ts-expect-error - the package ships no types for its browser bundle.
  const mammoth = (await import('mammoth/mammoth.browser.js')) as unknown as {
    default?: { extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string }> }
    extractRawText?: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>
  }
  const api = mammoth.default ?? mammoth
  const result = await api.extractRawText!({ arrayBuffer: await file.arrayBuffer() })
  return post(result.value)
}

/** Extract what we can from a single file. Never throws: failures become notes. */
export async function extractDocument(file: File): Promise<ExtractedDocument> {
  const kind = kindFor(file)
  if (!kind) {
    return { name: file.name, kind: 'text', text: '', chars: 0, note: 'Unsupported file type — accepted: PDF, DOCX, text and images.' }
  }
  if (file.size > MAX_FILE_BYTES) {
    return { name: file.name, kind, text: '', chars: 0, note: 'That file is larger than 12 MB, so it was skipped.' }
  }

  try {
    if (kind === 'image') {
      return {
        name: file.name,
        kind,
        text: '',
        chars: 0,
        note: 'Images are attached as context. Text inside them is not read — describe the important parts in your own words for a sharper model.',
      }
    }
    const text = kind === 'pdf' ? await readPdf(file) : kind === 'docx' ? await readDocx(file) : post(await file.text())
    if (!text) {
      return { name: file.name, kind, text: '', chars: 0, note: 'No readable text found in that file.' }
    }
    return { name: file.name, kind, text, chars: text.length }
  } catch (error) {
    return {
      name: file.name,
      kind,
      text: '',
      chars: 0,
      note: `Could not read that file in your browser (${error instanceof Error ? error.message : 'unknown error'}). You can paste the key details instead.`,
    }
  }
}
