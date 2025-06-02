import { Trophy, Star } from "lucide-react";
import { Card } from "@/components/ui/card";

export function Achievements() {
  const achievements = [
    {
      id: 1,
      icon: Trophy,
      title: "League Champion",
      description: "Won Championship Series 2024",
      color: "bg-yellow-500",
    },
    {
      id: 2,
      icon: Star,
      title: "Perfect Week",
      description: "Scored highest points in week 5",
      color: "bg-blue-500",
    },
  ];

  return (
    <div className="mt-8">
      <h3 className="text-lg font-semibold text-white mb-4">Recent Achievements</h3>
      <div className="space-y-3">
        {achievements.map((achievement) => (
          <Card key={achievement.id} className="sleeper-card-bg rounded-lg p-4 sleeper-border border flex items-center space-x-3">
            <div className={`w-10 h-10 ${achievement.color} rounded-full flex items-center justify-center`}>
              <achievement.icon className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-white font-medium">{achievement.title}</p>
              <p className="text-gray-400 text-sm">{achievement.description}</p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
