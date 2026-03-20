const LATEX_ESCAPE_MAP: Record<string, string> = {
  '\\': '\\textbackslash{}',
  '{': '\\{',
  '}': '\\}',
  '%': '\\%',
  '$': '\\$',
  '#': '\\#',
  '_': '\\_',
  '&': '\\&',
  '~': '\\textasciitilde{}',
  '^': '\\textasciicircum{}'
};

const UNICODE_NORMALIZE_MAP: Array<[RegExp, string]> = [
  [/\u2014/g, '--'],
  [/\u2013/g, '-'],
  [/[\u2018\u2019\u201A\u02BC]/g, "'"],
  [/[\u201C\u201D\u201E]/g, '"'],
  [/\u2026/g, '...'],
  [/[\u00A0\u2002\u2003\u2009]/g, ' '],
  [/\u2010/g, '-'],
  [/\u2011/g, '-'],
  [/\u2012/g, '-'],
  [/\u00B7/g, '.']
];

function normalizeUnicode(value: string): string {
  let result = value;
  for (const [pattern, replacement] of UNICODE_NORMALIZE_MAP) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

export function escapeLatex(value: string): string {
  const normalized = normalizeUnicode(value);
  return normalized.replace(/[\\{}%$#_&~^]/g, (match) => LATEX_ESCAPE_MAP[match] ?? match);
}
