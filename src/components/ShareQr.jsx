import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import Icon from './Icon';
import '../styles/css/share-qr.css';

/**
 * Inline QR panel for a share link: scan with a phone camera to open the link.
 * The QR encodes the exact same URL as "Copy link", so every access rule
 * (expiry, password, one-person, one-time…) still applies to whoever scans it.
 */
export default function ShareQr({ url, name, ar, onToast }) {
  const tt = (en, a) => (ar ? a : en);
  const [png, setPng] = useState('');
  const [err, setErr] = useState(false);

  useEffect(() => {
    let off = false;
    setErr(false);
    QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 2, width: 640, color: { dark: '#000000', light: '#ffffff' } })
      .then((d) => { if (!off) setPng(d); })
      .catch(() => { if (!off) setErr(true); });
    return () => { off = true; };
  }, [url]);

  const fileName = `qr-${String(name || 'share').replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0, 40) || 'share'}.png`;

  const download = () => {
    if (!png) return;
    const a = document.createElement('a');
    a.href = png; a.download = fileName;
    document.body.appendChild(a); a.click(); a.remove();
  };

  const copyImage = async () => {
    try {
      if (!png || !navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error('unsupported');
      const blob = await (await fetch(png)).blob();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      onToast?.(tt('QR image copied.', 'تم نسخ صورة الـ QR.'));
    } catch {
      onToast?.(tt('Could not copy the image — use Download instead.', 'تعذّر نسخ الصورة — استخدم تنزيل بدلًا منها.'), 'error');
    }
  };

  const print = () => {
    if (!png) return;
    const w = window.open('', '_blank', 'width=520,height=640');
    if (!w) { onToast?.(tt('Allow pop-ups to print.', 'اسمح بالنوافذ المنبثقة للطباعة.'), 'error'); return; }
    const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    w.document.write(`<!doctype html><title>QR</title><body style="font-family:sans-serif;text-align:center;margin:40px"><h3>${esc(name || '')}</h3><img src="${png}" style="width:320px;height:320px"><p dir="ltr" style="word-break:break-all;font-size:12px;color:#444">${esc(url)}</p><script>onload=()=>setTimeout(()=>print(),150)<\/script>`);
    w.document.close();
  };

  return (
    <div className="mp-qr" role="group" aria-label={tt('Share by QR code', 'مشاركة بكود QR')}>
      <div className="mp-qr__img">
        {png ? <img src={png} alt={tt('QR code for the share link', 'كود QR لرابط المشاركة')} width={176} height={176} /> : <span className="mp-qr__ph">{err ? tt('Could not build the QR.', 'تعذّر إنشاء الـ QR.') : tt('Loading…', 'جارِ التحميل…')}</span>}
      </div>
      <div className="mp-qr__side">
        <strong>{tt('Scan to open', 'امسح لفتح الرابط')}</strong>
        <small>{tt('Point a phone camera at the code. The same link rules apply (expiry, password, who can open).', 'وجّه كاميرا الموبايل على الكود. نفس قواعد الرابط بتتطبق (المدة، الباسورد، مين يقدر يفتح).')}</small>
        <div className="mp-qr__btns">
          <button type="button" className="mp-qr__btn" onClick={download} disabled={!png}><Icon name="download" size={14} /><span>{tt('Download', 'تنزيل')}</span></button>
          <button type="button" className="mp-qr__btn" onClick={copyImage} disabled={!png}><Icon name="copy" size={14} /><span>{tt('Copy image', 'نسخ الصورة')}</span></button>
          <button type="button" className="mp-qr__btn" onClick={print} disabled={!png}><Icon name="file" size={14} /><span>{tt('Print', 'طباعة')}</span></button>
        </div>
      </div>
    </div>
  );
}
