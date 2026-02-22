import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export function QuickActions() {
  const [, setLocation] = useLocation();

  const handleCreateLeague = () => {
    setLocation("/create-league");
  };

  const handleJoinPublicLeague = () => {
    const el = document.getElementById("public-leagues");
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  const handleMockDraft = () => {
    // TODO: Implement mock draft functionality
    console.log("Mock draft clicked");
  };

  return (
    <div className="flex flex-col gap-3 mb-8">
      <Button
        onClick={handleCreateLeague}
        className="primary-gradient rounded-xl px-6 py-3 text-white font-medium hover:opacity-90 transition-opacity w-full"
      >
        Create League
      </Button>
      
      <Button
        onClick={handleJoinPublicLeague}
        className="bg-green-600 hover:bg-green-700 rounded-xl px-6 py-3 text-white font-medium transition-colors w-full"
      >
        Search Public Leagues
      </Button>

      <Button
        onClick={handleMockDraft}
        className="bg-blue-600 hover:bg-blue-700 rounded-xl px-6 py-3 text-white font-medium transition-colors w-full"
      >
        Mock Drafts
      </Button>
    </div>
  );
}
