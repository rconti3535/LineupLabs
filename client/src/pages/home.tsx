import { QuickActions } from "@/components/home/quick-actions";
import { RecentActivity } from "@/components/home/recent-activity";
import { FeaturedLeagues } from "@/components/home/featured-leagues";

export default function Home() {
  return (
    <div className="px-4 py-6">
      {/* Welcome Section */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white mb-2">Welcome Back!</h2>
        <p className="text-gray-400">Ready to dominate this baseball season?</p>
      </div>

      <QuickActions />
      <RecentActivity />
      <FeaturedLeagues />
    </div>
  );
}
