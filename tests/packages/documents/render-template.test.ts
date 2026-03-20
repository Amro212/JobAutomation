import { describe, expect, test } from 'vitest';

import { escapeLatex, renderTemplate } from '../../../packages/documents/src';

describe('renderTemplate', () => {
  test('escapes LaTeX tokens by default and allows raw insertion when requested', () => {
    const rendered = renderTemplate(
      String.raw`\section{ {{title}} } {{raw_block}}`,
      {
        title: 'R&D_50% #1',
        raw_block: String.raw`\textbf{Raw}`
      },
      {
        rawTokens: ['raw_block']
      }
    );

    expect(rendered).toContain(String.raw`\section{ R\&D\_50\% \#1 }`);
    expect(rendered).toContain(String.raw`\textbf{Raw}`);
  });

  test('escapes control characters directly', () => {
    expect(escapeLatex(String.raw`a_b&c%$#~^`)).toBe(
      String.raw`a\_b\&c\%\$\#\textasciitilde{}\textasciicircum{}`
    );
  });
});
