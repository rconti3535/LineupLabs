import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Header() {
  return (
    <header className="sleeper-bg border-b sleeper-border px-4 py-3 flex items-center justify-between sticky top-0 z-40">
      <div className="flex items-center space-x-3">
        <div className="w-8 h-8 primary-gradient rounded-lg flex items-center justify-center">
          <svg
            viewBox="0 0 24 24"
            className="w-4 h-4 text-white"
            fill="currentColor"
          >
            <path d="M12 2C13.1 2 14 2.9 14 4C14 5.1 13.1 6 12 6C10.9 6 10 5.1 10 4C10 2.9 10.9 2 12 2ZM21 9V7L15 4L13.5 3.5C13.1 3.4 12.6 3.4 12.2 3.5L7 5.3L3 7V9L7 7.1L12 9L17 7.1L21 9ZM7.5 17.5L9 16L7.5 14.5L6 16L7.5 17.5ZM12 13.5C11.2 13.5 10.5 14.2 10.5 15S11.2 16.5 12 16.5 13.5 15.8 13.5 15 12.8 13.5 12 13.5ZM16.5 17.5L18 16L16.5 14.5L15 16L16.5 17.5Z" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-white">FantasyBall</h1>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="w-8 h-8 sleeper-card-bg rounded-lg hover:bg-slate-700"
      >
        <Bell className="h-4 w-4 text-gray-300" />
      </Button>
    </header>
  );
}
