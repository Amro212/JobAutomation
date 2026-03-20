import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const args = process.argv.slice(2);
let outDir = '';
let texPath = '';

for (let index = 0; index < args.length; index += 1) {
  const value = args[index];

  if (value === '--outdir') {
    outDir = args[index + 1] ?? '';
    index += 1;
    continue;
  }

  if (value.endsWith('.tex')) {
    texPath = value;
  }
}

if (!outDir || !texPath) {
  console.error('Missing outdir or texPath.');
  process.exit(1);
}

function escapePdfText(value) {
  return value.replace(/[\\()]/g, (match) => `\\${match}`);
}

function buildMinimalPdf(text) {
  const lineBreak = '\r\n';
  const header = `%PDF-1.4${lineBreak}%âãÏÓ${lineBreak}`;
  const content = `BT /F1 24 Tf 72 720 Td (${escapePdfText(text)}) Tj ET${lineBreak}`;
  const contentLength = Buffer.byteLength(content, 'utf8');
  const objects = [
    `1 0 obj${lineBreak}<< /Type /Catalog /Pages 2 0 R >>${lineBreak}endobj${lineBreak}`,
    `2 0 obj${lineBreak}<< /Type /Pages /Kids [3 0 R] /Count 1 >>${lineBreak}endobj${lineBreak}`,
    `3 0 obj${lineBreak}<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>${lineBreak}endobj${lineBreak}`,
    `4 0 obj${lineBreak}<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>${lineBreak}endobj${lineBreak}`,
    `5 0 obj${lineBreak}<< /Length ${contentLength} >>${lineBreak}stream${lineBreak}${content}endstream${lineBreak}endobj${lineBreak}`
  ];

  let body = header;
  const offsets = [0];

  for (const object of objects) {
    offsets.push(Buffer.byteLength(body, 'ascii'));
    body += object;
  }

  const xrefOffset = Buffer.byteLength(body, 'ascii');
  const xrefEntries = [
    `0000000000 65535 f ${lineBreak}`,
    ...offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n ${lineBreak}`)
  ].join('');
  const trailer = [
    `xref${lineBreak}`,
    `0 ${objects.length + 1}${lineBreak}`,
    xrefEntries,
    `trailer${lineBreak}`,
    `<< /Size ${objects.length + 1} /Root 1 0 R >>${lineBreak}`,
    `startxref${lineBreak}`,
    `${xrefOffset}${lineBreak}`,
    '%%EOF'
  ].join('');

  return Buffer.from(body + trailer, 'utf8');
}

mkdirSync(dirname(texPath), { recursive: true });
mkdirSync(outDir, { recursive: true });

const pdfPath = texPath.replace(/\.tex$/i, '.pdf');
writeFileSync(pdfPath, buildMinimalPdf('Stub PDF generated for testing'));

console.log(`stub compiled ${texPath}`);
