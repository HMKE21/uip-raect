import { useEffect, useRef } from 'react';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { indentWithTab } from '@codemirror/commands';
import { search, SearchQuery, setSearchQuery } from '@codemirror/search';
import { StreamLanguage } from '@codemirror/language';
import { javascript } from '@codemirror/lang-javascript';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { php } from '@codemirror/lang-php';
import { python } from '@codemirror/lang-python';
import { java } from '@codemirror/lang-java';
import { cpp } from '@codemirror/lang-cpp';
import { markdown } from '@codemirror/lang-markdown';
import { sql } from '@codemirror/lang-sql';
import { xml } from '@codemirror/lang-xml';
import { yaml } from '@codemirror/lang-yaml';
import { rust } from '@codemirror/lang-rust';
import { csharp, kotlin, dart } from '@codemirror/legacy-modes/mode/clike';
import { shell } from '@codemirror/legacy-modes/mode/shell';
import { go } from '@codemirror/legacy-modes/mode/go';
import { ruby } from '@codemirror/legacy-modes/mode/ruby';
import { swift } from '@codemirror/legacy-modes/mode/swift';
import { toml } from '@codemirror/legacy-modes/mode/toml';
import { properties } from '@codemirror/legacy-modes/mode/properties';
import { extOf } from './zipUtils';
import { buildEditorTheme } from './zipThemes';
import { ghostComplete, clearGhostEffect } from './ai/ghostComplete';

function languageFor(path) {
  switch (extOf(path)) {
    case 'js': case 'mjs': case 'cjs': return javascript();
    case 'jsx': return javascript({ jsx: true });
    case 'ts': return javascript({ typescript: true });
    case 'tsx': return javascript({ typescript: true, jsx: true });
    case 'json': return json();
    case 'html': case 'htm': case 'vue': return html();
    case 'css': case 'scss': case 'less': return css();
    case 'php': return php();
    case 'py': return python();
    case 'java': return java();
    case 'c': case 'h': case 'cpp': case 'hpp': case 'cc': return cpp();
    case 'md': return markdown();
    case 'sql': return sql();
    case 'xml': case 'svg': return xml();
    case 'yml': case 'yaml': return yaml();
    case 'rs': return rust();
    case 'cs': return StreamLanguage.define(csharp);
    case 'kt': return StreamLanguage.define(kotlin);
    case 'dart': return StreamLanguage.define(dart);
    case 'sh': case 'bash': return StreamLanguage.define(shell);
    case 'go': return StreamLanguage.define(go);
    case 'rb': return StreamLanguage.define(ruby);
    case 'swift': return StreamLanguage.define(swift);
    case 'toml': return StreamLanguage.define(toml);
    case 'ini': case 'env': return StreamLanguage.define(properties);
    default: return [];
  }
}

/**
 * One CodeMirror view for the whole workbench. Each open file keeps its own EditorState
 * (undo history, selection, scroll) in `statesRef`, swapped in when its tab becomes active.
 */
