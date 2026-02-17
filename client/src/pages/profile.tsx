import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { User, LogOut, Mail, Upload, ChevronDown, ChevronUp } from "lucide-react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export default function Profile() {
  const { user, isLoading, logout } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [showAdpImport, setShowAdpImport] = useState(false);
  const [adpText, setAdpText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ matchedCount: number; totalCount: number; unmatchedCount: number; results: { name: string; adp: number; matched: boolean; playerName?: string }[] } | null>(null);
  const [importMode, setImportMode] = useState<"merge" | "replace">("replace");

  const handleLogout = () => {
    logout();
    setLocation("/login");
  };

  const handleAdpImport = async () => {
    if (!adpText.trim()) {
      return;
    }
    if (!user) {
      return;
    }
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
    </div>
  );
}
