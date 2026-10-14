import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-toastify';
import './BikeList.css';
import './FeaturePages.css';

const Messages = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(searchParams.get('user') || '');
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [conversationLoading, setConversationLoading] = useState(false);

  useEffect(() => {
    fetchConversations();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const userId = searchParams.get('user') || '';
    setSelectedUserId(userId);
  }, [searchParams]);

  useEffect(() => {
    if (selectedUserId) {
      fetchConversation(selectedUserId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUserId]);

  const fetchConversations = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/messages/conversations');
      setConversations(response.data);

      if (!searchParams.get('user') && response.data.length > 0) {
        setSearchParams({ user: String(response.data[0].other_user_id) });
      }
    } catch (error) {
      toast.error('Failed to load conversations.');
    } finally {
      setLoading(false);
    }
  };

  const fetchConversation = async (userId) => {
    try {
      setConversationLoading(true);
      const response = await axios.get(`/api/messages/${userId}`);
      setSelectedUser(response.data.otherUser);
      setMessages(response.data.messages);
      await axios.put(`/api/messages/${userId}/read`);
      setConversations((prev) => prev.map((conversation) => (
        String(conversation.other_user_id) === String(userId)
          ? { ...conversation, unread_count: 0 }
          : conversation
      )));
    } catch (error) {
      toast.error('Failed to load conversation.');
      navigate('/messages');
    } finally {
      setConversationLoading(false);
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!selectedUserId || !draft.trim()) return;

    try {
      const response = await axios.post('/api/messages', {
        receiver_id: selectedUserId,
        content: draft
      });
      setMessages((prev) => [...prev, response.data.data]);
      setDraft('');
      fetchConversations();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to send message.');
    }
  };

  return (
    <div className="bike-list-page">
      <div className="container">
        <h1>Messages</h1>
        <div className="messaging-layout">
          <div className="section-card conversation-list">
            <h3>Conversations</h3>
            {loading ? (
              <div className="loading">Loading conversations...</div>
            ) : conversations.length === 0 ? (
              <p className="empty-state-inline">No conversations yet.</p>
            ) : (
              <div className="list-stack">
                {conversations.map((conversation) => (
                  <button
                    key={conversation.other_user_id}
                    className={`conversation-row ${String(selectedUserId) === String(conversation.other_user_id) ? 'active' : ''}`}
                    onClick={() => setSearchParams({ user: String(conversation.other_user_id) })}
                  >
                    <div>
                      <strong>{conversation.other_user_name}</strong>
                      <div className="conversation-preview">{conversation.latest_message}</div>
                    </div>
                    {conversation.unread_count > 0 && (
                      <span className="summary-pill">{conversation.unread_count}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="section-card conversation-panel">
            {!selectedUserId ? (
              <p className="empty-state-inline">Select a conversation to start messaging.</p>
            ) : conversationLoading ? (
              <div className="loading">Loading messages...</div>
            ) : (
              <>
                <div className="section-header-row">
                  <h3>{selectedUser?.name || 'Conversation'}</h3>
                  {selectedUser?.email && <span className="summary-pill">{selectedUser.email}</span>}
                </div>
                <div className="message-thread">
                  {messages.length === 0 ? (
                    <p className="empty-state-inline">No messages yet. Send the first one.</p>
                  ) : (
                    messages.map((message) => (
                      <div
                        key={message.id}
                        className={`message-bubble ${String(message.sender_id) === String(selectedUserId) ? 'incoming' : 'outgoing'}`}
                      >
                        <p>{message.content}</p>
                        <small>{new Date(message.sent_at).toLocaleString()}</small>
                      </div>
                    ))
                  )}
                </div>
                <form onSubmit={handleSend} className="message-composer">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={3}
                    className="filter-input"
                    placeholder="Write a message..."
                  />
                  <button type="submit" className="btn btn-primary">Send</button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Messages;