export default function CodeEditor({ docId, path, initialText, onChange, onCursor, onContext, readOnly, wrap, fontSize, reveal, theme, ghost }) {
  const host = useRef(null);
  const view = useRef(null);
  const states = useRef(new Map());
  const scrolls = useRef(new Map());
  const current = useRef(null);
  const cb = useRef({ onChange, onCursor, onContext });
  cb.current = { onChange, onCursor, onContext };
  // AI autocomplete options ({ enabled, request, onDisable }), read lazily by the extension so a change needs no rebuild
  const ghostRef = useRef(ghost);
  ghostRef.current = ghost;
  const pathRef = useRef(path);
  pathRef.current = path;
  const wrapComp = useRef(new Compartment());
  const roComp = useRef(new Compartment());
  const sizeComp = useRef(new Compartment());
  const themeComp = useRef(new Compartment());

  const makeState = (p, text) => EditorState.create({
    doc: text,
    extensions: [
      basicSetup,
      search({ top: true }),
      ghostComplete(() => {
        const g = ghostRef.current;
        return g && { ...g, meta: () => ({ filename: pathRef.current, language: extOf(pathRef.current) }) };
      }),
      keymap.of([indentWithTab]),
      themeComp.current.of(buildEditorTheme(theme)),
      languageFor(p),
      wrapComp.current.of(wrap ? EditorView.lineWrapping : []),
      roComp.current.of(EditorState.readOnly.of(!!readOnly)),
      sizeComp.current.of(EditorView.theme({ '&': { fontSize: `${fontSize}px` } })),
      // right-click: hands the selection (lines + text) to the workbench, which may show its own menu (return false = native menu)
      EditorView.domEventHandlers({
        contextmenu: (e, v) => {
          const h = cb.current.onContext;
          if (!h) return false;
          const { main } = v.state.selection;
          const doc = v.state.doc;
          const info = { x: e.clientX, y: e.clientY, empty: main.empty };
          if (!main.empty) {
            const endLine = doc.lineAt(main.to);
            info.fromLine = doc.lineAt(main.from).number;
            // a selection that ends at the very start of a line does not include that line
            info.toLine = endLine.from === main.to ? Math.max(info.fromLine, endLine.number - 1) : endLine.number;
            info.text = doc.sliceString(main.from, Math.min(main.to, main.from + 100000));
          }
          if (h(info) === false) return false;
          e.preventDefault();
          return true;
        },
      }),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) cb.current.onChange?.(u.state.doc.toString());
        if (u.selectionSet || u.docChanged) {
          const { main } = u.state.selection;
          const pos = main.head;
          const line = u.state.doc.lineAt(pos);
          // selected lines (1-based; a selection ending at the very start of a line does not include that line) — the AI chat sends them as context
          let sel = null;
          if (!main.empty) {
            const a = u.state.doc.lineAt(main.from);
            const b = u.state.doc.lineAt(main.to);
            sel = { from: a.number, to: b.from === main.to ? Math.max(a.number, b.number - 1) : b.number };
          }
          cb.current.onCursor?.({ line: line.number, col: pos - line.from + 1, sel });
        }
      }),
    ],
  });

  useEffect(() => {
    view.current = new EditorView({ parent: host.current, state: makeState(path, initialText) });
    current.current = docId;
    states.current.set(docId, view.current.state);
    cb.current.onCursor?.({ line: 1, col: 1 });
    return () => { view.current?.destroy(); view.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // switch file
  useEffect(() => {
    const v = view.current;
    if (!v || current.current === docId) return;
    if (current.current) {
      states.current.set(current.current, v.state);
      scrolls.current.set(current.current, v.scrollDOM.scrollTop);
    }
    const next = states.current.get(docId) || makeState(path, initialText);
    v.setState(next);
    // compartments of a stored state may be stale -> re-apply the global toggles
    v.dispatch({ effects: [
      clearGhostEffect,
      wrapComp.current.reconfigure(wrap ? EditorView.lineWrapping : []),
      roComp.current.reconfigure(EditorState.readOnly.of(!!readOnly)),
      sizeComp.current.reconfigure(EditorView.theme({ '&': { fontSize: `${fontSize}px` } })),
      themeComp.current.reconfigure(buildEditorTheme(theme)),
    ] });
    current.current = docId;
    requestAnimationFrame(() => { v.scrollDOM.scrollTop = scrolls.current.get(docId) || 0; });
    const pos = next.selection.main.head;
    const line = next.doc.lineAt(pos);
    cb.current.onCursor?.({ line: line.number, col: pos - line.from + 1, sel: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId]);

  // jump to a "search in files" hit: select it, centre it, and highlight every other hit of the same query
  useEffect(() => {
    const v = view.current;
    if (!v || !reveal || reveal.path !== path || current.current !== docId) return;
    const doc = v.state.doc;
    const ln = doc.line(Math.min(Math.max(1, reveal.line), doc.lines));
    const from = Math.min(ln.from + reveal.col, ln.to);
    const to = Math.min(from + reveal.len, ln.to);
    const sp = reveal.spec;
    const effects = [EditorView.scrollIntoView(from, { y: 'center' })];
    if (sp?.query) effects.push(setSearchQuery.of(new SearchQuery({ search: sp.query, caseSensitive: !!sp.caseSensitive, regexp: !!sp.regex, wholeWord: !!sp.wholeWord })));
    v.dispatch({ selection: { anchor: from, head: to }, effects });
    v.focus();
    // re-assert after the tab-switch scroll restore above (it runs in a rAF)
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (view.current !== v) return;
      const end = Math.min(from, v.state.doc.length);
      v.dispatch({ effects: EditorView.scrollIntoView(end, { y: 'center' }) });
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reveal?.key, docId]);

  // turning the AI autocomplete off removes a suggestion that is still showing
  useEffect(() => { if (!ghost?.enabled) view.current?.dispatch({ effects: clearGhostEffect }); }, [ghost?.enabled]);

  // global toggles
  useEffect(() => { view.current?.dispatch({ effects: themeComp.current.reconfigure(buildEditorTheme(theme)) }); }, [theme]);
  useEffect(() => { view.current?.dispatch({ effects: wrapComp.current.reconfigure(wrap ? EditorView.lineWrapping : []) }); }, [wrap]);
  useEffect(() => { view.current?.dispatch({ effects: roComp.current.reconfigure(EditorState.readOnly.of(!!readOnly)) }); }, [readOnly, docId]);
  useEffect(() => { view.current?.dispatch({ effects: sizeComp.current.reconfigure(EditorView.theme({ '&': { fontSize: `${fontSize}px` } })) }); }, [fontSize]);

  return <div ref={host} className="zb-cm" />;
}
