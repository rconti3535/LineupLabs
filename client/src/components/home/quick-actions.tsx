import { Button } from "@/components/ui/button";

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
    <div className="flex gap-3 mb-8">
      <Button
        onClick={handleCreateLeague}
        className="primary-gradient rounded-xl px-6 py-3 text-white font-medium hover:opacity-90 transition-opacity"
      >
        Create League
      </Button>
      
      <Button
        onClick={handleJoinPublicLeague}
        className="bg-green-600 hover:bg-green-700 rounded-xl px-6 py-3 text-white font-medium transition-colors"
      >
        Join Public League
      </Button>
    </div>
  );
}
