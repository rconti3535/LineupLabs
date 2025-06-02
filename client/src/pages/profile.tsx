import { useQuery } from "@tanstack/react-query";
import { ProfileHeader } from "@/components/profile/profile-header";
import { SettingsMenu } from "@/components/profile/settings-menu";
import { Achievements } from "@/components/profile/achievements";
import { Skeleton } from "@/components/ui/skeleton";
import type { User } from "@shared/schema";

export default function Profile() {
  const { data: user, isLoading } = useQuery<User>({
    queryKey: ["/api/users/1"], // Using user ID 1 for demo
  });

  if (isLoading) {
    return (
      <div className="px-4 py-6">
        <div className="gradient-card rounded-xl p-6 mb-6">
          <div className="flex items-center space-x-4 mb-4">
            <Skeleton className="w-16 h-16 rounded-full" />
            <div>
              <Skeleton className="h-6 w-32 mb-2" />
              <Skeleton className="h-4 w-48" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 text-center">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i}>
                <Skeleton className="h-8 w-8 mx-auto mb-2" />
                <Skeleton className="h-4 w-16 mx-auto" />
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="px-4 py-6">
        <div className="gradient-card rounded-xl p-8 text-center">
          <p className="text-gray-400">User not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6">
      <ProfileHeader user={user} />
      <SettingsMenu />
      <Achievements />
    </div>
  );
}
