/** Colour themes for the ZIP workbench: one palette drives both the UI chrome (CSS variables) and the code editor. */
import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

// ui  -> chrome colours (become --zb-* CSS variables)
// ed  -> editor + syntax colours
export const THEMES = [
  {
    id: 'dark', name: 'Dark+', hint: 'Classic', dark: true,
    ui: {
      bg: '#1e1e1e', side: '#252526', bar: '#2b2b2c', tabs: '#252526', line: '#3a3a3c', text: '#d4d4d4', strong: '#ffffff', muted: '#8b949e',
      accent: '#3794ff', accentSoft: 'rgba(55,148,255,.2)', primary: '#0e639c', primaryH: '#1177bb', onPrimary: '#ffffff',
      status: '#0a64b0', statusFg: '#ffffff', hover: 'rgba(255,255,255,.07)', sel: '#37373d', input: '#3c3c3c', btn: '#3a3d41', btnH: '#45494e',
      modified: '#e2c08d', added: '#73c991', folder: '#dcb67a', danger: '#e5534b', warn: '#d7ba7d', menu: '#2d2d30',
      shadow: 'rgba(0,0,0,.55)', scrim: 'rgba(0,0,0,.45)', mark: 'rgba(234,92,0,.45)', chk1: '#262626', chk2: '#202020',
    },
    ed: {
      bg: '#1e1e1e', fg: '#d4d4d4', cursor: '#aeafad', selection: '#264f78', line: 'rgba(255,255,255,.05)', gutter: '#6e7681', match: 'rgba(255,255,255,.12)',
      find: 'rgba(234,92,0,.33)', findSel: 'rgba(234,92,0,.6)',
      keyword: '#569cd6', control: '#c586c0', string: '#ce9178', number: '#b5cea8', comment: '#6a9955', fn: '#dcdcaa', variable: '#9cdcfe', prop: '#9cdcfe', type: '#4ec9b0', tag: '#569cd6', attr: '#9cdcfe', op: '#d4d4d4', meta: '#c586c0', invalid: '#f44747',
    },
  },
  {
    id: 'midnight', name: 'Midnight', hint: 'Deep indigo', dark: true,
    ui: {
      bg: '#1a1b26', side: '#16161e', bar: '#13131b', tabs: '#16161e', line: '#262a3f', text: '#c0caf5', strong: '#ffffff', muted: '#6b74a3',
      accent: '#7aa2f7', accentSoft: 'rgba(122,162,247,.18)', primary: '#3d59a1', primaryH: '#4a69bd', onPrimary: '#ffffff',
      status: '#3d59a1', statusFg: '#e6ebff', hover: 'rgba(122,162,247,.09)', sel: '#292e42', input: '#232536', btn: '#232536', btnH: '#2d3150',
      modified: '#e0af68', added: '#9ece6a', folder: '#7aa2f7', danger: '#f7768e', warn: '#e0af68', menu: '#1f2030',
      shadow: 'rgba(5,6,15,.7)', scrim: 'rgba(5,6,15,.55)', mark: 'rgba(255,158,100,.4)', chk1: '#1f2133', chk2: '#191a29',
    },
    ed: {
      bg: '#1a1b26', fg: '#c0caf5', cursor: '#c0caf5', selection: '#2f3b64', line: 'rgba(122,162,247,.07)', gutter: '#4b5173', match: 'rgba(122,162,247,.2)',
      find: 'rgba(255,158,100,.3)', findSel: 'rgba(255,158,100,.55)',
      keyword: '#bb9af7', control: '#bb9af7', string: '#9ece6a', number: '#ff9e64', comment: '#565f89', fn: '#7aa2f7', variable: '#c0caf5', prop: '#73daca', type: '#2ac3de', tag: '#f7768e', attr: '#bb9af7', op: '#89ddff', meta: '#7dcfff', invalid: '#f7768e',
    },
  },
  {
    id: 'dracula', name: 'Dracula', hint: 'Vivid purple', dark: true,
    ui: {
      bg: '#282a36', side: '#21222c', bar: '#191a21', tabs: '#21222c', line: '#3a3d4f', text: '#f8f8f2', strong: '#ffffff', muted: '#7a86b6',
      accent: '#bd93f9', accentSoft: 'rgba(189,147,249,.2)', primary: '#7c4dd4', primaryH: '#9163e6', onPrimary: '#ffffff',
      status: '#6d44bb', statusFg: '#ffffff', hover: 'rgba(248,248,242,.07)', sel: '#44475a', input: '#343746', btn: '#343746', btnH: '#44475a',
      modified: '#f1fa8c', added: '#50fa7b', folder: '#ffb86c', danger: '#ff5555', warn: '#f1fa8c', menu: '#2c2e3b',
      shadow: 'rgba(0,0,0,.6)', scrim: 'rgba(10,10,20,.55)', mark: 'rgba(255,184,108,.4)', chk1: '#2d2f3d', chk2: '#252733',
    },
    ed: {
      bg: '#282a36', fg: '#f8f8f2', cursor: '#f8f8f0', selection: '#44475a', line: 'rgba(255,255,255,.05)', gutter: '#6272a4', match: 'rgba(255,255,255,.14)',
      find: 'rgba(255,184,108,.3)', findSel: 'rgba(255,184,108,.55)',
      keyword: '#ff79c6', control: '#ff79c6', string: '#f1fa8c', number: '#bd93f9', comment: '#6272a4', fn: '#50fa7b', variable: '#f8f8f2', prop: '#8be9fd', type: '#8be9fd', tag: '#ff79c6', attr: '#50fa7b', op: '#ff79c6', meta: '#ffb86c', invalid: '#ff5555',
    },
  },
  {
    id: 'emerald', name: 'Emerald', hint: 'Dark green', dark: true,
    ui: {
      bg: '#0f1a17', side: '#0b1412', bar: '#08100e', tabs: '#0b1412', line: '#1c3a31', text: '#d1e7dd', strong: '#ffffff', muted: '#6c9a88',
      accent: '#34d399', accentSoft: 'rgba(52,211,153,.18)', primary: '#0f8a65', primaryH: '#12a578', onPrimary: '#ffffff',
      status: '#0b6b52', statusFg: '#e6fff5', hover: 'rgba(52,211,153,.08)', sel: '#17332b', input: '#152923', btn: '#152923', btnH: '#1d3a31',
      modified: '#fcd34d', added: '#34d399', folder: '#5eead4', danger: '#fb7185', warn: '#fcd34d', menu: '#10201b',
      shadow: 'rgba(0,8,5,.7)', scrim: 'rgba(0,8,5,.55)', mark: 'rgba(251,146,60,.4)', chk1: '#13211d', chk2: '#0e1a16',
    },
    ed: {
      bg: '#0f1a17', fg: '#d1e7dd', cursor: '#34d399', selection: '#1f4a3c', line: 'rgba(52,211,153,.06)', gutter: '#47705f', match: 'rgba(52,211,153,.2)',
      find: 'rgba(251,146,60,.3)', findSel: 'rgba(251,146,60,.55)',
      keyword: '#5eead4', control: '#5eead4', string: '#fcd34d', number: '#fb923c', comment: '#5f8374', fn: '#34d399', variable: '#d1e7dd', prop: '#bef264', type: '#67e8f9', tag: '#f472b6', attr: '#a7f3d0', op: '#86efac', meta: '#c4b5fd', invalid: '#fb7185',
    },
  },
  {
    id: 'nord', name: 'Nord', hint: 'Arctic blue', dark: true,
    ui: {
      bg: '#2e3440', side: '#2a303b', bar: '#242933', tabs: '#2a303b', line: '#3b4252', text: '#d8dee9', strong: '#eceff4', muted: '#7f8ba3',
      accent: '#88c0d0', accentSoft: 'rgba(136,192,208,.2)', primary: '#4c7a99', primaryH: '#5e8fb0', onPrimary: '#ffffff',
      status: '#4a6f8f', statusFg: '#eceff4', hover: 'rgba(216,222,233,.07)', sel: '#3b4252', input: '#3b4252', btn: '#3b4252', btnH: '#434c5e',
      modified: '#ebcb8b', added: '#a3be8c', folder: '#ebcb8b', danger: '#bf616a', warn: '#ebcb8b', menu: '#2e3440',
      shadow: 'rgba(0,0,0,.5)', scrim: 'rgba(15,18,25,.5)', mark: 'rgba(208,135,112,.45)', chk1: '#323945', chk2: '#2a303b',
    },
    ed: {
      bg: '#2e3440', fg: '#d8dee9', cursor: '#d8dee9', selection: '#434c5e', line: 'rgba(216,222,233,.05)', gutter: '#616e88', match: 'rgba(136,192,208,.22)',
      find: 'rgba(208,135,112,.35)', findSel: 'rgba(208,135,112,.6)',
      keyword: '#81a1c1', control: '#81a1c1', string: '#a3be8c', number: '#b48ead', comment: '#616e88', fn: '#88c0d0', variable: '#d8dee9', prop: '#8fbcbb', type: '#8fbcbb', tag: '#81a1c1', attr: '#8fbcbb', op: '#81a1c1', meta: '#d08770', invalid: '#bf616a',
    },
  },
  {
    id: 'light', name: 'Light', hint: 'Clean & bright', dark: false,
    ui: {
      bg: '#ffffff', side: '#f6f8fa', bar: '#eef1f5', tabs: '#eaeef2', line: '#d0d7de', text: '#1f2328', strong: '#0b0f14', muted: '#656d76',
      accent: '#0969da', accentSoft: 'rgba(9,105,218,.12)', primary: '#0969da', primaryH: '#0a58b8', onPrimary: '#ffffff',
      status: '#0969da', statusFg: '#ffffff', hover: 'rgba(31,35,40,.06)', sel: '#ddf4ff', input: '#ffffff', btn: '#f3f4f6', btnH: '#e7eaee',
      modified: '#9a6700', added: '#1a7f37', folder: '#b7791f', danger: '#cf222e', warn: '#9a6700', menu: '#ffffff',
      shadow: 'rgba(31,35,40,.22)', scrim: 'rgba(31,35,40,.35)', mark: 'rgba(255,200,60,.55)', chk1: '#f1f3f5', chk2: '#e9ecef',
    },
    ed: {
      bg: '#ffffff', fg: '#1f2328', cursor: '#0969da', selection: '#b6e3ff', line: 'rgba(9,105,218,.06)', gutter: '#8c959f', match: 'rgba(9,105,218,.14)',
      find: 'rgba(255,200,60,.45)', findSel: 'rgba(255,170,0,.65)',
      keyword: '#cf222e', control: '#cf222e', string: '#0a3069', number: '#0550ae', comment: '#6e7781', fn: '#8250df', variable: '#953800', prop: '#0550ae', type: '#0550ae', tag: '#116329', attr: '#0550ae', op: '#1f2328', meta: '#953800', invalid: '#cf222e',
    },
  },
];

