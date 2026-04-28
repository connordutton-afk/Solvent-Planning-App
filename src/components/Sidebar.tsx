import React from 'react';
import { Calendar as CalendarIcon, Wallet, Briefcase, LogOut, ChevronRight, GraduationCap, Settings } from 'lucide-react';
import { View } from '../types';
import { useAuth } from './Auth';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';

interface SidebarProps {
  activeView: View;
  onViewChange: (view: View) => void;
}

export function Sidebar({ activeView, onViewChange }: SidebarProps) {
  const { profile, signOut } = useAuth();

  const menuItems = [
    { view: View.CALENDAR, label: 'Schedule', icon: CalendarIcon },
    { view: View.WORK, label: 'Work', icon: Briefcase },
    { view: View.FINANCE, label: 'Finance', icon: Wallet },
    { view: View.SCHOOL, label: 'School', icon: GraduationCap },
    { view: View.SETTINGS, label: 'Settings', icon: Settings },
  ];

  const primaryColor = profile?.theme?.primaryColor || '#18181b';
  const fontFamily = profile?.theme?.fontFamily || '"Inter", sans-serif';

  return (
    <div 
      className="w-64 h-screen bg-white border-r border-zinc-200 flex flex-col p-4"
      style={{ fontFamily }}
    >
      <div className="px-2 py-6">
        <h1 className="text-2xl font-bold italic tracking-tighter text-zinc-900" style={{ fontFamily: '"JetBrains Mono", monospace' }}>SOLVENT</h1>
      </div>

      <nav className="flex-1 space-y-1 mt-4">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.view;
          
          return (
            <button
              key={item.view}
              onClick={() => onViewChange(item.view)}
              className={cn(
                "w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all group outline-none",
                isActive 
                  ? "text-white shadow-md shadow-zinc-200" 
                  : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
              )}
              style={isActive ? { backgroundColor: primaryColor } : {}}
            >
              <div className="flex items-center gap-3">
                <Icon className={cn("w-5 h-5", isActive ? "text-white" : "text-zinc-400 group-hover:text-zinc-900")} />
                <span className="font-medium">{item.label}</span>
              </div>
              {isActive && (
                <motion.div layoutId="sidebar-indicator">
                  <ChevronRight className="w-4 h-4 opacity-50" />
                </motion.div>
              )}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-zinc-100 pt-4 space-y-4">
        <div className="px-3 py-2">
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-1">Balance</p>
          <p className="text-xl font-bold font-mono text-zinc-900">
            ${profile?.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
        </div>

        <button
          onClick={signOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 text-zinc-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
        >
          <LogOut className="w-5 h-5" />
          <span className="font-medium text-sm">Sign Out</span>
        </button>
      </div>
    </div>
  );
}
