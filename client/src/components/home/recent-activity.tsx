import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { Activity } from "@shared/schema";

export function RecentActivity() {
  const { data: activities, isLoading } = useQuery<Activity[]>({
    queryKey: ["/api/activities/user/1"], // Using user ID 1 for demo
  });

  return (
    <div className="mb-6">
      <h3 className="text-lg font-semibold text-white mb-4">Recent Activity</h3>
      
      <div className="space-y-3">
        {isLoading ? (
          Array.from({ length: 2 }).map((_, i) => (
            <Card key={i} className="sleeper-card-bg rounded-lg p-4 sleeper-border border">
              <div className="flex items-center space-x-3">
                <Skeleton className="w-10 h-10 rounded-full" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-48 mb-2" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
            </Card>
          ))
        ) : activities && activities.length > 0 ? (
          activities.map((activity) => (
            <Card key={activity.id} className="sleeper-card-bg rounded-lg p-4 sleeper-border border">
              <div className="flex items-center space-x-3">
                <img
                  src={activity.avatar || "https://images.unsplash.com/photo-1566577739112-5180d4bf9390?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=60&h=60"}
                  alt="Activity avatar"
                  className="w-10 h-10 rounded-full object-cover"
                />
                <div className="flex-1">
                  <p className="text-white text-sm font-medium">{activity.message}</p>
                  <p className="text-gray-400 text-xs">{activity.time}</p>
                </div>
              </div>
            </Card>
          ))
        ) : (
          <Card className="sleeper-card-bg rounded-lg p-6 sleeper-border border text-center">
            <p className="text-gray-400">No recent activity</p>
          </Card>
        )}
      </div>
    </div>
  );
}
