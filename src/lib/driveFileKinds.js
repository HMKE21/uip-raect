/** Which My PC files open in the code editor (text) vs the viewer — shared by the classic page and the desktop windows. */
export const TEXT_EXT = new Set(['txt', 'md', 'log', 'json', 'xml', 'yml', 'yaml', 'toml', 'ini', 'env', 'gitignore', 'csv', 'tsv',
  'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'vue', 'py', 'java', 'c', 'h', 'cpp', 'hpp', 'cc', 'cs', 'php', 'rb', 'go', 'rs', 'kt',
  'swift', 'dart', 'sql', 'sh', 'bat', 'css', 'scss', 'less', 'html', 'htm', 'svg', 'lock', 'gradle', 'properties']);
export const TEXT_NAMES = /^(makefile|dockerfile|procfile|readme|license|changelog|\.gitignore|\.env.*|\.editorconfig)$/i;
export const extOf = (n) => { const s = String(n || ''); const i = s.lastIndexOf('.'); return i >= 0 ? s.slice(i + 1).toLowerCase() : ''; };
export const isTextName = (n) => TEXT_EXT.has(extOf(n)) || TEXT_NAMES.test(String(n || ''));
