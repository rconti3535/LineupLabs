import { FeaturedLeagues } from "@/components/home/featured-leagues";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";

export default function JoinPublic() {
  const [, setLocation] = useLocation();

  const handleBack = () => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    setLocation("/teams");
  };

  return (
    <div className="px-4 py-6">
      <div className="flex items-center gap-2 mb-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={handleBack}
          className="h-8 w-8 text-gray-300 hover:text-white hover:bg-white/5"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-lg font-semibold text-white">Public League</h1>
      </div>
      <FeaturedLeagues title={null} />
    </div>
  );
}
