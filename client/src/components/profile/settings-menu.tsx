import { User, Bell, Shield, HelpCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function SettingsMenu() {
  const handleEditProfile = () => {
    console.log("Edit profile clicked");
  };

  const handleNotifications = () => {
    console.log("Notifications clicked");
  };

  const handlePrivacy = () => {
    console.log("Privacy clicked");
  };

  const handleHelp = () => {
    console.log("Help clicked");
  };

  const menuItems = [
    { icon: User, label: "Edit Profile", onClick: handleEditProfile },
    { icon: Bell, label: "Notifications", onClick: handleNotifications },
    { icon: Shield, label: "Privacy Settings", onClick: handlePrivacy },
    { icon: HelpCircle, label: "Help & Support", onClick: handleHelp },
  ];

  return (
    <div className="space-y-3 mb-8">
      {menuItems.map(({ icon: Icon, label, onClick }) => (
        <Card key={label} className="sleeper-card-bg rounded-lg sleeper-border border-0">
          <Button
            variant="ghost"
            className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-700 h-auto"
            onClick={onClick}
          >
            <div className="flex items-center space-x-3">
              <Icon className="h-5 w-5 text-gray-400" />
              <span className="text-white font-medium">{label}</span>
            </div>
            <svg
              className="w-4 h-4 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </Button>
        </Card>
      ))}
    </div>
  );
}
