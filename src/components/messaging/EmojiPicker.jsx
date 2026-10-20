import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * WhatsApp-style emoji picker: category tabs, search, "recent" row (remembered in localStorage).
 * `onPick(emoji)` is called for each tap; the parent decides where to insert it.
 */
const CATS = [
  { id: 'smileys', icon: '😀', ar: 'وجوه', en: 'Smileys', list: '😀 😃 😄 😁 😆 😅 😂 🤣 🥲 ☺️ 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😙 😚 😋 😛 😝 😜 🤪 🤨 🧐 🤓 😎 🥸 🤩 🥳 😏 😒 😞 😔 😟 😕 🙁 ☹️ 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤬 🤯 😳 🥵 🥶 😱 😨 😰 😥 😓 🤗 🤔 🫡 🤭 🤫 🤥 😶 😐 😑 😬 🙄 😯 😦 😧 😮 😲 🥱 😴 🤤 😪 😵 🤐 🥴 🤢 🤮 🤧 😷 🤒 🤕 🤑 🤠 😈 👿 👹 💀 ☠️ 👻 👽 🤖 💩' },
  { id: 'people', icon: '👍', ar: 'إيدين وناس', en: 'People', list: '👋 🤚 🖐️ ✋ 🖖 👌 🤌 🤏 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 👐 🤲 🤝 🙏 ✍️ 💅 💪 🦾 🧠 👀 👁️ 👅 👄 👶 🧒 👦 👧 🧑 👨 👩 🧓 👴 👵 🙍 🙎 🙅 🙆 💁 🙋 🧏 🙇 🤦 🤷 👨‍🎓 👩‍🎓 👨‍🏫 👩‍🏫 👨‍💻 👩‍💻 👮 🕵️ 💂 👷 🤴 👸' },
  { id: 'hearts', icon: '❤️', ar: 'قلوب ورموز', en: 'Hearts', list: '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❤️‍🔥 💕 💞 💓 💗 💖 💘 💝 💟 ☮️ ✝️ ☪️ 🕉️ ☯️ ✨ ⭐ 🌟 💫 ⚡ 🔥 💥 💢 💯 ✅ ☑️ ✔️ ❌ ❎ ❗ ❓ ‼️ ⁉️ ⚠️ 🚫 ⛔ 🔔 🔕 📌 📍 🔒 🔓 🔑' },
  { id: 'nature', icon: '🐱', ar: 'حيوانات وطبيعة', en: 'Nature', list: '🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🙈 🙉 🙊 🐔 🐧 🐦 🦅 🦉 🦇 🐺 🐴 🦄 🐝 🦋 🐌 🐞 🐢 🐍 🐙 🦀 🐠 🐬 🐳 🦈 🐘 🦒 🐪 🌵 🌲 🌳 🌴 🌱 🌿 🍀 🍁 🌸 🌹 🌻 🌼 🌞 🌙 🌚 ⭐ ☁️ ⛅ 🌧️ ⛈️ ❄️ 🌈 🔥 💧 🌊' },
  { id: 'food', icon: '🍕', ar: 'أكل وشرب', en: 'Food', list: '🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🥑 🥕 🌽 🥔 🍞 🧀 🥚 🍳 🥞 🥓 🍔 🍟 🌭 🍕 🌮 🌯 🥙 🍝 🍜 🍲 🍣 🍤 🍦 🍩 🍪 🎂 🍰 🍫 🍬 🍭 ☕ 🍵 🥤 🧃 🍺 🍷' },
  { id: 'activity', icon: '⚽', ar: 'أنشطة', en: 'Activity', list: '⚽ 🏀 🏈 ⚾ 🎾 🏐 🏉 🎱 🏓 🏸 🥊 🎯 ⛳ 🎣 🎮 🕹️ 🎲 ♟️ 🧩 🎭 🎨 🎬 🎤 🎧 🎼 🎹 🥁 🎸 🏆 🥇 🥈 🥉 🏅 🎖️ 🎉 🎊 🎁 🎈' },
  { id: 'objects', icon: '💡', ar: 'أشياء', en: 'Objects', list: '📱 💻 🖥️ ⌨️ 🖱️ 💾 📷 📹 🎥 📞 ☎️ 📺 📻 ⏰ ⌛ 🔋 🔌 💡 🔦 📚 📖 📝 ✏️ 🖊️ 📎 📏 📐 ✂️ 🗂️ 📁 📂 🗓️ 📅 📊 📈 📉 💰 💳 💎 🔧 🔨 ⚙️ 🧪 🔬 🔭 💊 🩺 🚀 ✈️ 🚗 🚌 🚲 🏠 🏫 🏥' },
];

