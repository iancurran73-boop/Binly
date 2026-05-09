import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const TIME_OPTIONS = [
  { value: "17:00", label: "5pm" },
  { value: "18:00", label: "6pm" },
  { value: "19:00", label: "7pm" },
  { value: "20:00", label: "8pm" },
  { value: "21:00", label: "9pm" },
  { value: "22:00", label: "10pm" },
];

function normalize(t: string | undefined | null): string {
  if (!t) return "20:00";
  const m = /^(\d{2}):(\d{2})/.exec(t);
  return m ? `${m[1]}:${m[2]}` : "20:00";
}

export function NudgeTime() {
  const { toast } = useToast();
  const [selected, setSelected] = useState<string>("20:00");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/notification-prefs", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => {
        if (p?.notify_time) setSelected(normalize(p.notify_time));
      })
      .catch(() => {});
  }, []);

  async function save(value: string) {
    setSelected(value);
    setBusy(true);
    try {
      await apiRequest("PATCH", "/api/notification-prefs", { notify_time: value });
      toast({ title: "Saved.", description: `Night-before nudge set to ${TIME_OPTIONS.find((o) => o.value === value)?.label || value}.` });
    } catch (err: any) {
      toast({ title: "Couldn't save", description: err?.message || "Try again in a sec.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="rounded-3xl p-6">
      <div className="flex items-start gap-4">
        <div className="h-10 w-10 rounded-2xl bg-accent/15 text-accent grid place-items-center shrink-0">
          <Clock className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-display font-semibold">Nudge time</h2>
          <p className="text-sm text-muted-foreground mt-1">
            When the night-before nudge lands. Pick the moment you'd actually remember.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {TIME_OPTIONS.map((opt) => {
              const active = opt.value === selected;
              return (
                <Button
                  key={opt.value}
                  onClick={() => save(opt.value)}
                  disabled={busy}
                  variant={active ? "default" : "outline"}
                  className="rounded-full clay-press"
                  data-testid={`button-nudge-${opt.value}`}
                >
                  {opt.label}
                </Button>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
}
