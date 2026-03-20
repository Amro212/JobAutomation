import { escapeLatex } from './escape-latex';

export type RenderTemplateOptions = {
  rawTokens?: string[];
};

export function renderTemplate(
  template: string,
  tokens: Record<string, string | number | null | undefined>,
  options: RenderTemplateOptions = {}
): string {
  const rawTokens = new Set(options.rawTokens ?? []);

  return template.replace(/\{\{([a-zA-Z0-9_.-]+)\}\}/g, (_match, tokenName: string) => {
    const tokenValue = tokens[tokenName];

    if (tokenValue === undefined || tokenValue === null) {
      return '';
    }

    const stringValue = String(tokenValue);
    return rawTokens.has(tokenName) ? stringValue : escapeLatex(stringValue);
  });
}
