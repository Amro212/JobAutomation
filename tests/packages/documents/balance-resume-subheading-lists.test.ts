import { describe, expect, test } from 'vitest';

import { balanceResumeSubHeadingLists } from '../../../packages/documents/src/tailoring/balance-resume-subheading-lists';

describe('balanceResumeSubHeadingLists', () => {
  test('appends missing \\resumeSubHeadingListEnd before \\end{document}', () => {
    const broken = [
      '\\begin{document}',
      '\\section{Projects}',
      '  \\resumeSubHeadingListStart',
      '    \\resumeItem{One}',
      '  \\resumeItemListEnd',
      '% missing closing subheading list',
      '\\end{document}'
    ].join('\n');

    const { tex, repaired, appendedEnds } = balanceResumeSubHeadingLists(broken);

    expect(repaired).toBe(true);
    expect(appendedEnds).toBe(1);
    expect(tex).toContain('\\resumeSubHeadingListEnd');
    expect(tex.indexOf('\\resumeSubHeadingListEnd')).toBeLessThan(tex.indexOf('\\end{document}'));
  });

  test('no-ops when counts already match', () => {
    const ok = [
      '\\begin{document}',
      '  \\resumeSubHeadingListStart',
      '    \\resumeItem{x}',
      '  \\resumeItemListEnd',
      '  \\resumeSubHeadingListEnd',
      '\\end{document}'
    ].join('\n');

    const { tex, repaired, appendedEnds } = balanceResumeSubHeadingLists(ok);

    expect(repaired).toBe(false);
    expect(appendedEnds).toBe(0);
    expect(tex).toBe(ok);
  });

  test('ignores preamble newcommand and commented template ends (sb2nov-style)', () => {
    const broken = [
      '\\newcommand{\\resumeSubHeadingListStart}{\\begin{itemize}}',
      '\\newcommand{\\resumeSubHeadingListEnd}{\\end{itemize}}',
      '\\begin{document}',
      '\\section{Experience}',
      '  \\resumeSubHeadingListStart',
      '    \\resumeItem{x}',
      '  \\resumeItemListEnd',
      '%    \\resumeSubHeadingListEnd',
      '  \\resumeSubHeadingListEnd',
      '\\section{Projects}',
      '  \\resumeSubHeadingListStart',
      '    \\resumeItem{p}',
      '  \\resumeItemListEnd',
      '\\end{document}'
    ].join('\n');

    const { tex, repaired, appendedEnds } = balanceResumeSubHeadingLists(broken);

    expect(repaired).toBe(true);
    expect(appendedEnds).toBe(1);
    expect(tex.indexOf('\\end{document}')).toBeGreaterThan(
      tex.lastIndexOf('\\resumeSubHeadingListEnd')
    );
  });
});
