/** Helpers for the ZIP workbench (tree building, file kinds, language labels). */

export const extOf = (path) => {
  const base = String(path).split('/').pop();
  const i = base.lastIndexOf('.');
  return i > 0 ? base.slice(i + 1).toLowerCase() : (base.startsWith('.') ? base.slice(1).toLowerCase() : '');
};
export const baseName = (path) => String(path).replace(/\/+$/, '').split('/').pop();
export const dirName = (path) => { const p = String(path).replace(/\/+$/, '').split('/'); p.pop(); return p.join('/'); };

export const IMAGE_MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', ico: 'image/x-icon', avif: 'image/avif' };
const BINARY_EXT = new Set(['zip', 'rar', '7z', 'gz', 'tar', 'jar', 'war', 'exe', 'dll', 'so', 'class', 'bin', 'dat', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'mp3', 'mp4', 'mov', 'avi', 'mkv', 'webm', 'wav', 'woff', 'woff2', 'ttf', 'otf', 'eot', 'sqlite', 'db', 'psd', 'iso', 'pyc']);
// already-compressed formats are stored (level 0) when re-zipping
export const STORE_EXT = new Set(['zip', 'rar', '7z', 'gz', 'jar', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'mp3', 'mp4', 'mov', 'mkv', 'webm', 'pdf', 'docx', 'xlsx', 'pptx', 'woff', 'woff2']);

export const MAX_EDIT_BYTES = 3 * 1024 * 1024;

export function isBinary(path, bytes) {
  const e = extOf(path);
  if (IMAGE_MIME[e] && e !== 'svg') return true;
  if (BINARY_EXT.has(e)) return true;
  const n = Math.min(bytes.length, 8000);
  for (let i = 0; i < n; i += 1) if (bytes[i] === 0) return true;
  return false;
}

// Accent per language, shown on the tiny file badges in the explorer.
const BADGES = {
  js: ['JS', '#f1c40f'], jsx: ['JSX', '#61dafb'], ts: ['TS', '#3b82f6'], tsx: ['TSX', '#3b82f6'], mjs: ['JS', '#f1c40f'], cjs: ['JS', '#f1c40f'],
  php: ['PHP', '#8892bf'], py: ['PY', '#4b8bbe'], java: ['JV', '#e76f00'], kt: ['KT', '#a97bff'], cs: ['C#', '#8e44ad'], c: ['C', '#5b9bd5'], h: ['H', '#5b9bd5'], cpp: ['C++', '#5b9bd5'], rs: ['RS', '#dea584'], lua: ['LUA', '#000080'], pl: ['PL', '#39457e'], r: ['R', '#276dc3'], jl: ['JL', '#9558b2'], hs: ['HS', '#5e5086'], f90: ['F90', '#734f96'], pas: ['PAS', '#e3a51f'], go: ['GO', '#00add8'], rb: ['RB', '#cc342d'], swift: ['SW', '#f05138'], dart: ['DT', '#00b4ab'],
  html: ['<>', '#e34c26'], htm: ['<>', '#e34c26'], vue: ['V', '#42b883'], css: ['#', '#2965f1'], scss: ['S', '#cd6799'], less: ['L', '#1d365d'],
  json: ['{}', '#cbcb41'], xml: ['<>', '#ff9800'], yml: ['Y', '#cb171e'], yaml: ['Y', '#cb171e'], toml: ['T', '#9c4221'], ini: ['⚙', '#9aa4b6'], env: ['⚙', '#9aa4b6'],
  md: ['M↓', '#519aba'], txt: ['TXT', '#9aa4b6'], log: ['LOG', '#9aa4b6'], sql: ['SQL', '#e38c00'], sh: ['SH', '#89e051'], bat: ['BAT', '#89e051'], csv: ['CSV', '#16a34a'],
  png: ['IMG', '#a78bfa'], jpg: ['IMG', '#a78bfa'], jpeg: ['IMG', '#a78bfa'], gif: ['IMG', '#a78bfa'], svg: ['SVG', '#ffb13b'], webp: ['IMG', '#a78bfa'], ico: ['IMG', '#a78bfa'],
  zip: ['ZIP', '#d4a017'], rar: ['ZIP', '#d4a017'], pdf: ['PDF', '#e5484d'], lock: ['🔒', '#9aa4b6'], gitignore: ['GIT', '#f05133'],
};
export const badgeOf = (path) => BADGES[extOf(path)] || ['•', '#9aa4b6'];

const LANG_NAMES = {
  js: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript', jsx: 'JavaScript React', ts: 'TypeScript', tsx: 'TypeScript React', json: 'JSON', html: 'HTML', htm: 'HTML', vue: 'Vue', css: 'CSS', scss: 'SCSS', less: 'Less',
  php: 'PHP', py: 'Python', java: 'Java', kt: 'Kotlin', cs: 'C#', c: 'C', h: 'C', cpp: 'C++', hpp: 'C++', cc: 'C++', rs: 'Rust', go: 'Go', rb: 'Ruby', swift: 'Swift', dart: 'Dart', lua: 'Lua', pl: 'Perl', r: 'R', jl: 'Julia', hs: 'Haskell', f90: 'Fortran', pas: 'Pascal', bash: 'Shell',
  md: 'Markdown', xml: 'XML', svg: 'SVG', yml: 'YAML', yaml: 'YAML', toml: 'TOML', ini: 'INI', sql: 'SQL', sh: 'Shell', bat: 'Batch', csv: 'CSV', txt: 'Plain Text', log: 'Log',
};
export const languageName = (path) => LANG_NAMES[extOf(path)] || 'Plain Text';

export function fmtBytes(n) {
  const b = Number(n) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(b < 10240 ? 1 : 0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

/** Flat paths -> nested tree. Files and folders sorted folders-first, A→Z. */
export function buildTree(paths) {
  const root = { name: '', path: '', dir: true, children: new Map() };
  paths.forEach((p) => {
    const isDir = p.endsWith('/');
    const parts = p.split('/').filter(Boolean);
    let node = root;
    parts.forEach((part, i) => {
      const last = i === parts.length - 1;
      const path = parts.slice(0, i + 1).join('/') + (last && !isDir ? '' : '/');
      if (!node.children.has(part)) node.children.set(part, { name: part, path, dir: !last || isDir, children: new Map() });
      node = node.children.get(part);
    });
  });
  const sort = (n) => {
    n.list = [...n.children.values()].sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }) : a.dir ? -1 : 1));
    n.list.forEach(sort);
  };
  sort(root);
  return root;
}
