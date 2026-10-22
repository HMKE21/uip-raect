import { useEffect, useRef, useState } from 'react';
import { MULTI, fmt, natural, ratV, run, solve, varsIn } from './sciCalcEngine';
import './sciCalc.css';

/* Casio fx-991 style scientific calculator: SHIFT / ALPHA layers, natural (fraction / surd / π) results, S⇔D,
 * Ans, A–F X Y M variables, STO, CALC, SOLVE, ∫ d/dx Σ, nPr nCr, hyp, DRG, history with ▲ ▼. */

const S = (l, ins, extra) => ({ l, ins: ins ?? l, ...extra });
const K = (l, m, s, a, cls = '') => ({ l, m: typeof m === 'string' ? { ins: m } : m, s, a, cls });

const ROWS = [
  { h: 'sm', keys: [
    K('SHIFT', { act: 'shift' }, null, null, 'mod s'), K('ALPHA', { act: 'alpha' }, null, null, 'mod a'),
    K('◀', { act: 'left' }, null, null, 'nav'), K('▲', { act: 'up' }, null, null, 'nav'), K('▼', { act: 'down' }, null, null, 'nav'), K('▶', { act: 'right' }, null, null, 'nav'),
  ] },
  { h: 'md', keys: [
    K('CALC', { act: 'calc' }, S('SOLVE', null, { act: 'solve' }), S('=')),
    K('∫', '∫(', S('d/dx', 'd/dx(')),
    K('x⁻¹', '^(−1)', S('x!', '!')),
    K('logₐ', 'logb(', S('Σ', 'Σ(')),
    K('nPr', 'nPr', S('nCr')),
    K('S⇔D', { act: 'sd' }, null, S('Y')),
  ] },
  { h: 'md', keys: [
    K('√', '√(', S('∛', '∛(')),
    K('x²', '^2', S('x³', '^3')),
    K('xʸ', '^', S('ʸ√', 'root(')),
    K('log', 'log(', S('10ˣ', '10^(')),
    K('ln', 'ln(', S('eˣ', 'e^(')),
    K('(−)', { ins: '−', neg: true }, null, S('A')),
  ] },
  { h: 'md', keys: [
    K('hyp', { act: 'hyp' }, null, S('C')),
    K('sin', { ins: 'sin(', h: 'sinh(' }, S('sin⁻¹', 'sin⁻¹(', { h: 'sinh⁻¹(' }), S('D')),
    K('cos', { ins: 'cos(', h: 'cosh(' }, S('cos⁻¹', 'cos⁻¹(', { h: 'cosh⁻¹(' }), S('E')),
    K('tan', { ins: 'tan(', h: 'tanh(' }, S('tan⁻¹', 'tan⁻¹(', { h: 'tanh⁻¹(' }), S('F')),
    K('(', '('),
    K(')', ')', null, S('X')),
  ] },
  { h: 'md', keys: [
    K('STO', '→'), K(',', ',', null, S('Y')), K('%', '%', null, S('B')), K('π', 'π'), K('e', 'e'),
    K('M+', { act: 'mplus' }, S('M−', null, { act: 'mminus' }), S('M')),
  ] },
  { h: 'lg', w: 6, keys: [
    K('7', '7', null, null, 'num'), K('8', '8', null, null, 'num'), K('9', '9', null, null, 'num'),
    K('DEL', { act: 'del' }, null, null, 'del'), K('AC', { act: 'ac' }, null, null, 'del'),
  ] },
  { h: 'lg', w: 6, keys: [
    K('4', '4', null, null, 'num'), K('5', '5', null, null, 'num'), K('6', '6', null, null, 'num'), K('×', '×', null, null, 'op'), K('÷', '÷', null, null, 'op'),
  ] },
  { h: 'lg', w: 6, keys: [
    K('1', '1', null, null, 'num'), K('2', '2', null, null, 'num'), K('3', '3', null, null, 'num'), K('+', '+', null, null, 'op'), K('−', '−', null, null, 'op'),
  ] },
  { h: 'lg', w: 6, keys: [
    K('0', '0', S('Ran#'), null, 'num'), K('.', '.', null, null, 'num'), K('×10ˣ', '×10^', null, null, 'op'),
    K('Ans', 'Ans', S('DRG▸', null, { act: 'drg' }), null, 'op'), K('=', { act: 'eq' }, null, null, 'eq'),
  ] },
];

const CONT = /^([+−×÷^!%→]|nPr|nCr)/;
const pretty = (t) => t.replace(/\^\(−1\)/g, '⁻¹').replace(/\^2(?!\d)/g, '²').replace(/\^3(?!\d)/g, '³');
const ANG = { D: 'DEG', R: 'RAD', G: 'GRA' };

