// Utility: given source text and a "<prefix>NAME = " anchor (e.g.
// "window.WAQF_POSITIONS = " or "var DEFAULT_MARK_MANUAL_ADDITIONS = "),
// extract the balanced literal that follows — object ({...}) or array
// ([...]) — by counting brackets while respecting strings and comments.
// Returns { text, startIndex, endIndex } where startIndex/endIndex are
// offsets into src covering exactly the literal (brackets included).
function extractBalancedLiteral(src, anchor) {
  const anchorIdx = src.indexOf(anchor);
  if (anchorIdx === -1) throw new Error(`Anchor not found: ${anchor}`);
  let i = anchorIdx + anchor.length;
  while (i < src.length && /\s/.test(src[i])) i++;
  const openChar = src[i];
  const closeChar = openChar === '{' ? '}' : openChar === '[' ? ']' : openChar === '(' ? ')' : null;
  if (!closeChar) throw new Error(`Literal after anchor is not an object/array/paren-expr: ${anchor}`);

  const startIndex = i;
  let depth = 0;
  let inLineComment = false;
  let inBlockComment = false;
  let inString = false;
  let stringChar = '';
  for (; i < src.length; i++) {
    const c = src[i];
    const c2 = src[i + 1];
    if (inLineComment) {
      if (c === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (c === '*' && c2 === '/') { inBlockComment = false; i++; }
      continue;
    }
    if (inString) {
      if (c === '\\') { i++; continue; }
      if (c === stringChar) inString = false;
      continue;
    }
    if (c === '/' && c2 === '/') { inLineComment = true; i++; continue; }
    if (c === '/' && c2 === '*') { inBlockComment = true; i++; continue; }
    if (c === '"' || c === "'") { inString = true; stringChar = c; continue; }
    if (c === openChar) depth++;
    if (c === closeChar) {
      depth--;
      if (depth === 0) { i++; break; }
    }
  }
  const endIndex = i;
  return { text: src.slice(startIndex, endIndex), startIndex, endIndex };
}
module.exports = { extractBalancedLiteral };
