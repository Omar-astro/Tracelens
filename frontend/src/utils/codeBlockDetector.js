/**
 * codeBlockDetector.js — Syntactic block detection for Python code.
 *
 * Scans source code for compound statements (for, while, if, elif, else, def,
 * class, try, except, finally, with) and identifies their start and end lines
 * based on Python indentation rules.
 */

export function detectCodeBlocks(code) {
  if (!code || typeof code !== 'string') return [];

  const lines = code.split('\n');
  const blocks = [];

  // Match: optional indent + keyword + header expression + ending colon (with optional inline comment)
  const blockHeaderRegex = /^([ \t]*)(def|class|for|while|if|elif|else|try|except|finally|with)\b(.*):[ \t]*(?:#.*)?$/;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const match = rawLine.match(blockHeaderRegex);
    if (!match) continue;

    const baseIndent = match[1].length;
    const keyword = match[2];
    const rest = match[3].trim();
    const startLine = i + 1;

    // Search forward for the end of the block
    let lastContentLine = startLine;
    for (let j = i + 1; j < lines.length; j++) {
      const nextLine = lines[j];
      const trimmed = nextLine.trim();

      // Empty or comment-only lines might sit inside a block; only advance lastContentLine
      // if non-empty or indented comment
      if (trimmed.length === 0) {
        continue;
      }

      const nextIndent = nextLine.match(/^[ \t]*/)[0].length;
      if (nextIndent > baseIndent) {
        lastContentLine = j + 1;
      } else {
        // Indentation returned to base level or shallower -> block ended
        break;
      }
    }

    const endLine = lastContentLine;

    // Type name & icon
    let typeName = keyword;
    let icon = '📦';
    let label = keyword;

    if (keyword === 'def') {
      typeName = 'function';
      icon = 'ƒ';
      const fnName = rest.match(/^[a-zA-Z_]\w*/);
      label = fnName ? `def ${fnName[0]}()` : 'def fn()';
    } else if (keyword === 'class') {
      typeName = 'class';
      icon = '🏛';
      const clsName = rest.match(/^[a-zA-Z_]\w*/);
      label = clsName ? `class ${clsName[0]}` : 'class';
    } else if (keyword === 'for') {
      typeName = 'for loop';
      icon = '🔁';
      let iterSnippet = rest;
      if (iterSnippet.length > 14) iterSnippet = iterSnippet.slice(0, 12) + '…';
      label = `for ${iterSnippet}`;
    } else if (keyword === 'while') {
      typeName = 'while loop';
      icon = '⟳';
      let condSnippet = rest;
      if (condSnippet.length > 14) condSnippet = condSnippet.slice(0, 12) + '…';
      label = `while ${condSnippet}`;
    } else if (keyword === 'if' || keyword === 'elif') {
      typeName = keyword;
      icon = '🔀';
      let condSnippet = rest;
      if (condSnippet.length > 14) condSnippet = condSnippet.slice(0, 12) + '…';
      label = `${keyword} ${condSnippet}`;
    } else if (keyword === 'else') {
      typeName = 'else';
      icon = '↳';
      label = 'else';
    } else if (keyword === 'try' || keyword === 'except' || keyword === 'finally') {
      typeName = keyword;
      icon = '🛡';
      let excSnippet = rest;
      if (excSnippet.length > 14) excSnippet = excSnippet.slice(0, 12) + '…';
      label = excSnippet ? `${keyword} ${excSnippet}` : keyword;
    } else if (keyword === 'with') {
      typeName = 'with block';
      icon = '📎';
      let withSnippet = rest;
      if (withSnippet.length > 14) withSnippet = withSnippet.slice(0, 12) + '…';
      label = `with ${withSnippet}`;
    }

    blocks.push({
      id: `block-${startLine}-${endLine}-${keyword}`,
      keyword,
      type: typeName,
      icon,
      label,
      startLine,
      endLine,
      lineCount: endLine - startLine + 1,
    });
  }

  return blocks;
}
