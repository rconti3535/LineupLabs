import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { User, LogOut, Mail, Upload, ChevronDown, ChevronUp, Settings, Camera } from "lucide-react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Team } from "@shared/schema";

export default function Profile() {
  const { user, isLoading, logout } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAdpImport, setShowAdpImport] = useState(false);
  const [adpText, setAdpText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ matchedCount: number; totalCount: number; unmatchedCount: number; results: { name: string; adp: number; matched: boolean; playerName?: string }[] } | null>(null);
  const [importMode, setImportMode] = useState<"merge" | "replace">("replace");
  const [editOpen, setEditOpen] = useState(false);
  const [editUsername, setEditUsername] = useState("");
  const [editAvatar, setEditAvatar] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: userTeams } = useQuery<Team[]>({
    queryKey: ["/api/teams/user", user?.id],
    queryFn: async () => {
      const res = await fetch(`/api/teams/user/${user?.id}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!user?.id,
  });

  const leagueCount = new Set((userTeams || []).map(t => t.leagueId).filter(Boolean)).size;
  const teamCount = (userTeams || []).length;

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

  const handleAdpImport = async () => {
    if (!adpText.trim()) return;
    if (!user) return;
    setImporting(true);
    setImportResult(null);
    try {
      const res = await apiRequest("POST", "/api/adp/import", {
        data: adpText,
        leagueType: "Redraft",
        scoringFormat: "Roto",
        season: 2026,
        weight: 100,
        userId: user.id,
        mode: importMode,
      });
      const result = await res.json();
      setImportResult(result);
    } catch (err) {
    } finally {
      setImporting(false);
    }
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

        <div className="grid grid-cols-3 gap-4 text-center mb-6">
          <div>
            <div className="text-2xl font-bold text-white">{leagueCount}</div>
            <div className="text-xs text-gray-400">Leagues</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-white">{teamCount}</div>
            <div className="text-xs text-gray-400">Teams</div>
          </div>
          <div>
            <div className="text-lg font-bold text-blue-400">Intern</div>
            <div className="text-xs text-gray-400">GM Tier</div>
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

      <Card className="gradient-card rounded-xl p-6 border-0">
        <button
          onClick={() => setShowAdpImport(!showAdpImport)}
          className="flex items-center justify-between w-full"
        >
          <div className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-semibold text-white">Import ADP Data</h2>
          </div>
          {showAdpImport ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
        </button>

        {showAdpImport && (
          <div className="mt-4 space-y-3">
            <p className="text-gray-400 text-xs">
              Paste a tab-separated list of player names and ADP values. Each line should be: Player Name [tab] ADP Number
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setImportMode("replace")}
                className={`flex-1 text-xs py-1.5 rounded-lg border ${importMode === "replace" ? "bg-blue-600 border-blue-500 text-white" : "bg-gray-800 border-gray-700 text-gray-400"}`}
              >
                Replace existing
              </button>
              <button
                onClick={() => setImportMode("merge")}
                className={`flex-1 text-xs py-1.5 rounded-lg border ${importMode === "merge" ? "bg-blue-600 border-blue-500 text-white" : "bg-gray-800 border-gray-700 text-gray-400"}`}
              >
                Merge with existing
              </button>
            </div>
            <textarea
              value={adpText}
              onChange={(e) => setAdpText(e.target.value)}
              placeholder={"Player Name\tADP\nShohei Ohtani\t1\nAaron Judge\t2"}
              className="w-full h-40 bg-gray-800 border border-gray-700 rounded-lg p-3 text-white text-xs font-mono resize-y placeholder:text-gray-600"
            />
            <Button
              onClick={handleAdpImport}
              disabled={importing || !adpText.trim()}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
            >
              {importing ? "Importing..." : "Import ADP Rankings"}
            </Button>

            {importResult && (
              <div className="mt-3 space-y-2">
                <div className="flex gap-3 text-xs">
                  <span className="text-green-400">{importResult.matchedCount} matched</span>
                  {importResult.unmatchedCount > 0 && (
                    <span className="text-yellow-400">{importResult.unmatchedCount} unmatched</span>
                  )}
                  <span className="text-gray-400">{importResult.totalCount} total</span>
                </div>
                {importResult.unmatchedCount > 0 && (
                  <div className="bg-gray-800/50 rounded-lg p-2 max-h-32 overflow-y-auto">
                    <p className="text-yellow-400 text-[10px] font-semibold mb-1">Unmatched players:</p>
                    {importResult.results.filter(r => !r.matched).map((r, i) => (
                      <p key={i} className="text-gray-400 text-[10px]">{r.name} (ADP: {r.adp})</p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
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
