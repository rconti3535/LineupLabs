import { MessageCircle, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function Messages() {
  const conversations: any[] = [];

  const handleConversationClick = (conversationId: number) => {
    console.log("Open conversation:", conversationId);
  };

  const handleNewMessage = () => {
    console.log("Start new message");
  };

  return (
    <div className="px-4 py-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white mb-2">Messages</h2>
        <p className="text-gray-400">Chat with league members</p>
      </div>

      {/* Search Bar */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
        <Input
          placeholder="Search conversations..."
          className="pl-10 sleeper-card-bg sleeper-border border text-white placeholder-gray-400"
        />
      </div>

      {/* New Message Button */}
      <Button
        onClick={handleNewMessage}
        className="w-full primary-gradient rounded-xl p-4 mb-6 flex items-center justify-center gap-2 hover:opacity-90"
      >
        <MessageCircle className="h-5 w-5" />
        <span className="font-medium">Start New Message</span>
      </Button>

      {/* Conversations List */}
      <div className="space-y-3">
        {conversations.map((conversation) => (
          <Card
            key={conversation.id}
            className="gradient-card rounded-xl p-4 hover-lift cursor-pointer border-0"
            onClick={() => handleConversationClick(conversation.id)}
          >
            <div className="flex items-center space-x-3">
              <div className="relative">
                <img
                  src={conversation.avatar}
                  alt={conversation.name}
                  className="w-12 h-12 rounded-full object-cover"
                />
                {conversation.isGroup && (
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
                    <span className="text-white text-xs font-bold">3</span>
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-white font-medium truncate">{conversation.name}</h3>
                  <div className="flex items-center space-x-2">
                    <span className="text-gray-400 text-xs">{conversation.time}</span>
                    {conversation.unread > 0 && (
                      <div className="w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
                        <span className="text-white text-xs font-bold">{conversation.unread}</span>
                      </div>
                    )}
                  </div>
                </div>
                <p className="text-gray-400 text-sm truncate">{conversation.lastMessage}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Empty State if no conversations */}
      {conversations.length === 0 && (
        <Card className="gradient-card rounded-xl p-8 text-center border-0">
          <MessageCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-400 mb-4">No messages yet</p>
          <p className="text-sm text-gray-500">Start a conversation with your league members</p>
        </Card>
      )}
    </div>
  );
}