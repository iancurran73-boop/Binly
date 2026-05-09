import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/Landing";
import Onboard from "@/pages/Onboard";
import Welcome from "@/pages/Welcome";
import Dashboard from "@/pages/Dashboard";
import Items from "@/pages/Items";
import Settings from "@/pages/Settings";
import Achievements from "@/pages/Achievements";
import Households from "@/pages/Households";
import Wrapped from "@/pages/Wrapped";
import Rules from "@/pages/Rules";
import Verify from "@/pages/Verify";

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/onboard" component={Onboard} />
      <Route path="/welcome" component={Welcome} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/items" component={Items} />
      <Route path="/achievements" component={Achievements} />
      <Route path="/households" component={Households} />
      <Route path="/wrapped" component={Wrapped} />
      <Route path="/rules" component={Rules} />
      <Route path="/settings" component={Settings} />
      <Route path="/verify/:token" component={Verify} />
      <Route path="/verify" component={Verify} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router hook={useHashLocation}>
          <AppRouter />
        </Router>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
