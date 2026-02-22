import { useState, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { User, LogOut, Mail, Settings, Camera, Trophy, Award, Medal, Trash2, AlertTriangle, Search } from "lucide-react";
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

interface ExposurePlayer {
  playerId: number;
  name: string;
  position: string;
  team: string;
  leagueCount: number;
  totalLeagues: number;
  percentage: number;
}

interface ExposureData {
  totalLeagues: number;
  players: ExposurePlayer[];
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
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [exposureSearch, setExposureSearch] = useState("");
  const [exposurePos, setExposurePos] = useState("ALL");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: stats } = useQuery<ProfileStats>({
    queryKey: ["/api/users", user?.id, "profile-stats"],
    queryFn: async () => {
      const res = await fetch(`/api/users/${user?.id}/profile-stats`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!user?.id,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: exposure } = useQuery<ExposureData>({
    queryKey: ["/api/users", user?.id, "exposure"],
    queryFn: async () => {
      const res = await fetch(`/api/users/${user?.id}/exposure`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!user?.id,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const filteredExposure = useMemo(() => {
    if (!exposure?.players) return [];
    const INF_POSITIONS = ["1B", "2B", "3B", "SS"];
    const OF_POSITIONS = ["OF", "LF", "CF", "RF", "DH", "UT"];
    return exposure.players.filter(p => {
      if (exposurePos !== "ALL") {
        if (exposurePos === "INF" && !INF_POSITIONS.includes(p.position)) return false;
        if (exposurePos === "OF" && !OF_POSITIONS.includes(p.position)) return false;
        if (exposurePos !== "INF" && exposurePos !== "OF" && p.position !== exposurePos) return false;
      }
      if (exposureSearch.trim()) {
        const q = exposureSearch.toLowerCase();
        if (!p.name.toLowerCase().includes(q) && !p.position.toLowerCase().includes(q) && !p.team?.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [exposure?.players, exposureSearch, exposurePos]);

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

  const deleteAccountMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/users/${user?.id}`);
    },
    onSuccess: () => {
      logout();
      setLocation("/login");
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete account", description: error.message, variant: "destructive" });
    },
  });

  const handleDeleteAccount = () => {
    if (deleteConfirmText !== user?.username) return;
    deleteAccountMutation.mutate();
  };

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

        <div className="flex items-center justify-center gap-2 mb-4">
          <Trophy className="w-5 h-5 text-blue-400" />
          <span className="text-sm text-gray-400">GM Tier</span>
          <span className={`text-lg font-bold ${tierColor}`}>{stats?.gmTier || "Intern"}</span>
        </div>

        <div className="bg-gray-800/60 rounded-xl py-3 text-center mb-5">
          <div className="text-2xl font-bold text-white">{stats?.allTimeLeagues ?? 0}</div>
          <div className="text-[10px] text-gray-400 font-medium">ALL-TIME LEAGUES</div>
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

      <Card className="gradient-card rounded-xl p-6 border-0">
        <div className="flex items-center gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <Input
              value={exposureSearch}
              onChange={(e) => setExposureSearch(e.target.value)}
              placeholder="Search players..."
              className="bg-gray-800 border-gray-700 text-white pl-9 text-sm h-9"
            />
          </div>
          <Select value={exposurePos} onValueChange={setExposurePos}>
            <SelectTrigger className="h-9 w-[80px] bg-gray-800 border-gray-700 text-gray-200 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-gray-900 border-gray-700">
              {["ALL", "C", "INF", "OF", "SP", "RP"].map((pos) => (
                <SelectItem key={pos} value={pos} className="text-gray-200 focus:bg-gray-800 focus:text-white">
                  {pos}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {filteredExposure.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-6">
            {exposure?.players?.length === 0 ? "No drafted players yet" : "No players match your search"}
          </p>
        ) : (
          <div className="space-y-1.5 max-h-[400px] overflow-y-auto hide-scrollbar">
            {filteredExposure.map((p) => (
              <div key={p.playerId} className="flex items-center gap-3 bg-gray-800/50 rounded-lg px-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white truncate">{p.name}</span>
                    <span className="text-[10px] text-gray-500 shrink-0">{p.position} · {p.team}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-blue-500"
                        style={{ width: `${Math.min(p.percentage, 100)}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-400 shrink-0 w-8 text-right">{p.leagueCount}/{p.totalLeagues}</span>
                  </div>
                </div>
                <div className="shrink-0 w-14 text-right">
                  <span className="text-sm font-bold text-blue-400">{p.percentage.toFixed(0)}%</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="gradient-card rounded-xl p-6 border border-red-900/30">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="w-5 h-5 text-red-500" />
          <h2 className="text-lg font-semibold text-red-500">Danger Zone</h2>
        </div>
        <p className="text-sm text-gray-400 mb-4">
          Permanently delete your account and all associated data. This action cannot be undone.
        </p>
        <Button
          onClick={() => { setDeleteOpen(true); setDeleteConfirmText(""); }}
          variant="destructive"
          className="w-full rounded-xl py-3 bg-red-600/20 hover:bg-red-600/40 border border-red-600/40 text-red-400 font-medium"
        >
          <Trash2 className="w-4 h-4 mr-2" />
          Delete Account
        </Button>
      </Card>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="bg-gray-900 border-gray-700 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-red-500 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Delete Account
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-gray-400">
              This will permanently delete your account, all your teams, draft picks, and league data. This cannot be undone.
            </p>
            <div>
              <label className="text-sm text-gray-400 mb-1.5 block">
                Type <span className="text-white font-semibold">{user.username}</span> to confirm
              </label>
              <Input
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                className="bg-gray-800 border-gray-700 text-white"
                placeholder="Enter your username"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setDeleteOpen(false)} className="text-gray-400">
              Cancel
            </Button>
            <Button
              onClick={handleDeleteAccount}
              disabled={deleteConfirmText !== user.username || deleteAccountMutation.isPending}
              className="bg-red-600 hover:bg-red-700 text-white disabled:opacity-40"
            >
              {deleteAccountMutation.isPending ? "Deleting..." : "Delete My Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
