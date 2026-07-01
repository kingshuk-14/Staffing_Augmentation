import React, { useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { Home, Upload, FileText, LogOut, Briefcase, Users, UserCheck, Building2, Loader2, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

export function SidebarLayout() {
  const location = useLocation();

  // Retrieve signed in user information
  const userStr = localStorage.getItem("user");
  const user = userStr ? JSON.parse(userStr) : null;
  const userName = user ? `${user.first_name} ${user.last_name}` : "System Admin";
  const userRole = user ? user.role : "recruiter";



  const navItems = [
    { name: "Dashboard", href: "/alphaxine", icon: Home },
    { name: "Jobs Directory", href: "/alphaxine/jobs", icon: Briefcase },
    { name: "Clients Directory", href: "/alphaxine/clients", icon: Building2 },
    { name: "Candidates Manager", href: "/alphaxine/candidates", icon: UserCheck },
    { name: "Parsed Resumes", href: "/alphaxine/resumes", icon: FileText },
    { name: "Vendors Manager", href: "/alphaxine/vendors", icon: Users },
    { name: "Resume Upload", href: "/alphaxine/upload", icon: Upload },
  ];

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Sidebar - Hover Collapsible design */}
      <aside className="w-[72px] hover:w-64 bg-gradient-to-b from-[#F55036] to-[#c9381f] flex flex-col shadow-xl transition-all duration-300 ease-in-out group/sidebar overflow-hidden shrink-0 z-20">
        <div className="h-20 flex items-center px-4 border-b border-white/15 overflow-hidden">
          <div className="flex items-center gap-3 text-white min-w-0">
            <div className="size-10 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center overflow-hidden border border-white/10 shrink-0">
              <img src="/alphaxine_logo.png" alt="Alphaxine Logo" className="w-full h-full object-contain" />
            </div>
            <div className="flex flex-col min-w-0 opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-300 ease-in-out">
              <span className="text-sm font-bold truncate leading-tight">{userName}</span>
              <span className="text-[10px] text-white/60 font-semibold uppercase tracking-wider mt-0.5">{userRole}</span>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3.5 py-5 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 overflow-hidden",
                  isActive
                    ? "bg-white/20 text-white shadow-sm backdrop-blur-sm"
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                )}
              >
                <item.icon className={cn("size-5 shrink-0", isActive ? "text-white" : "text-white/60")} />
                <span className="opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-300 ease-in-out truncate font-semibold">
                  {item.name}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="p-3.5 border-t border-white/15 overflow-hidden flex flex-col space-y-1">
          <Link
            to="/alphaxine/profile"
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 overflow-hidden",
              location.pathname === "/alphaxine/profile"
                ? "bg-white/20 text-white shadow-sm backdrop-blur-sm"
                : "text-white/70 hover:bg-white/10 hover:text-white"
            )}
          >
            <Settings className={cn("size-5 shrink-0", location.pathname === "/alphaxine/profile" ? "text-white" : "text-white/60")} />
            <span className="opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-300 ease-in-out truncate font-semibold">
              Profile Settings
            </span>
          </Link>
          <Link
            to="/"
            onClick={() => {
              localStorage.removeItem("token");
              localStorage.removeItem("user");
            }}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white transition-all duration-200"
          >
            <LogOut className="size-5 text-white/50 shrink-0" />
            <span className="opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-300 ease-in-out truncate font-semibold">
              Log out
            </span>
          </Link>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
