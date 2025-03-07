import { useState, useEffect, useRef } from "react";
import { supabase } from "../utils/supabase";
import { useAuth } from "../contexts/AuthContext";
import ChatMessage from "./ChatMessage";
import { ArrowLeft } from "lucide-react";

function ChatWindow({ conversation, isOnline, onBackToList }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef(null);
  const unreadMessageRef = useRef(null); // Reference for unread messages (future use)
  const [otherUser, setOtherUser] = useState(null);

  // Scroll to the last message
  const scrollToLastMessage = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    const other =
      conversation.user1.id === user.id ? conversation.user2 : conversation.user1;
    setOtherUser(other);
  }, [conversation, user.id]);

  useEffect(() => {
    const markMessagesAsRead = async () => {
      const unreadMessages = messages.filter(
        (msg) => msg.sender_id !== user.id && !msg.read
      );

      if (unreadMessages.length > 0) {
        const { error } = await supabase
          .from("messages")
          .update({ read: true })
          .in(
            "id",
            unreadMessages.map((msg) => msg.id)
          );

        if (error) {
          console.error("Error marking messages as read:", error);
        }
      }
    };

    markMessagesAsRead();
  }, [messages, user.id]);

  useEffect(() => {
    fetchMessages();
    const messagesSubscription = supabase
      .channel(`messages:${conversation.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversation.id}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            if (payload.new.sender_id !== user.id) {
              setMessages((current) => [...current, payload.new]);
            }
          } else if (payload.eventType === "UPDATE") {
            setMessages((current) =>
              current.map((msg) =>
                msg.id === payload.new.id ? payload.new : msg
              )
            );
          }
        }
      )
      .subscribe();

    return () => {
      messagesSubscription.unsubscribe();
    };
  }, [conversation.id]);

  const fetchMessages = async () => {
    try {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversation.id)
        .order("created_at", { ascending: true });

      if (error) throw error;
      setMessages(data || []);

      // Scroll to the last message after fetching messages
      setTimeout(() => {
        scrollToLastMessage();
      }, 0);

      setLoading(false);
    } catch (error) {
      console.error("Error fetching messages:", error);
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    try {
      const newMsg = {
        conversation_id: conversation.id,
        sender_id: user.id,
        content: newMessage.trim(),
        created_at: new Date().toISOString(),
        read: false,
      };

      setMessages((current) => [...current, newMsg]);
      setNewMessage("");

      const { error, data } = await supabase
        .from("messages")
        .insert(newMsg)
        .select()
        .single();

      if (error) throw error;

      setMessages((current) =>
        current.map((msg) => (msg === newMsg ? data : msg))
      );

      // Scroll to the last message after sending
      scrollToLastMessage();
    } catch (error) {
      console.error("Error sending message:", error);
      setMessages((current) => current.filter((msg) => msg !== newMsg));
      alert("Failed to send message");
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 p-4 flex items-center justify-between border-b bg-white">
        <div className="flex items-center">
          <button
            onClick={onBackToList}
            className="p-2 text-gray-500 hover:bg-gray-100 rounded-full lg:hidden"
          >
            <ArrowLeft size={24} />
          </button>
          <img
            src={otherUser?.avatar_url || "./public/cat.png"}
            alt={otherUser?.username || "Profile"}
            className="w-12 h-12 rounded-full hover:ring-2 hover:ring-blue-500"
          />
          <div className="ml-4">
            <h3 className="text-lg font-bold text-gray-800">
              {otherUser?.username}
            </h3>
            <div className="flex items-center mt-1">
              <div
                className={`w-2 h-2 rounded-full ${
                  isOnline ? "bg-green-500" : "bg-gray-400"
                }`}
              />
              <span className="ml-1 text-sm text-gray-500">
                {isOnline ? "Active" : "Offline"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto p-4 bg-white">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-gray-500">No messages yet</div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => (
              <ChatMessage
                key={message.id}
                message={message}
                id={`message-${message.id}`}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Message Input Form */}
      <form
        onSubmit={sendMessage}
        className="flex-shrink-0 border-t p-4 bg-gray-50"
      >
        <div className="flex space-x-2 max-w-7xl mx-auto">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={!newMessage.trim()}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}

export default ChatWindow;