function Dec({ s }) {
  const [m, e] = s.split('×10^');
  return e === undefined ? s : <>{m}×10<sup>{e}</sup></>;
}
const Rad = ({ k }) => <span className="sc-rad"><i>√</i><b>{k}</b></span>;
function TermView({ t, first }) {
  const one = t.k === 1 && t.p === 0;
  const a = Math.abs(t.c);
  return (
    <>
      {t.c < 0 ? '−' : first ? '' : '+'}
      {(a !== 1 || one) && a}{t.p ? 'π' : ''}{t.k > 1 && <Rad k={t.k} />}
    </>
  );
}
function Value({ v, dec }) {
  const n = !dec && v.ex ? natural(v.ex) : null;
  if (!n) return <Dec s={fmt(v.f)} />;
  const top = n.terms.map((t, i) => <TermView key={i} t={t} first={i === 0} />);
  return (
    <>
      {n.neg && '−'}
      {n.den === 1 ? top : <span className="sc-frac"><span>{top}</span><span>{n.den}</span></span>}
    </>
  );
}

export default function SciCalc({ tt }) {
  const [text, setText] = useState(''); const [pos, setPos] = useState(0);
  const [res, setRes] = useState(null); const [done, setDone] = useState(false);
  const [shift, setShift] = useState(false); const [alpha, setAlpha] = useState(false); const [hyp, setHyp] = useState(false);
  const [ang, setAng] = useState('D'); const [vars, setVars] = useState({}); const [ans, setAns] = useState(null);
  const [hist, setHist] = useState([]); const [hidx, setHidx] = useState(-1); const [dec, setDec] = useState(false);
  const [pm, setPm] = useState(null);
  const root = useRef(null); const caret = useRef(null);

  useEffect(() => { caret.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, [text, pos]);
  useEffect(() => { root.current?.focus(); }, []);

  const env = (over = {}) => ({ vars: { ...vars, ...over }, ans, ang });
  const err = (e) => { setRes({ err: ['Math ERROR', "Can't Solve"].includes(e.message) ? e.message : e.message === 'Syntax ERROR' ? e.message : 'Math ERROR' }); setDone(true); setPm(null); };
  const finish = (src, v, extra = {}) => {
    setText(src); setPos(src.length); setRes({ v, ...extra }); setDone(true); setAns(v); setDec(false); setHidx(-1);
    setHist((h) => [{ e: src, v }, ...h].slice(0, 30));
  };
  const insert = (ins, spec = {}) => {
    let t = text; let p = pos;
    if (done) {
      if (CONT.test(ins) && !spec.neg) { t = 'Ans'; p = 3; } else { t = ''; p = 0; }
      setDone(false); setRes(null);
    }
    setText(t.slice(0, p) + ins + t.slice(p)); setPos(p + ins.length); setHidx(-1);
  };
  const del = () => {
    let t = text; let p = pos;
    if (done) { setDone(false); setRes(null); p = t.length; }
    if (!p) return;
    const left = t.slice(0, p);
    const m = MULTI.find((x) => left.endsWith(x));
    const n = m ? m.length : 1;
    setText(t.slice(0, p - n) + t.slice(p)); setPos(p - n);
  };
  const ac = () => { setText(''); setPos(0); setRes(null); setDone(false); setPm(null); setHidx(-1); };

  const startPrompt = (kind) => {
    const src = text;
    if (!src) return;
    try {
      const names = kind === 'solve' ? ['X'] : varsIn(src);
      if (!names.length) { equals(); return; }
      setPm({ kind, src, vars: names, i: 0, vals: {} }); setDone(false); setRes(null);
      const cur = vars[names[0]]; setText(cur && cur.f !== 0 ? fmt(cur.f) : ''); setPos(0);
      if (cur && cur.f !== 0) setPos(fmt(cur.f).length);
    } catch (e) { err(e); }
  };
  const pmStep = () => {
    try {
      const v = run(text, env()).v; const name = pm.vars[pm.i]; const vals = { ...pm.vals, [name]: v };
      if (pm.i + 1 < pm.vars.length) {
        const cur = vars[pm.vars[pm.i + 1]];
        const t = cur && cur.f !== 0 ? fmt(cur.f) : '';
        setPm({ ...pm, i: pm.i + 1, vals }); setText(t); setPos(t.length); return;
      }
      if (pm.kind === 'calc') {
        const r = run(pm.src, env(vals)).v;
        setVars((x) => ({ ...x, ...vals })); setPm(null); finish(pm.src, r);
      } else {
        const r = solve(pm.src, env(), v.f);
        setVars((x) => ({ ...x, X: r.v })); setPm(null);
        finish(pm.src, r.v, { label: 'X =', note: `L−R = ${fmt(r.resid)}` });
      }
    } catch (e) { err(e); }
  };
  const equals = () => {
    if (pm) { pmStep(); return; }
    if (!text) return;
    try {
      const { v, store } = run(text, env());
      if (store) setVars((x) => ({ ...x, [store]: v }));
      finish(text, v, store ? { label: `${store} =` } : {});
    } catch (e) { err(e); }
  };
  const mem = (sign) => {
    try {
      const v = done && res?.v ? res.v : run(text, env()).v;
      const cur = vars.M || ratV(0);
      const nv = sign > 0 ? { f: cur.f + v.f, ex: null } : { f: cur.f - v.f, ex: null };
      setVars((x) => ({ ...x, M: nv })); finish(text || 'Ans', v);
    } catch (e) { err(e); }
  };
  const nav = (dir) => {
    if (dir === 'left' || dir === 'right') {
      if (done) { setDone(false); setRes(null); setPos(text.length); if (dir === 'left') return; }
      setPos((p) => Math.max(0, Math.min(text.length, p + (dir === 'left' ? -1 : 1))));
      return;
    }
    const i = Math.max(-1, Math.min(hist.length - 1, hidx + (dir === 'up' ? 1 : -1)));
    if (!hist.length) return;
    setHidx(i); setDone(false); setRes(null);
    const t = i < 0 ? '' : hist[i].e; setText(t); setPos(t.length);
  };

  const press = (def) => {
    const layer = shift ? 's' : alpha ? 'a' : 'm';
    const spec = def[layer];
    setShift(false); setAlpha(false);
    const act = spec?.act;
    if (def.m.act === 'shift' && layer !== 'm') return;
    if (def.m.act === 'shift') { setShift(true); return; }
    if (def.m.act === 'alpha') { setAlpha(true); return; }
    if (!spec) return;
    if (def.m.act === 'hyp' && layer === 'm') { setHyp((h) => !h); return; }
    if (act) {
      ({ left: () => nav('left'), right: () => nav('right'), up: () => nav('up'), down: () => nav('down'), del, ac, eq: equals,
        calc: () => startPrompt('calc'), solve: () => startPrompt('solve'), sd: () => setDec((d) => !d), mplus: () => mem(1), mminus: () => mem(-1),
        drg: () => setAng((a) => ({ D: 'R', R: 'G', G: 'D' }[a])) }[act] || (() => {}))();
      return;
    }
    let ins = spec.ins;
    if (spec.h && hyp) { ins = spec.h; setHyp(false); }
    insert(ins, spec);
  };

  const onKey = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const m = { '*': '×', '/': '÷', '-': '−', Enter: 'EQ', '=': 'EQ', Backspace: 'DEL', Delete: 'AC', Escape: 'AC', ArrowLeft: 'L', ArrowRight: 'R', ArrowUp: 'U', ArrowDown: 'D' };
    const k = m[e.key] || (/^[\d.+()^%!,]$/.test(e.key) ? e.key : null);
    if (!k) { if (e.key === 'p') { e.preventDefault(); insert('π'); } return; }
    e.preventDefault();
    if (k === 'EQ') equals(); else if (k === 'DEL') del(); else if (k === 'AC') ac();
    else if (k === 'L') nav('left'); else if (k === 'R') nav('right'); else if (k === 'U') nav('up'); else if (k === 'D') nav('down');
    else insert(k);
  };

  const prev = !done && !pm && hist[0] && !text ? hist[0] : null;
  return (
    <div className={`sc ${shift ? 'on-s' : ''} ${alpha ? 'on-a' : ''}`} ref={root} tabIndex={0} onKeyDown={onKey} dir="ltr">
      <div className="sc-lcd" aria-live="polite">
        <div className="sc-status">
          <span className={shift ? 'on' : ''}>S</span><span className={alpha ? 'on' : ''}>A</span><span className={hyp ? 'on' : ''}>hyp</span>
          <button type="button" onClick={() => setAng((a) => ({ D: 'R', R: 'G', G: 'D' }[a]))} title="DRG">{ANG[ang]}</button>
          <span className={vars.M && vars.M.f !== 0 ? 'on' : ''}>M</span>
          <span className="on">{pm ? (pm.kind === 'calc' ? 'CALC' : 'SOLVE') : 'Math'}</span>
        </div>
        <div className="sc-prev">{prev ? <>{pretty(prev.e)} = <Value v={prev.v} dec={false} /></> : ''}</div>
        <div className="sc-in" aria-label={tt('Expression', 'العملية')}>
          {pm && <b className="sc-ask">{pm.vars[pm.i]} =</b>}
          <span>{pretty(text.slice(0, pos))}</span><i className="sc-caret" ref={caret} /><span>{pretty(text.slice(pos))}</span>
        </div>
        <div className="sc-out">
          {res?.err ? <b className="sc-err">{res.err}</b> : res?.v ? <>{res.label && <em>{res.label}</em>}<Value v={res.v} dec={dec} /></> : <span className="sc-zero">{text ? '' : '0'}</span>}
        </div>
        {res?.note && <div className="sc-note">{res.note}</div>}
      </div>
      <div className="sc-keys">
        {ROWS.map((row, ri) => row.keys.map((k, ki) => (
          <button key={`${ri}-${ki}`} type="button" className={`sc-k h-${row.h} ${k.cls}`} style={{ gridColumn: `span ${row.w || 5}` }}
            onClick={() => { press(k); root.current?.focus(); }} aria-label={k.l}>
            {k.s?.l && <i className="s">{k.s.l}</i>}{k.a?.l && <i className="a">{k.a.l}</i>}
            <span>{k.l}</span>
          </button>
        )))}
      </div>
    </div>
  );
}
