"use client";

import { Activity, BarChart3, Bot, Boxes, Gauge, ListChecks, Moon, Sun } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

const nav = [
  { href: "/", label: "Overview", icon: Gauge },
  { href: "/intents", label: "Intents", icon: ListChecks },
  { href: "/batches", label: "Batches", icon: Boxes },
  { href: "/benchmark", label: "Gas Curve", icon: BarChart3 }
];

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const stored = window.localStorage.getItem("sc6109-theme");
    const nextTheme = stored === "light" ? "light" : "dark";
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
  }, []);

  function toggleTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem("sc6109-theme", nextTheme);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <Bot size={18} aria-hidden="true" />
          </span>
          <span className="brand-text">
            <span>Intent Batcher</span>
            <span className="brand-subtitle">SC6109 dashboard</span>
          </span>
        </div>
        <nav className="nav" aria-label="Dashboard">
          {nav.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link key={item.href} className={`nav-link ${active ? "active" : ""}`} href={item.href}>
                <Icon size={17} aria-hidden="true" />
                <span className="nav-label">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className="main">
        <div className="topbar">
          <div className="status-cluster">
            <span className="status-pill">
              <span className="status-dot" aria-hidden="true" />
              Sepolia
            </span>
            <span className="status-pill">Shape A MVP</span>
            <span className="status-pill">
              <Activity size={14} aria-hidden="true" />
              Chain read enabled
            </span>
          </div>
          <button className="status-pill theme-toggle" type="button" onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>
            {theme === "dark" ? <Moon size={14} aria-hidden="true" /> : <Sun size={14} aria-hidden="true" />}
            {theme === "dark" ? "Dark" : "Light"}
          </button>
        </div>
        {children}
      </main>
    </div>
  );
}
