import { useState, useEffect } from 'react';
import { AuthProvider, AuthGuard } from './components/Auth';
import { Sidebar } from './components/Sidebar';
import { CalendarView } from './components/views/CalendarView';
import { WorkView } from './components/views/WorkView';
import { FinanceView } from './components/views/FinanceView';
import { SchoolView } from './components/views/SchoolView';
import { SettingsView } from './components/views/SettingsView';
import { View } from './types';
import { useAuth } from './components/Auth';
import { motion, AnimatePresence } from 'motion/react';

function AppContent() {
  const [activeView, setActiveView] = useState<View>(View.CALENDAR);
  const { profile } = useAuth();

  useEffect(() => {
    if (!profile?.clickSoundUrl) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const isInteractive = target.closest('button, a, input[type="checkbox"], input[type="radio"], [role="button"]');
      
      if (isInteractive) {
        const audio = new Audio(profile.clickSoundUrl);
        audio.volume = 0.5;
        audio.play().catch(() => {}); // Ignore errors if played too fast or blocked
      }
    };

    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [profile?.clickSoundUrl]);

  const renderView = () => {
    switch (activeView) {
      case View.CALENDAR:
        return <CalendarView />;
      case View.WORK:
        return <WorkView />;
      case View.FINANCE:
        return <FinanceView />;
      case View.SCHOOL:
        return <SchoolView />;
      case View.SETTINGS:
        return <SettingsView />;
      default:
        return <CalendarView />;
    }
  };

  const themeStyle = {
    fontFamily: profile?.theme?.fontFamily || '"Inter", sans-serif',
  };

  return (
    <div className="flex h-screen bg-zinc-50 overflow-hidden" style={themeStyle}>
      <Sidebar activeView={activeView} onViewChange={setActiveView} />
      
      <main className="flex-1 relative overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeView}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="h-full p-8"
          >
            {renderView()}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AuthGuard>
        <AppContent />
      </AuthGuard>
    </AuthProvider>
  );
}
