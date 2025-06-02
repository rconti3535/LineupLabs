import { Plus, Users } from "lucide-react";
import { Card } from "@/components/ui/card";

export function QuickActions() {
  const handleCreateLeague = () => {
    // TODO: Implement create league modal/flow
    console.log("Create league clicked");
  };

  const handleJoinPublicLeague = () => {
    // TODO: Implement join public league flow
    console.log("Join public league clicked");
  };

  return (
    <div className="grid gap-4 mb-8">
      {/* Create League Card */}
      <Card 
        className="gradient-card rounded-xl p-6 hover-lift cursor-pointer border-0"
        onClick={handleCreateLeague}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="w-12 h-12 primary-gradient rounded-xl flex items-center justify-center">
            <Plus className="text-white h-6 w-6" />
          </div>
          <svg
            className="w-5 h-5 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-white mb-2">Create a League</h3>
        <p className="text-gray-400 text-sm">Start your own fantasy baseball league with friends</p>
      </Card>

      {/* Join Public League Card */}
      <Card 
        className="gradient-card rounded-xl p-6 hover-lift cursor-pointer border-0"
        onClick={handleJoinPublicLeague}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="w-12 h-12 bg-green-600 rounded-xl flex items-center justify-center">
            <Users className="text-white h-6 w-6" />
          </div>
          <svg
            className="w-5 h-5 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-white mb-2">Join Public League</h3>
        <p className="text-gray-400 text-sm">Find and join competitive public leagues</p>
      </Card>
    </div>
  );
}
