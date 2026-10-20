import { useCallback, useRef, useState } from 'react';

/** Snapshot history for immutable values: { value, set(v), undo, redo, canUndo, canRedo, dirty, markSaved }. */
export default function useDocHistory(initial) {
  const [state, setState] = useState({ past: [], value: initial, future: [], saved: initial });
  const ref = useRef(state); ref.current = state;
  const set = useCallback((v) => setState((s) => ({ ...s, past: [...s.past.slice(-80), s.value], value: v, future: [] })), []);
  const undo = useCallback(() => setState((s) => (s.past.length ? { ...s, past: s.past.slice(0, -1), value: s.past[s.past.length - 1], future: [s.value, ...s.future] } : s)), []);
  const redo = useCallback(() => setState((s) => (s.future.length ? { ...s, past: [...s.past, s.value], value: s.future[0], future: s.future.slice(1) } : s)), []);
  const markSaved = useCallback(() => setState((s) => ({ ...s, saved: s.value })), []);
  const reset = useCallback((v) => setState({ past: [], value: v, future: [], saved: v }), []);
  return { value: state.value, set, undo, redo, reset, markSaved, canUndo: state.past.length > 0, canRedo: state.future.length > 0, dirty: state.value !== state.saved };
}