export const DEFAULT_THEME = 'dark';
export const themeById = (id) => THEMES.find((x) => x.id === id) || THEMES[0];

const kebab = (s) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** CSS variables for the .zb root: { '--zb-bg': '#…', … } */
export function themeVars(id) {
  const th = themeById(id);
  const out = { colorScheme: th.dark ? 'dark' : 'light' };
  Object.entries(th.ui).forEach(([k, v]) => { out[`--zb-${kebab(k)}`] = v; });
  return out;
}

/** CodeMirror extensions (UI theme + syntax highlighting) for a theme id. */
export function buildEditorTheme(id) {
  const th = themeById(id);
  const { ed: e, ui: u } = th;
  const view = EditorView.theme({
    '&': { color: e.fg, backgroundColor: e.bg },
    '.cm-content': { caretColor: e.cursor },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: e.cursor },
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': { backgroundColor: e.selection },
    '.cm-activeLine': { backgroundColor: e.line },
    '.cm-gutters': { backgroundColor: e.bg, color: e.gutter, border: 'none' },
    '.cm-activeLineGutter': { backgroundColor: e.line, color: e.fg },
    '.cm-selectionMatch': { backgroundColor: e.match },
    '.cm-searchMatch': { backgroundColor: e.find, borderRadius: '2px' },
    '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: e.findSel },
    '&.cm-focused .cm-matchingBracket': { backgroundColor: e.match, outline: `1px solid ${u.accent}` },
    '&.cm-focused .cm-nonmatchingBracket': { backgroundColor: 'transparent', outline: `1px solid ${u.danger}` },
    '.cm-foldPlaceholder': { backgroundColor: u.btn, color: u.muted, border: `1px solid ${u.line}` },
    '.cm-panels': { backgroundColor: u.side, color: u.text },
    '.cm-panels.cm-panels-top': { borderBottom: `1px solid ${u.line}` },
    '.cm-panels.cm-panels-bottom': { borderTop: `1px solid ${u.line}` },
    '.cm-panel.cm-search input, .cm-panel.cm-search .cm-textfield': { backgroundColor: u.input, color: u.text, border: `1px solid ${u.line}`, borderRadius: '4px' },
    '.cm-panel.cm-search .cm-button': { backgroundImage: 'none', backgroundColor: u.btn, color: u.text, border: `1px solid ${u.line}`, borderRadius: '4px' },
    '.cm-panel.cm-search label': { color: u.muted },
    '.cm-tooltip': { backgroundColor: u.menu, border: `1px solid ${u.line}`, color: u.text },
  }, { dark: th.dark });

  const hl = HighlightStyle.define([
    { tag: [t.keyword, t.modifier, t.operatorKeyword, t.definitionKeyword, t.moduleKeyword], color: e.keyword },
    { tag: [t.controlKeyword, t.self], color: e.control },
    { tag: [t.string, t.regexp, t.special(t.string), t.inserted], color: e.string },
    { tag: [t.number, t.bool, t.null, t.atom, t.unit, t.color], color: e.number },
    { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: e.comment, fontStyle: 'italic' },
    { tag: [t.function(t.variableName), t.function(t.propertyName), t.macroName], color: e.fn },
    { tag: [t.variableName, t.name, t.labelName], color: e.variable },
    { tag: [t.propertyName, t.definition(t.propertyName)], color: e.prop },
    { tag: [t.typeName, t.className, t.namespace, t.standard(t.name)], color: e.type },
    { tag: [t.tagName, t.angleBracket], color: e.tag },
    { tag: [t.attributeName], color: e.attr },
    { tag: [t.operator, t.punctuation, t.separator, t.bracket], color: e.op },
    { tag: [t.meta, t.processingInstruction, t.annotation, t.deleted], color: e.meta },
    { tag: t.heading, color: e.keyword, fontWeight: 'bold' },
    { tag: t.strong, fontWeight: 'bold' },
    { tag: t.emphasis, fontStyle: 'italic' },
    { tag: t.link, color: e.fn, textDecoration: 'underline' },
    { tag: t.invalid, color: e.invalid },
  ]);
  return [view, syntaxHighlighting(hl)];
}
