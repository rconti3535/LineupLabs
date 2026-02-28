import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export default function Home() {
  const [, setLocation] = useLocation();

  return (
    <div className="px-4 py-6">
      <div className="mb-8 text-center">
        <h2 className="text-2xl font-bold text-white mb-2">Join</h2>
        <p className="text-sm text-gray-300">Choose how you want to start</p>
      </div>

      <div className="flex flex-col gap-3">
        <Button
          onClick={() => setLocation("/create-league")}
          className="primary-gradient rounded-xl px-6 py-3 text-white font-medium hover:opacity-90 transition-opacity w-full"
        >
          Create League
        </Button>

        <Button
          onClick={() => setLocation("/join-public")}
          className="bg-green-600 hover:bg-green-700 rounded-xl px-6 py-3 text-white font-medium transition-colors w-full"
        >
          Join Public
        </Button>
      </div>
    </div>
  );
}
