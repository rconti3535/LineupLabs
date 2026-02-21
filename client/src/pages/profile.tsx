import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { User, LogOut, Mail, Settings, Camera, Trophy, Award, Medal } from "lucide-react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface ProfileStats {
  allTimeLeagues: number;
  completedLeagues: number;
  gold: number;
  silver: number;
  bronze: number;
  winRate: number;
  trophyRate: number;
  gmTier: string;
}

const GM_TIER_COLORS: Record<string, string> = {
  "Intern": "text-gray-400",
  "Rookie": "text-green-400",
  "Scout": "text-blue-400",
  "Manager": "text-purple-400",
  "Director": "text-orange-400",
  "Executive": "text-red-400",
  "Hall of Fame": "text-yellow-400",
};

export default function Profile() {
  const { user, isLoading, logout } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [editUsername, setEditUsername] = useState("");
  const [editAvatar, setEditAvatar] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: stats } = useQuery<ProfileStats>({
    queryKey: ["/api/users", user?.id, "profile-stats"],
    queryFn: async () => {
      const res = await fetch(`/api/users/${user?.id}/profile-stats`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!user?.id,
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: { username?: string; avatar?: string | null }) => {
      const res = await apiRequest("PATCH", `/api/users/${user?.id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users", user?.id] });
      setEditOpen(false);
      toast({ title: "Profile updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Could not update profile", description: error.message, variant: "destructive" });
    },
  });

  const handleLogout = () => {
    logout();
    setLocation("/login");
  };

  const openEditDialog = () => {
    setEditUsername(user?.username || "");
    setEditAvatar(user?.avatar || null);
    setEditOpen(true);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "Image too large", description: "Please choose an image under 2MB", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setEditAvatar(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProfile = () => {
    const data: { username?: string; avatar?: string | null } = {};
    if (editUsername && editUsername !== user?.username) data.username = editUsername.trim();
    if (editAvatar !== (user?.avatar || null)) data.avatar = editAvatar;
    if (Object.keys(data).length === 0) {
      setEditOpen(false);
      return;
    }
    updateProfileMutation.mutate(data);
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

  const tierColor = GM_TIER_COLORS[stats?.gmTier || "Intern"] || "text-gray-400";

  return (
    <div className="px-4 py-6 space-y-6">
      <Card className="gradient-card rounded-xl p-6 border-0">
        <div className="flex items-center space-x-4 mb-6">
          <div className="w-16 h-16 rounded-full overflow-hidden shrink-0">
            {user.avatar ? (
              <img src={user.avatar} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full primary-gradient flex items-center justify-center">
                <User className="w-8 h-8 text-white" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-white mb-1 truncate">{user.username}</h1>
            <div className="flex items-center text-gray-400">
              <Mail className="w-4 h-4 mr-2 shrink-0" />
              <span className="text-sm truncate">{user.email}</span>
            </div>
          </div>
          <button
            onClick={openEditDialog}
            className="shrink-0 w-9 h-9 rounded-full bg-gray-700/60 hover:bg-gray-600/80 flex items-center justify-center transition-colors"
          >
            <Settings className="w-4.5 h-4.5 text-gray-300" />
          </button>
        </div>

        <div className="flex items-center justify-between mb-5 px-1">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-blue-400" />
            <span className="text-sm text-gray-400">GM Tier</span>
            <span className={`text-sm font-bold ${tierColor}`}>{stats?.gmTier || "Intern"}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-2xl font-bold text-white">{stats?.allTimeLeagues ?? 0}</span>
            <span className="text-xs text-gray-400">Leagues</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl py-3 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Award className="w-4 h-4 text-yellow-400" />
            </div>
            <div className="text-2xl font-bold text-yellow-400">{stats?.gold ?? 0}</div>
            <div className="text-[10px] text-yellow-400/70 font-medium">GOLD</div>
          </div>
          <div className="bg-gray-400/10 border border-gray-400/20 rounded-xl py-3 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Medal className="w-4 h-4 text-gray-300" />
            </div>
            <div className="text-2xl font-bold text-gray-300">{stats?.silver ?? 0}</div>
            <div className="text-[10px] text-gray-400/70 font-medium">SILVER</div>
          </div>
          <div className="bg-orange-600/10 border border-orange-600/20 rounded-xl py-3 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Medal className="w-4 h-4 text-orange-400" />
            </div>
            <div className="text-2xl font-bold text-orange-400">{stats?.bronze ?? 0}</div>
            <div className="text-[10px] text-orange-500/70 font-medium">BRONZE</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-gray-800/60 rounded-xl py-3 text-center">
            <div className="text-xl font-bold text-white">{(stats?.winRate ?? 0).toFixed(1)}%</div>
            <div className="text-[10px] text-gray-400 font-medium">WIN RATE</div>
          </div>
          <div className="bg-gray-800/60 rounded-xl py-3 text-center">
            <div className="text-xl font-bold text-white">{(stats?.trophyRate ?? 0).toFixed(1)}%</div>
            <div className="text-[10px] text-gray-400 font-medium">TROPHY RATE</div>
          </div>
        </div>

        <Button
          onClick={handleLogout}
          variant="destructive"
          className="w-full rounded-xl py-3 bg-red-600 hover:bg-red-700 text-white font-medium"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Sign Out
        </Button>
      </Card>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="bg-gray-900 border-gray-700 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-white">Edit Profile</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div className="flex flex-col items-center gap-3">
              <div className="relative">
                <div className="w-20 h-20 rounded-full overflow-hidden">
                  {editAvatar ? (
                    <img src={editAvatar} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full primary-gradient flex items-center justify-center">
                      <User className="w-10 h-10 text-white" />
                    </div>
                  )}
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center border-2 border-gray-900"
                >
                  <Camera className="w-3.5 h-3.5 text-white" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>
              {editAvatar && (
                <button onClick={() => setEditAvatar(null)} className="text-xs text-red-400 hover:text-red-300">
                  Remove photo
                </button>
              )}
            </div>
            <div>
              <label className="text-sm text-gray-400 mb-1.5 block">Username</label>
              <Input
                value={editUsername}
                onChange={(e) => setEditUsername(e.target.value)}
                className="bg-gray-800 border-gray-700 text-white"
                placeholder="Enter username"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setEditOpen(false)} className="text-gray-400">
              Cancel
            </Button>
            <Button
              onClick={handleSaveProfile}
              disabled={updateProfileMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {updateProfileMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
