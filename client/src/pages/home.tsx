import { QuickActions } from "@/components/home/quick-actions";
import { RecentActivity } from "@/components/home/recent-activity";
import { FeaturedLeagues } from "@/components/home/featured-leagues";

export default function Home() {
  return (
    <div className="px-4 py-6">
      {/* Hero Section */}
      <div className="mb-8 text-center">
        <h2 className="text-2xl font-bold text-white mb-2">Fantasy baseball, the way it should be.</h2>
      </div>

      <QuickActions />
      <RecentActivity />
      <FeaturedLeagues />
    </div>
  );
}
