import { useEffect, useRef, useState } from 'react';
import EmojiPicker from './EmojiPicker';
import { useLanguage } from '../../context/LanguageContext';
import '../../styles/css/messaging-bio.css';

/**
 * Bio notes: a short line (emoji welcome) shown in a speech bubble hanging under the chat header, pointing at the
 * contact's photo, in the design its owner picked.
 *   BioBubble      – the bubble itself (header, contact info, live preview)
 *   HeaderBio      – the bubble in the chat header; tap it to tuck it away until the bio changes
 *   BioEditor      – text + emoji picker + quick statuses + counter + design picker + live preview + save
 * Style ids must match ChatSettingsService::BIO_STYLES on the server.
 */

export const BIO_STYLES = [
  { id: 'classic', en: 'Classic', ar: 'كلاسيك' },
  { id: 'mint', en: 'Mint', ar: 'نعناع' },
  { id: 'sunset', en: 'Sunset', ar: 'غروب' },
  { id: 'ocean', en: 'Ocean', ar: 'محيط' },
  { id: 'lavender', en: 'Lavender', ar: 'لافندر' },
  { id: 'night', en: 'Night', ar: 'ليل' },
  { id: 'glass', en: 'Glass', ar: 'زجاج' },
  { id: 'spark', en: 'Spark', ar: 'لمعان' },
];
export const bioStyleId = (id) => (BIO_STYLES.some((s) => s.id === id) ? id : 'classic');
const cpLen = (s) => Array.from(s || '').length;

const PRESETS = [
  { en: '📚 Studying', ar: '📚 بذاكر' },
  { en: '🎯 Focused', ar: '🎯 مركّز' },
  { en: '☕ Available', ar: '☕ متاح' },
  { en: '🌙 Busy', ar: '🌙 مشغول' },
  { en: '✈️ Away', ar: '✈️ مسافر' },
  { en: '💻 Coding', ar: '💻 بكتب كود' },
];

const useT = () => {
  const { locale } = useLanguage();
  return (en, ar) => (locale === 'ar' ? ar : en);
};

export function BioBubble({ text, styleId, className = '', tail = true, children, ...rest }) {
  return (
    <div className={`bio-b bio-b--${bioStyleId(styleId)}${tail ? ' has-tail' : ''} ${className}`} {...rest}>
      <span className="bio-b__text" dir="auto">{text}</span>
      {children}
    </div>
  );
}

const sigOf = (text, style) => `${style || 'classic'}|${text}`;
const readDismissed = (key) => { try { return sessionStorage.getItem(key); } catch { return null; } };

export function HeaderBio({ conversationId, text, styleId, own, onEdit }) {
  const t = useT();
  const key = `uip_bio_hide_${conversationId}`;
  const sig = sigOf(text, styleId);
  const [hiddenSig, setHiddenSig] = useState(() => readDismissed(key));
  useEffect(() => { setHiddenSig(readDismissed(key)); }, [key]);
  if (!text || hiddenSig === sig) return null;
  const hide = () => {
    try { sessionStorage.setItem(key, sig); } catch { /* private mode */ }
    setHiddenSig(sig);
  };
  return (
    <div className="bio-hdr" role="note" aria-label={t('Bio', 'البايو')}>
      <BioBubble text={text} styleId={styleId} className="bio-hdr__bubble" onClick={hide} title={t('Tap to hide', 'اضغط للإخفاء')}>
        {own && onEdit ? (
          <button type="button" className="bio-b__edit" onClick={(e) => { e.stopPropagation(); onEdit(); }} aria-label={t('Edit bio', 'تعديل البايو')}>✎</button>
        ) : null}
      </BioBubble>
    </div>
  );
}

export function BioStylePicker({ value, onChange, sample }) {
  const t = useT();
  const { locale } = useLanguage();
  return (
    <div className="bio-picker" role="radiogroup" aria-label={t('Bio design', 'تصميم البايو')}>
      {BIO_STYLES.map((s) => (
        <button key={s.id} type="button" role="radio" aria-checked={value === s.id}
          className={`bio-picker__item${value === s.id ? ' is-on' : ''}`} onClick={() => onChange(s.id)}>
          <BioBubble text={sample} styleId={s.id} className="bio-b--mini" tail={false} />
          <span>{locale === 'ar' ? s.ar : s.en}</span>
        </button>
      ))}
    </div>
  );
}

