import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Trophy, CheckCircle, XCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { League, Team } from "@shared/schema";

export default function JoinLeague() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const params = useParams<{ id: string }>();
  const leagueId = parseInt(params.id);

  const { data: league, isLoading: leagueLoading } = useQuery<League>({
    queryKey: ["/api/leagues", leagueId],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}`);
      if (!res.ok) throw new Error("League not found");
      return res.json();
    },
    enabled: !!leagueId,
  });

  const { data: teams } = useQuery<Team[]>({
    queryKey: ["/api/teams/league", leagueId],
    queryFn: async () => {
      const res = await fetch(`/api/teams/league/${leagueId}`);
      if (!res.ok) throw new Error("Failed to fetch teams");
      return res.json();
    },
    enabled: !!leagueId,
  });

  const { data: commissioner } = useQuery<{ username: string }>({
    queryKey: ["/api/users", league?.createdBy],
    queryFn: async () => {
      const res = await fetch(`/api/users/${league!.createdBy}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!league?.createdBy,
  });

  const alreadyInLeague = teams?.some(t => t.userId === user?.id);
  const humanTeams = teams?.filter(t => !t.isCpu) || [];
  const maxTeams = league?.maxTeams || league?.numberOfTeams || 12;
  const isFull = humanTeams.length >= maxTeams;

  const joinMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/leagues/${leagueId}/join`, { userId: user?.id, invite: true });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to join league");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Welcome!", description: `You've joined ${league?.name}` });
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues"] });
      setLocation(`/league/${leagueId}`);
    },
    onError: (error: Error) => {
      toast({ title: "Could not join", description: error.message, variant: "destructive" });
    },
  });

  if (leagueLoading) {
    return (
      <div className="px-4 py-8 flex items-center justify-center min-h-[60vh]">
        <Card className="gradient-card rounded-2xl p-8 border-0 w-full max-w-sm">
          <div className="flex flex-col items-center gap-4">
            <Skeleton className="w-16 h-16 rounded-full" />
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-32" />
            <div className="flex gap-3 w-full mt-4">
              <Skeleton className="h-11 flex-1 rounded-xl" />
              <Skeleton className="h-11 flex-1 rounded-xl" />
            </div>
          </div>
        </Card>
      </div>
    );
  }

  if (!league) {
    return (
      <div className="px-4 py-8 flex items-center justify-center min-h-[60vh]">
        <Card className="gradient-card rounded-2xl p-8 border-0 w-full max-w-sm text-center">
          <XCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
          <h2 className="text-white text-lg font-bold mb-2">League Not Found</h2>
          <p className="text-gray-400 text-sm mb-6">This invite link may be expired or invalid.</p>
          <Button onClick={() => setLocation("/")} className="w-full bg-gray-700 hover:bg-gray-600 text-white rounded-xl h-11">
            Go Home
          </Button>
        </Card>
      </div>
    );
  }

  if (alreadyInLeague) {
    return (
      <div className="px-4 py-8 flex items-center justify-center min-h-[60vh]">
        <Card className="gradient-card rounded-2xl p-8 border-0 w-full max-w-sm text-center">
          <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
          <h2 className="text-white text-lg font-bold mb-2">You're already in this league!</h2>
          <p className="text-gray-400 text-sm mb-6">{league.name}</p>
          <Button onClick={() => setLocation(`/league/${leagueId}`)} className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-11">
            Go to League
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="px-4 py-8 flex items-center justify-center min-h-[60vh]">
      <Card className="gradient-card rounded-2xl p-8 border-0 w-full max-w-sm">
        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-full bg-blue-600/20 flex items-center justify-center mb-4">
            <Trophy className="w-8 h-8 text-blue-400" />
          </div>

          <p className="text-gray-400 text-sm mb-1">
            <span className="text-white font-semibold">{commissioner?.username || "Someone"}</span> invited you to join
          </p>
          <h2 className="text-white text-xl font-bold mb-4">{league.name}</h2>

          <div className="w-full bg-gray-800/60 rounded-xl p-3 mb-6 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">Format</span>
              <span className="text-white font-medium">{league.type || "Redraft"}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">Scoring</span>
              <span className="text-white font-medium">{league.scoringFormat || "Roto"}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">Teams</span>
              <span className="text-white font-medium flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-gray-400" />
                {humanTeams.length} / {maxTeams}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">Draft</span>
              <span className="text-white font-medium">
                {league.draftStatus === "completed" ? "Completed" :
                 league.draftStatus === "active" ? "In Progress" :
                 league.draftDate ? new Date(league.draftDate).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) :
                 "Not Scheduled"}
              </span>
            </div>
          </div>

          {isFull ? (
            <>
              <p className="text-red-400 text-sm mb-4">This league is full.</p>
              <Button onClick={() => setLocation("/")} className="w-full bg-gray-700 hover:bg-gray-600 text-white rounded-xl h-11">
                Go Home
              </Button>
            </>
          ) : (
            <div className="flex gap-3 w-full">
              <Button
                onClick={() => setLocation("/")}
                variant="outline"
                className="flex-1 border-gray-600 text-gray-300 hover:bg-gray-800 hover:text-white rounded-xl h-11"
              >
                Decline
              </Button>
              <Button
                onClick={() => joinMutation.mutate()}
                disabled={joinMutation.isPending}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white rounded-xl h-11 font-semibold"
              >
                {joinMutation.isPending ? "Joining..." : "Accept"}
              </Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
