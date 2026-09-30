"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ESCALATION } from "@/lib/reps";

const LINKS = [
  { href: "/", label: "Assist" },
  { href: "/leads", label: "Leads" },
  { href: "/admin", label: "Admin" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <aside className="sidebar">
      <div className="brand">
        <p className="arabic">تعلّم العربية</p>
        <p className="brand-name">Learn Arabic Academy</p>
        <p className="brand-sub">Sales desk · Mode A</p>
      </div>
      <nav className="nav" aria-label="Desk">
        {LINKS.map((link) => {
          const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={active ? "active" : undefined}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
      <p className="side-foot">
        Escalation
        <br />
        {ESCALATION.name}
        <br />
        <a href={`tel:${ESCALATION.phone}`}>{ESCALATION.phone}</a>
      </p>
    </aside>
  );
}
