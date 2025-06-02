import { Card } from "@/components/ui/card";
import type { User } from "@shared/schema";

interface ProfileHeaderProps {
  user: User;
}

export function ProfileHeader({ user }: ProfileHeaderProps) {
  return (
    <Card className="gradient-card rounded-xl p-6 mb-6 border-0">
      <div className="flex items-center space-x-4 mb-4">
        <img
          src={user.avatar || "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=80&h=80"}
          alt="User profile"
          className="w-16 h-16 rounded-full object-cover"
        />
        <div>
          <h2 className="text-xl font-bold text-white">{user.name}</h2>
          <p className="text-gray-400">{user.email}</p>
        </div>
      </div>
      
      <div className="grid grid-cols-3 gap-4 text-center">
        <div>
          <p className="text-2xl font-bold text-white">{user.leagues}</p>
          <p className="text-gray-400 text-sm">Leagues</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-white">{user.wins}</p>
          <p className="text-gray-400 text-sm">Wins</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-white">{user.championships}</p>
          <p className="text-gray-400 text-sm">Championships</p>
        </div>
      </div>
    </Card>
  );
}
