import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { User, LogOut, Mail } from "lucide-react";
import { useLocation } from "wouter";

export default function Profile() {
  const { user, isLoading, logout } = useAuth();
  const [, setLocation] = useLocation();

  const handleLogout = () => {
    logout();
    setLocation("/login");
  };

  if (isLoading) {
    return (
      <div className="px-4 py-6">
        <div className="gradient-card rounded-xl p-6 mb-6">
          <div className="flex items-center space-x-4 mb-4">
            <Skeleton className="w-16 h-16 rounded-full" />
            <div>
              <Skeleton className="h-6 w-32 mb-2" />
              <Skeleton className="h-4 w-48" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 text-center">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i}>
                <Skeleton className="h-8 w-8 mx-auto mb-2" />
                <Skeleton className="h-4 w-16 mx-auto" />
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="px-4 py-6">
        <div className="gradient-card rounded-xl p-8 text-center">
          <p className="text-gray-400">User not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 space-y-6">
      {/* User Profile Card */}
      <Card className="gradient-card rounded-xl p-6 border-0">
        <div className="flex items-center space-x-4 mb-6">
          <div className="w-16 h-16 primary-gradient rounded-full flex items-center justify-center">
            <User className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white mb-1">{user.username}</h1>
            <div className="flex items-center text-gray-400">
              <Mail className="w-4 h-4 mr-2" />
              <span className="text-sm">{user.email}</span>
            </div>
          </div>
        </div>

        {/* User Stats */}
        <div className="grid grid-cols-3 gap-4 text-center mb-6">
          <div>
            <div className="text-2xl font-bold text-white">0</div>
            <div className="text-xs text-gray-400">Leagues</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-white">0</div>
            <div className="text-xs text-gray-400">Teams</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-white">0</div>
            <div className="text-xs text-gray-400">Wins</div>
          </div>
        </div>

        {/* Logout Button */}
        <Button
          onClick={handleLogout}
          variant="destructive"
          className="w-full rounded-xl py-3 bg-red-600 hover:bg-red-700 text-white font-medium"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Sign Out
        </Button>
      </Card>

      {/* Additional Profile Sections */}
      <Card className="gradient-card rounded-xl p-6 border-0">
        <h2 className="text-lg font-semibold text-white mb-4">Account Settings</h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2">
            <span className="text-gray-300">Notifications</span>
            <span className="text-gray-400 text-sm">Enabled</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-gray-300">Privacy</span>
            <span className="text-gray-400 text-sm">Public</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-gray-300">League Invites</span>
            <span className="text-gray-400 text-sm">Open</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