export function BioEditor({ settings, save }) {
  const t = useT();
  const { locale } = useLanguage();
  const max = settings.bio_max || 190;
  const [text, setText] = useState(settings.bio || '');
  const [style, setStyle] = useState(bioStyleId(settings.bio_style));
  const [emoji, setEmoji] = useState(false);
  const [busy, setBusy] = useState(false);
  const taRef = useRef(null);
  const loaded = useRef({ bio: settings.bio, style: settings.bio_style });

  // the saved bio / design arrive after the first render: adopt them unless the person already edited
  useEffect(() => {
    if (settings.bio !== loaded.current.bio && text === (loaded.current.bio || '')) setText(settings.bio || '');
    if (settings.bio_style !== loaded.current.style && style === bioStyleId(loaded.current.style)) setStyle(bioStyleId(settings.bio_style));
    loaded.current = { bio: settings.bio, style: settings.bio_style };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.bio, settings.bio_style]);

  const dirty = text.trim() !== (settings.bio || '') || style !== bioStyleId(settings.bio_style);
  const len = cpLen(text);
  const onChange = (e) => { const v = e.target.value.replace(/\s*\n+\s*/g, ' '); if (cpLen(v) <= max) setText(v); };
  const insert = (e) => {
    const el = taRef.current;
    const a = el ? el.selectionStart : text.length;
    const b = el ? el.selectionEnd : text.length;
    const next = text.slice(0, a) + e + text.slice(b);
    if (cpLen(next) > max) return;
    setText(next);
    requestAnimationFrame(() => { if (el) { el.focus(); const pos = a + e.length; el.setSelectionRange(pos, pos); } });
  };
  const submit = async () => {
    setBusy(true);
    try { await save({ bio: text.trim(), bio_style: style }); } finally { setBusy(false); }
  };
  const sample = text.trim() || t('Your note shows here ✨', 'ملاحظتك هتظهر هنا ✨');

  return (
    <div className="bio-ed">
      <div className="bio-ed__preview" aria-live="polite">
        <span className="bio-ed__label">{t('Preview', 'معاينة')}</span>
        <BioBubble text={sample} styleId={style} />
      </div>

      <div className="bio-ed__field">
        <textarea ref={taRef} className="msg-input" rows={2} value={text} onChange={onChange}
          placeholder={t('e.g. Software engineering student 🚀 always learning', 'مثال: طالب هندسة برمجيات 🚀 دايمًا بتعلم')} dir="auto" />
        <button type="button" className={`bio-ed__emoji${emoji ? ' is-on' : ''}`} onClick={() => setEmoji((o) => !o)} aria-expanded={emoji} aria-label={t('Emoji', 'إيموجي')}>😊</button>
      </div>
      {emoji && <div className="bio-ed__picker"><EmojiPicker ar={locale === 'ar'} onClose={() => setEmoji(false)} onPick={insert} /></div>}

      <div className="bio-ed__presets">
        {PRESETS.map((p) => (
          <button key={p.en} type="button" className="bio-ed__chip" onClick={() => setText(locale === 'ar' ? p.ar : p.en)}>{locale === 'ar' ? p.ar : p.en}</button>
        ))}
      </div>

      <h4 className="bio-ed__h">{t('Choose a design', 'اختار التصميم')}</h4>
      <BioStylePicker value={style} onChange={setStyle} sample={text.trim() || '✨'} />

      <div className="bio-ed__foot">
        <span className={`cs-count${len >= max ? ' is-max' : ''}`}>{len}/{max}</span>
        {text && <button type="button" className="btn btn-secondary btn-sm" onClick={() => setText('')}>{t('Clear', 'مسح')}</button>}
        <button type="button" className="btn btn-primary btn-sm" disabled={!dirty || busy} onClick={submit}>{busy ? t('Saving…', 'جارٍ الحفظ…') : t('Save', 'حفظ')}</button>
      </div>
    </div>
  );
}