// Small bilingual keyword map so search is useful without shipping a full emoji-name dataset.
const KEYWORDS = {
  '😂': 'laugh funny lol ضحك', '🤣': 'laugh rofl ضحك', '😍': 'love heart eyes حب', '🥰': 'love cute حب', '😘': 'kiss بوسة',
  '😢': 'sad cry حزين بكاء', '😭': 'cry sob بكاء', '😡': 'angry mad غضب', '😎': 'cool نظارة', '🤔': 'think hmm تفكير',
  '👍': 'like ok yes تمام اعجاب', '👎': 'dislike no لا', '👏': 'clap bravo تصفيق', '🙏': 'pray thanks please شكرا دعاء', '🙌': 'celebrate raise',
  '❤️': 'heart love قلب حب', '💔': 'broken heart قلب مكسور', '🔥': 'fire hot نار', '🎉': 'party celebrate مبروك احتفال', '✅': 'done check تم',
  '❌': 'no wrong x خطأ', '💯': 'hundred perfect', '😴': 'sleep نوم', '🤝': 'deal handshake اتفاق', '👀': 'eyes look عيون', '💡': 'idea فكرة',
  '🚀': 'rocket launch صاروخ', '📚': 'books study كتب مذاكرة', '📝': 'note write كتابة', '☕': 'coffee قهوة', '🎂': 'cake birthday تورتة', '😅': 'sweat nervous',
  '🥳': 'party birthday', '😮': 'wow surprised', '😱': 'scared shock', '🤯': 'mind blown', '💪': 'strong muscle قوة', '🤷': 'shrug معرفش',
};

const RECENT_KEY = 'uip_emoji_recent';
const readRecent = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]').slice(0, 24); } catch { return []; } };

const ALL = CATS.map((c) => ({ ...c, items: c.list.split(/\s+/).filter(Boolean) }));

export default function EmojiPicker({ onPick, onClose, ar }) {
  const [tab, setTab] = useState('smileys');
  const [q, setQ] = useState('');
  const [recent, setRecent] = useState(readRecent);
  const bodyRef = useRef(null);
  const sectionRefs = useRef({});

  const pick = (e) => {
    onPick(e);
    const next = [e, ...recent.filter((x) => x !== e)].slice(0, 24);
    setRecent(next);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* not remembered */ }
  };

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return null;
    const seen = new Set();
    const out = [];
    ALL.forEach((c) => c.items.forEach((e) => {
      if (seen.has(e)) return;
      const hit = (KEYWORDS[e] || '').toLowerCase().includes(term) || e === term;
      if (hit) { seen.add(e); out.push(e); }
    }));
    return out;
  }, [q]);

  const jump = (id) => {
    setTab(id);
    setQ('');
    requestAnimationFrame(() => sectionRefs.current[id]?.scrollIntoView({ block: 'start' }));
  };

  // highlight the tab of the section currently in view
  useEffect(() => {
    const box = bodyRef.current;
    if (!box || results) return undefined;
    const onScroll = () => {
      let current = ALL[0].id;
      ALL.forEach((c) => {
        const el = sectionRefs.current[c.id];
        if (el && el.offsetTop - box.offsetTop <= box.scrollTop + 8) current = c.id;
      });
      setTab(current);
    };
    box.addEventListener('scroll', onScroll, { passive: true });
    return () => box.removeEventListener('scroll', onScroll);
  }, [results]);

  const grid = (list) => (
    <div className="emo-grid">
      {list.map((e, i) => <button type="button" key={`${e}-${i}`} className="emo-btn" onClick={() => pick(e)}>{e}</button>)}
    </div>
  );

  return (
    <div className="emo-picker" role="dialog" aria-label={ar ? 'اختيار إيموجي' : 'Emoji picker'}>
      <div className="emo-search">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={ar ? 'ابحث عن إيموجي (مثلاً: قلب، ضحك، love)' : 'Search emoji (e.g. love, laugh, قلب)'}
          dir="auto"
        />
        {onClose && <button type="button" className="emo-close" aria-label={ar ? 'إغلاق' : 'Close'} onClick={onClose}>×</button>}
      </div>
      <div className="emo-body" ref={bodyRef}>
        {results ? (
          results.length ? grid(results) : <p className="emo-empty">{ar ? 'مفيش نتائج' : 'No results'}</p>
        ) : (
          <>
            {recent.length > 0 && (
              <section>
                <h4 className="emo-title">{ar ? 'الأحدث استخدامًا' : 'Recent'}</h4>
                {grid(recent)}
              </section>
            )}
            {ALL.map((c) => (
              <section key={c.id} ref={(el) => { sectionRefs.current[c.id] = el; }}>
                <h4 className="emo-title">{ar ? c.ar : c.en}</h4>
                {grid(c.items)}
              </section>
            ))}
          </>
        )}
      </div>
      <div className="emo-tabs">
        {ALL.map((c) => (
          <button type="button" key={c.id} className={`emo-tab${tab === c.id && !results ? ' is-on' : ''}`} onClick={() => jump(c.id)} title={ar ? c.ar : c.en}>{c.icon}</button>
        ))}
      </div>
    </div>
  );
}
