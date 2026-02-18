import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BottomNavigation } from "@/components/layout/bottom-navigation";
import { useAuth, AuthProvider } from "@/hooks/useAuth";
import Home from "@/pages/home";
import Teams from "@/pages/teams";
import Profile from "@/pages/profile";
import Messages from "@/pages/messages";
import CreateLeague from "@/pages/create-league";
import Signup from "@/pages/signup";
import Login from "@/pages/login";
import ResetPassword from "@/pages/reset-password";
import LeaguePage from "@/pages/league";
import DraftRoom from "@/pages/draft-room";
import Landing from "@/pages/landing";
import NotFound from "@/pages/not-found";

function LeagueJoinRedirect({ params }: { params: { id: string } }) {
  return <Redirect to={`/league/${params.id}`} />;
}

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <Switch>
      <Route path="/signup" component={Signup} />
      <Route path="/login" component={Login} />
      <Route path="/reset-password" component={ResetPassword} />
      {isAuthenticated ? (
        <>
          <Route path="/" component={Home} />
          <Route path="/teams" component={Teams} />
          <Route path="/messages" component={Messages} />
          <Route path="/profile" component={Profile} />
          <Route path="/create-league" component={CreateLeague} />
          <Route path="/league/:id/join" component={LeagueJoinRedirect} />
          <Route path="/league/:id/draft" component={DraftRoom} />
          <Route path="/league/:id" component={LeaguePage} />
        </>
      ) : (
        <>
          <Route path="/league/:id/join">{(params) => <Redirect to={`/login?redirect=/league/${params.id}`} />}</Route>
          <Route path="/league/:id">{(params) => <Redirect to={`/login?redirect=/league/${params.id}`} />}</Route>
          <Route path="/" component={Landing} />
        </>
      )}
      <Route component={NotFound} />
    </Switch>
  );
}

function AppLayout() {
  const [location] = useLocation();
  const isDraftRoom = /^\/league\/\d+\/draft$/.test(location);

  if (isDraftRoom) {
    return (
      <div className="max-w-md mx-auto sleeper-bg relative">
        <Router />
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen flex flex-col max-w-md mx-auto sleeper-bg relative hide-scrollbar">
        <main className="flex-1 pb-16 hide-scrollbar">
          <Router />
        </main>
        <BottomNavigation />
      </div>
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <AppLayout />
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
