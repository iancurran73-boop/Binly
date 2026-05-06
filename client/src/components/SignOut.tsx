import { useState } from "react";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { clearVisitorId } from "@/lib/visitor";
import { queryClient } from "@/lib/queryClient";

/**
 * Sign out: forget the local visitor id and clear cached queries.
 * Household data is NOT deleted server-side — the user can sign back in
 * on this device (or another) using the magic-link flow.
 */
export function SignOut() {
  const [, setLocation] = useLocation();
  const [confirming, setConfirming] = useState(false);

  function doSignOut() {
    clearVisitorId();
    queryClient.clear();
    // Hard navigation so any in-memory React state is wiped too.
    window.location.href = "/";
  }

  return (
    <Card className="rounded-3xl p-6">
      <div className="flex items-start gap-4">
        <div className="h-10 w-10 rounded-2xl bg-muted text-muted-foreground grid place-items-center shrink-0">
          <LogOut className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-display font-semibold">Sign out of this device</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Forgets you on this browser. Your bin life stays safe — pop your email into the magic-link box above to come back any time.
          </p>

          {!confirming ? (
            <Button
              onClick={() => setConfirming(true)}
              variant="outline"
              className="mt-4 rounded-full clay-press"
              data-testid="button-sign-out"
            >
              Sign out
            </Button>
          ) : (
            <div className="mt-4 flex flex-wrap gap-3">
              <Button
                onClick={doSignOut}
                variant="destructive"
                className="rounded-full clay-press"
                data-testid="button-sign-out-confirm"
              >
                Yes, sign me out
              </Button>
              <Button
                onClick={() => setConfirming(false)}
                variant="ghost"
                className="rounded-full clay-press"
                data-testid="button-sign-out-cancel"
              >
                Stay signed in
              </Button>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
