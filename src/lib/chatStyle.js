/** Chat message look: 'light' (default, tinted bubbles) or 'soft' (solid brand bubbles). Stored per device. */
const KEY = 'uip_msg_style';
export function getChatStyle() {
  try { return localStorage.getItem(KEY) === 'soft' ? 'soft' : 'light'; } catch { return 'light'; }
}
export function applyChatStyle(style = getChatStyle()) {
  if (style === 'soft') document.documentElement.setAttribute('data-msg-style', 'soft');
  else document.documentElement.removeAttribute('data-msg-style');
}
export function setChatStyle(style) {
  try { localStorage.setItem(KEY, style === 'soft' ? 'soft' : 'light'); } catch { /* storage blocked */ }
  applyChatStyle(style);
}
