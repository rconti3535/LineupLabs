import { ArrowRightLeft, Handshake } from "lucide-react";
import { Button } from "@/components/ui/button";

export function QuickTeamActions() {
  const handleWaiverWire = () => {
    // TODO: Implement waiver wire functionality
    console.log("Waiver wire clicked");
  };

  const handleTrades = () => {
    // TODO: Implement trades functionality
    console.log("Trades clicked");
  };

  return (
    <div className="mt-8">
      <h3 className="text-lg font-semibold text-white mb-4">Quick Actions</h3>
      <div className="grid grid-cols-2 gap-3">
        <Button
          variant="ghost"
          className="sleeper-card-bg sleeper-border border rounded-lg p-4 h-auto flex-col gap-2 hover:bg-slate-700"
          onClick={handleWaiverWire}
        >
          <ArrowRightLeft className="text-blue-400 h-6 w-6" />
          <span className="text-white text-sm font-medium">Waiver Wire</span>
        </Button>
        <Button
          variant="ghost"
          className="sleeper-card-bg sleeper-border border rounded-lg p-4 h-auto flex-col gap-2 hover:bg-slate-700"
          onClick={handleTrades}
        >
          <Handshake className="text-green-500 h-6 w-6" />
          <span className="text-white text-sm font-medium">Trades</span>
        </Button>
      </div>
    </div>
  );
}
