import { useParams } from 'react-router-dom';
import Messages from './Messages';
import MessagesCenter, { isCenterSection } from './MessagesCenter';

/** /{portal}/messages/:conversationId — a chat id opens the messenger; archived|blocked|reports|trash open the full pages. */
export default function MessagesRoute() {
  const { conversationId } = useParams();
  return isCenterSection(conversationId) ? <MessagesCenter key={conversationId} section={conversationId} /> : <Messages />;
}
