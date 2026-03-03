import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { User, LogOut, Mail, Settings, Camera, Trash2, AlertTriangle } from "lucide-react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export default function Profile() {
  const { user, isLoading, logout } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [editUsername, setEditUsername] = useState("");
  const [editAvatar, setEditAvatar] = useState<string | null>(null);
  const [avatarSource, setAvatarSource] = useState<string | null>(null);
  const [avatarZoom, setAvatarZoom] = useState(1);
  const [avatarOffset, setAvatarOffset] = useState({ x: 0, y: 0 });
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; startOffsetX: number; startOffsetY: number } | null>(null);

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
    setAvatarSource(user?.avatar || null);
    setAvatarZoom(1);
    setAvatarOffset({ x: 0, y: 0 });
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
      const src = reader.result as string;
      setEditAvatar(src);
      setAvatarSource(src);
      setAvatarZoom(1);
      setAvatarOffset({ x: 0, y: 0 });
    };
    reader.readAsDataURL(file);
  };

  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

  const renderAvatarCrop = async (source: string, zoom: number, offset: { x: number; y: number }) => {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = source;
    });

    const size = 320;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return source;

    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    const baseScale = Math.max(size / image.width, size / image.height);
    const scale = baseScale * zoom;
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    const x = (size - drawWidth) / 2 + offset.x;
    const y = (size - drawHeight) / 2 + offset.y;
    ctx.drawImage(image, x, y, drawWidth, drawHeight);
    ctx.restore();

    return canvas.toDataURL("image/png");
  };

  const handleSaveProfile = async () => {
    const data: { username?: string; avatar?: string | null } = {};
    if (editUsername && editUsername !== user?.username) data.username = editUsername.trim();
    let nextAvatar = editAvatar;
    if (avatarSource) {
      try {
        nextAvatar = await renderAvatarCrop(avatarSource, avatarZoom, avatarOffset);
      } catch {
        nextAvatar = editAvatar;
      }
    }
    if (nextAvatar !== (user?.avatar || null)) data.avatar = nextAvatar;
    if (Object.keys(data).length === 0) {
      setEditOpen(false);
      return;
    }
    updateProfileMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <div className="px-4 py-6">
        <div className="gradient-card card-3d rounded-xl p-6 mb-6">
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
        <div className="gradient-card card-3d rounded-xl p-8 text-center">
          <p className="text-gray-400">User not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 space-y-6">
      <Card className="gradient-card card-3d rounded-xl p-6 border-0">
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

        <Button
          onClick={handleLogout}
          variant="destructive"
          className="w-full rounded-xl py-3 bg-red-600 hover:bg-red-700 text-white font-medium"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Sign Out
        </Button>
      </Card>

      <Card className="gradient-card card-3d rounded-xl p-6 border border-red-900/30">
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
                <div
                  className="w-24 h-24 rounded-full overflow-hidden bg-gray-800 cursor-grab active:cursor-grabbing"
                  onMouseDown={(e) => {
                    if (!avatarSource) return;
                    dragRef.current = {
                      startX: e.clientX,
                      startY: e.clientY,
                      startOffsetX: avatarOffset.x,
                      startOffsetY: avatarOffset.y,
                    };
                  }}
                  onMouseMove={(e) => {
                    if (!dragRef.current) return;
                    const dx = e.clientX - dragRef.current.startX;
                    const dy = e.clientY - dragRef.current.startY;
                    setAvatarOffset({
                      x: clamp(dragRef.current.startOffsetX + dx, -180, 180),
                      y: clamp(dragRef.current.startOffsetY + dy, -180, 180),
                    });
                  }}
                  onMouseUp={() => { dragRef.current = null; }}
                  onMouseLeave={() => { dragRef.current = null; }}
                  onTouchStart={(e) => {
                    if (!avatarSource) return;
                    const touch = e.touches[0];
                    dragRef.current = {
                      startX: touch.clientX,
                      startY: touch.clientY,
                      startOffsetX: avatarOffset.x,
                      startOffsetY: avatarOffset.y,
                    };
                  }}
                  onTouchMove={(e) => {
                    if (!dragRef.current) return;
                    const touch = e.touches[0];
                    const dx = touch.clientX - dragRef.current.startX;
                    const dy = touch.clientY - dragRef.current.startY;
                    setAvatarOffset({
                      x: clamp(dragRef.current.startOffsetX + dx, -180, 180),
                      y: clamp(dragRef.current.startOffsetY + dy, -180, 180),
                    });
                  }}
                  onTouchEnd={() => { dragRef.current = null; }}
                >
                  {avatarSource ? (
                    <img
                      src={avatarSource}
                      alt="Preview"
                      className="w-full h-full select-none"
                      draggable={false}
                      style={{
                        objectFit: "cover",
                        transform: `translate(${avatarOffset.x}px, ${avatarOffset.y}px) scale(${avatarZoom})`,
                        transformOrigin: "center center",
                      }}
                    />
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
              {avatarSource && (
                <div className="w-full space-y-2">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setAvatarZoom((z) => clamp(z - 0.1, 1, 3))}
                      className="h-7 w-7 px-0 text-gray-300"
                    >
                      -
                    </Button>
                    <Input
                      type="range"
                      min={1}
                      max={3}
                      step={0.01}
                      value={avatarZoom}
                      onChange={(e) => setAvatarZoom(parseFloat(e.target.value))}
                      className="h-7"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setAvatarZoom((z) => clamp(z + 0.1, 1, 3))}
                      className="h-7 w-7 px-0 text-gray-300"
                    >
                      +
                    </Button>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-gray-500">Drag to position, use slider to zoom</span>
                    <button
                      onClick={() => {
                        setEditAvatar(null);
                        setAvatarSource(null);
                        setAvatarZoom(1);
                        setAvatarOffset({ x: 0, y: 0 });
                      }}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      Remove photo
                    </button>
                  </div>
                </div>
              )}
              {!avatarSource && editAvatar && (
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
