import Icon from '../Icon';
import { useLanguage } from '../../context/LanguageContext';
import { callLine } from '../../lib/calls/callText';

/** The call line inside a chat (message_type='call'): "Voice call · 2:31", "Missed voice call"… + a call-back button. */
export default function CallBubble({ m, myUserId, onCallBack, canCall }) {
  const { locale } = useLanguage();
  const ar = locale === 'ar';
  const line = callLine(m.metadata, myUserId, ar);
  return (
    <div className={`msg-call msg-call--${line.tone}`}>
      <span className="msg-call__ico"><Icon name={line.video ? 'video' : 'phone'} size={18} style={line.video || line.incoming ? undefined : { transform: 'scaleX(-1)' }} /></span>
      <span className="msg-call__txt">
        <strong>{line.text}</strong>
        <span>{line.incoming ? (ar ? 'واردة' : 'Incoming') : (ar ? 'صادرة' : 'Outgoing')}</span>
      </span>
      {canCall && onCallBack && (
        <button type="button" className="msg-call__back" onClick={() => onCallBack(line.video)}>{ar ? 'اتصال' : 'Call back'}</button>
      )}
    </div>
  );
}
