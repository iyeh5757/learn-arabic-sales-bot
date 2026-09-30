"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { CONFIGURATION_REQUIRED } from "@/lib/reps";
import { SHIFTS_EVENT } from "./shifts";

export function ShiftBanner() {
  const pathname = usePathname();
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch("/api/shifts")
        .then((response) => response.json())
        .then((data: { status?: string }) => {
          if (!cancelled) setStatus(data.status ?? null);
        })
        .catch(() => {
          if (!cancelled) setStatus(null);
        });
    };
    load();
    window.addEventListener(SHIFTS_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(SHIFTS_EVENT, load);
    };
  }, [pathname]);

  if (status !== CONFIGURATION_REQUIRED) return null;
  return (
    <div className="banner" role="status">
      <strong>{CONFIGURATION_REQUIRED}</strong>
      <span>No rep shifts are saved. Add them in Admin before using the roster for handoff.</span>
    </div>
  );
}
