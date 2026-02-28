import { FeaturedLeagues } from "@/components/home/featured-leagues";
import { Button } from "@/components/ui/button";
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
      <Button
        variant="ghost"
        onClick={handleBack}
        className="mb-4 px-0 text-gray-300 hover:text-white hover:bg-transparent"
      >
        Back
      </Button>
      <FeaturedLeagues title="Public Leagues" />
    </div>
  );
}
