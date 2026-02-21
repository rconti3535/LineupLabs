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
    { path: "/", icon: Home, label: "Home" },
    { path: "/teams", icon: Users, label: "Teams" },
    { path: "/messages", icon: TrendingUp, label: "Exposure" },
    { path: "/profile", icon: User, label: "Profile" },
  ];

  return (
    <nav className="fixed bottom-0 left-1/2 transform -translate-x-1/2 w-full max-w-md sleeper-bg border-t sleeper-border px-3 py-2">
      <div className="flex items-center">
        {navItems.map(({ path, icon: Icon, label }, index) => {
          const isActive = location === path;
          return (
            <div key={path} className="flex items-center flex-1">
              <Link href={path} className="flex-1">
                <button
                  className={`flex flex-col items-center py-2.5 px-3 rounded-lg transition-all duration-200 w-full ${
                    isActive
                      ? "nav-item-active"
                      : "hover:bg-slate-800 hover:bg-opacity-50"
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
              {index < navItems.length - 1 && (
                <div className="w-px h-9 bg-gray-600 mx-1"></div>
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
}
