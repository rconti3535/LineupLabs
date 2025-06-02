import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function Landing() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <Card className="gradient-card rounded-xl p-8 w-full max-w-md border-0 text-center">
        <div className="w-16 h-16 primary-gradient rounded-xl flex items-center justify-center mx-auto mb-6">
          <svg
            viewBox="0 0 24 24"
            className="w-8 h-8 text-white"
            fill="currentColor"
          >
            <path d="M12 2C13.1 2 14 2.9 14 4C14 5.1 13.1 6 12 6C10.9 6 10 5.1 10 4C10 2.9 10.9 2 12 2ZM21 9V7L15 4L13.5 3.5C13.1 3.4 12.6 3.4 12.2 3.5L7 5.3L3 7V9L7 7.1L12 9L17 7.1L21 9ZM7.5 17.5L9 16L7.5 14.5L6 16L7.5 17.5ZM12 13.5C11.2 13.5 10.5 14.2 10.5 15S11.2 16.5 12 16.5 13.5 15.8 13.5 15 12.8 13.5 12 13.5ZM16.5 17.5L18 16L16.5 14.5L15 16L16.5 17.5Z" />
          </svg>
        </div>
        
        <h1 className="text-3xl font-bold text-white mb-3">Fantasy Baseball</h1>
        <p className="text-gray-400 mb-8 leading-relaxed">
          Create and manage your fantasy baseball leagues with friends. Draft players, track stats, and compete for the championship.
        </p>

        <div className="space-y-4">
          <Link href="/login">
            <Button className="w-full primary-gradient rounded-xl py-3 text-white font-medium hover:opacity-90 transition-opacity">
              Sign In
            </Button>
          </Link>

          <div className="flex items-center space-x-4">
            <div className="flex-1 h-px bg-gray-600"></div>
            <span className="text-gray-400 text-sm">or</span>
            <div className="flex-1 h-px bg-gray-600"></div>
          </div>

          <Link href="/signup">
            <Button 
              variant="outline" 
              className="w-full sleeper-card-bg sleeper-border border rounded-xl py-3 text-white font-medium hover:bg-gray-800 transition-colors"
            >
              Create Account
            </Button>
          </Link>
        </div>

        <div className="mt-8 pt-6 border-t border-gray-700">
          <p className="text-gray-500 text-xs">
            Join thousands of fantasy baseball managers competing in leagues worldwide
          </p>
        </div>
      </Card>
    </div>
  );
}