// Utility: given source text and a "var NAME = {" anchor, extract the
// balanced object-literal text (including any comments/strings inside it)
// by counting braces while respecting strings and comments.
function extractBalancedObject(src, varName) {
  const anchor = `var ${varName} = {`;
  const startIdx = src.indexOf(anchor);
  if (startIdx === -1) throw new Error(`Anchor not found for ${varName}`);
  const braceStart = src.indexOf('{', startIdx);
  let depth = 0;
  let i = braceStart;
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
    if (c === '{') depth++;
    if (c === '}') {
      depth--;
      if (depth === 0) { i++; break; }
    }
  }
  return src.slice(braceStart, i);
}
module.exports = { extractBalancedObject };
