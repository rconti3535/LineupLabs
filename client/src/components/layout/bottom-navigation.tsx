import { useLocation } from "wouter";
import { Home, Users, User, TrendingUp } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";

export function BottomNavigation() {
  const [location] = useLocation();
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated || location === "/login" || location === "/signup" || location.match(/^\/league\/\d+\/draft$/)) {
    return null;
  }

  const navItems = [
    { path: "/teams", icon: Users, label: "Teams" },
    { path: "/messages", icon: TrendingUp, label: "Exposure" },
    { path: "/", icon: Home, label: "Rank" },
    { path: "/profile", icon: User, label: "Profile" },
  ];
  const activeIndex = navItems.findIndex(({ path }) => path === location);

  return (
    <nav className="fixed bottom-0 left-1/2 transform -translate-x-1/2 w-full max-w-md sleeper-bg border-t sleeper-border px-3 py-2 z-50">
      <div className="relative flex items-center">
        {activeIndex >= 0 && (
          <div
            className="absolute top-0 bottom-0 nav-item-active rounded-lg transition-transform duration-300 ease-out"
            style={{
              width: "25%",
              transform: `translateX(${activeIndex * 100}%)`,
            }}
          />
        )}

        {navItems.map(({ path, icon: Icon, label }) => {
          const isActive = location === path;
          return (
            <div key={path} className="flex items-center flex-1 relative z-10">
              <Link href={path} className="flex-1">
                <button
                  className={`flex flex-col items-center py-2.5 px-3 rounded-lg transition-all duration-200 w-full ${
                    isActive ? "" : "hover:bg-slate-800 hover:bg-opacity-50"
                  }`}
                >
                  <Icon
                    className={`mb-1 h-5 w-5 ${
                      isActive ? "text-white" : "text-gray-400"
                    }`}
                  />
                  <span
                    className={`text-xs font-medium ${
                      isActive ? "text-white" : "text-gray-400"
                    }`}
                  >
                    {label}
                  </span>
                </button>
              </Link>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
