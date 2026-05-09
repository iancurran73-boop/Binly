import { Link, useLocation } from "wouter";
import { Logo } from "@/components/Logo";
import { Menu, X } from "lucide-react";
import { useState } from "react";

const ITEMS = [
  { href: "/dashboard", label: "Bins" },
  { href: "/items", label: "Lookup" },
  { href: "/rules", label: "Rules" },
  { href: "/achievements", label: "Trophies" },
  { href: "/households", label: "Flatmates" },
  { href: "/wrapped", label: "Wrapped" },
  { href: "/lab", label: "Lab" },
  { href: "/settings", label: "Settings" },
];

export function Nav() {
  const [loc] = useLocation();
  const [open, setOpen] = useState(false);

  return (
    <header className="px-6 md:px-10 pt-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <Link href="/" data-testid="link-home">
          <span className="cursor-pointer inline-flex items-center"><Logo className="h-8" /></span>
        </Link>
        <nav className="hidden md:flex gap-1 text-sm">
          {ITEMS.map((it) => {
            const active = loc === it.href || (it.href === "/dashboard" && loc === "/");
            return (
              <Link key={it.href} href={it.href} data-testid={`link-${it.label.toLowerCase()}`}>
                <span
                  className={`cursor-pointer px-3 py-1.5 rounded-full hover-elevate ${
                    active ? "font-semibold text-primary" : "text-foreground/80"
                  }`}
                >
                  {it.label}
                </span>
              </Link>
            );
          })}
        </nav>
        <button
          className="md:hidden h-10 w-10 grid place-items-center rounded-full hover-elevate"
          onClick={() => setOpen((o) => !o)}
          aria-label="Toggle menu"
          data-testid="button-mobile-menu"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      {open && (
        <nav className="md:hidden mt-3 flex flex-col gap-1 bg-card border border-card-border rounded-2xl p-2">
          {ITEMS.map((it) => {
            const active = loc === it.href;
            return (
              <Link key={it.href} href={it.href}>
                <span
                  className={`block cursor-pointer px-3 py-2 rounded-xl hover-elevate text-sm ${
                    active ? "font-semibold text-primary" : "text-foreground"
                  }`}
                  onClick={() => setOpen(false)}
                  data-testid={`link-mobile-${it.label.toLowerCase()}`}
                >
                  {it.label}
                </span>
              </Link>
            );
          })}
        </nav>
      )}
    </header>
  );
}
