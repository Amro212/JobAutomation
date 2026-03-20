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

export function escapeLatex(value: string): string {
  return value.replace(/[\\{}%$#_&~^]/g, (match) => LATEX_ESCAPE_MAP[match] ?? match);
}
