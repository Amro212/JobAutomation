/**
 * Ensures \\resumeSubHeadingListStart / \\resumeSubHeadingListEnd pairs stay balanced.
 * LLM search/replace edits sometimes drop the closing \\resumeSubHeadingListEnd (e.g. after
 * rewriting the Projects block), which makes Tectonic fail with:
 * "\\begin{itemize} ... ended by \\end{document}".
 *
 * Counting must use only the document body: the preamble contains
 * \\newcommand{\\resumeSubHeadingListStart}{...} which would otherwise look like an extra
 * "start", and commented template lines may contain \\resumeSubHeadingListEnd as a false "end".
 */
function stripFullLineLatexComments(tex: string): string {
  return tex
    .split(/\r?\n/)
    .filter((line) => !/^\s*%/.test(line))
    .join('\n');
}

export function balanceResumeSubHeadingLists(tex: string): {
  tex: string;
  repaired: boolean;
  appendedEnds: number;
} {
  const beginDoc = '\\begin{document}';
  const endDoc = '\\end{document}';
  const b = tex.indexOf(beginDoc);
  const e = tex.lastIndexOf(endDoc);
  if (b === -1 || e === -1 || e <= b) {
    return { tex, repaired: false, appendedEnds: 0 };
  }

  const head = tex.slice(0, b + beginDoc.length);
  const body = tex.slice(b + beginDoc.length, e);
  const foot = tex.slice(e);

  const bodyForCount = stripFullLineLatexComments(body);
  const starts = [...bodyForCount.matchAll(/\\resumeSubHeadingListStart\b/g)].length;
  const ends = [...bodyForCount.matchAll(/\\resumeSubHeadingListEnd\b/g)].length;

  if (starts <= ends) {
    return { tex, repaired: false, appendedEnds: 0 };
  }
  const appendedEnds = starts - ends;
  const insertion = `${'\n  \\resumeSubHeadingListEnd'.repeat(appendedEnds)}\n`;
  return {
    tex: head + body + insertion + foot,
    repaired: true,
    appendedEnds
  };
}
