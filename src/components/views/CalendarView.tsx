import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, Timestamp, deleteDoc, doc, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../Auth';
import { CalendarEvent, EventType } from '../../types';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, addMonths, subMonths, parseISO, isSameDay, differenceInDays } from 'date-fns';
import { ChevronLeft, ChevronRight, Plus, Clock, AlignLeft, X, AlertCircle, Bell, BellRing, Repeat, Calendar as CalendarIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';

import { handleFirestoreError, OperationType } from '../../lib/firestoreUtils';

export function CalendarView() {
  const { user, profile } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isAddingEvent, setIsAddingEvent] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [viewingDate, setViewingDate] = useState<Date | null>(null);
  const [preselectedParentId, setPreselectedParentId] = useState<string | null>(null);
  const [notifiedEvents, setNotifiedEvents] = useState<Set<string>>(new Set());

  // Audio Notification Setup
  const playAlert = () => {
    if (profile?.notificationSoundUrl) {
      const audio = new Audio(profile.notificationSoundUrl);
      audio.play().catch(e => console.warn("Audio play failed", e));
      return;
    }
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(440, audioCtx.currentTime); // A4
      oscillator.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.1);
      
      gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.5, audioCtx.currentTime + 0.05);
      gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.5);
      
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.5);
    } catch (e) {
      console.warn("Audio Context blocked or failed", e);
    }
  };

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'events'),
      where('userId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const eventData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as CalendarEvent[];
      setEvents(eventData);
    });

    return () => unsubscribe();
  }, [user]);

  // Alert Checker
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      events.forEach(event => {
        if (!event.isUrgent) return;
        if (notifiedEvents.has(event.id)) return;

        const startTime = parseISO(event.startTime);
        const diff = startTime.getTime() - now.getTime();
        
        // Alert if event is starting now or within next 1 minute
        if (diff > -60000 && diff < 60000) {
          playAlert();
          setNotifiedEvents(prev => new Set(prev).add(event.id));
          // Use browser notification if possible, otherwise UI alert
          if (Notification.permission === "granted") {
            new Notification(`URGENT: ${event.title}`, { body: event.description });
          } else if (Notification.permission !== "denied") {
            Notification.requestPermission();
          }
        }
      });
    }, 30000); // Check every 30s

    return () => clearInterval(interval);
  }, [events, notifiedEvents]);

  const daysInMonth = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth),
  });

  const getEffectiveEventsForDay = (day: Date) => {
    return events.filter(event => {
      const start = parseISO(event.startTime);
      if (isSameDay(start, day)) return true;
      
      const isPastOrToday = start.getTime() <= day.getTime() || isSameDay(start, day);
      if (!isPastOrToday) return false;

      if (event.recurrence === 'weekly') {
        return start.getDay() === day.getDay();
      }
      if (event.recurrence === 'daily') {
        return true;
      }
      if (event.recurrence === 'weekdays') {
        const d = day.getDay();
        return d >= 1 && d <= 5;
      }
      if (event.recurrence === 'weekends') {
        const d = day.getDay();
        return d === 0 || d === 6;
      }
      if (event.recurrence === 'bi-daily') {
        return differenceInDays(day, start) % 2 === 0;
      }
      if (event.recurrence === 'annually') {
        return day.getMonth() === start.getMonth() && day.getDate() === start.getDate();
      }
      if (event.recurrence === 'monthly') {
        return day.getDate() === start.getDate();
      }
      return false;
    }).sort((a, b) => a.startTime.localeCompare(b.startTime));
  };

  const handleAddEvent = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user || !selectedDate) return;

    const formData = new FormData(e.currentTarget);
    const startTimeV = formData.get('startTime') as string;
    const endTimeV = formData.get('endTime') as string;
    const title = formData.get('title') as string;
    const type = formData.get('type') as EventType;
    const recurrence = formData.get('recurrence') as CalendarEvent['recurrence'];
    const isUrgent = formData.get('isUrgent') === 'on';
    const parentId = formData.get('parentId') as string;

    const start = new Date(selectedDate);
    const [h1, m1] = startTimeV.split(':');
    start.setHours(parseInt(h1), parseInt(m1), 0, 0);

    const end = new Date(selectedDate);
    const [h2, m2] = endTimeV.split(':');
    end.setHours(parseInt(h2), parseInt(m2), 0, 0);

    // Handle end time on next day if it's before start time
    if (end < start) {
      end.setDate(end.getDate() + 1);
    }

    try {
      await addDoc(collection(db, 'events'), {
        userId: user.uid,
        title,
        description: formData.get('description'),
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        type,
        isUrgent,
        recurrence: recurrence || 'none',
        parentId: parentId !== 'none' ? parentId : null,
        createdAt: new Date().toISOString()
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'events');
    }

    setIsAddingEvent(false);
    setViewingDate(null);
    setSelectedDate(null);
    setPreselectedParentId(null);
  };

  const todayEvents = getEffectiveEventsForDay(new Date());

  return (
    <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-4 gap-8">
      {/* Quick Show Card (Sidebar today view) */}
      <div className="lg:col-span-1 space-y-6">
        <div className="bg-zinc-900 rounded-[2rem] p-6 text-white shadow-2xl relative overflow-hidden group">
           <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
             <Clock className="w-24 h-24" />
           </div>
           
           <div className="relative z-10 space-y-6">
             <div>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500 mb-1">Today's Schedule</p>
                <h3 className="text-2xl font-black">{format(new Date(), 'EEEE')}</h3>
                <p className="text-zinc-400 text-sm font-bold uppercase tracking-widest">{format(new Date(), 'MMMM d')}</p>
             </div>

             <div className="space-y-3">
               {todayEvents.length > 0 ? todayEvents.map(event => (
                 <div key={event.id} className="bg-white/5 border border-white/10 p-4 rounded-2xl flex items-start gap-3">
                   <div className={cn(
                     "w-1 h-8 rounded-full mt-1",
                     event.type === EventType.WORK ? "bg-emerald-500" : 
                     event.type === EventType.PERSONAL ? "bg-blue-500" : "bg-amber-500"
                   )} />
                   <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest leading-none mb-1">
                        {format(parseISO(event.startTime), 'p')}
                        {event.isUrgent && <span className="ml-2 text-rose-500">!!!</span>}
                      </p>
                      <h4 className="font-bold text-sm truncate">{event.title}</h4>
                   </div>
                 </div>
               )) : (
                 <div className="text-center py-6 border-2 border-dashed border-white/5 rounded-2xl">
                   <p className="text-xs font-bold text-zinc-600 uppercase tracking-widest">Nothing slotted</p>
                 </div>
               )}
             </div>

             <button 
                onClick={() => {
                  setSelectedDate(new Date());
                  setIsAddingEvent(true);
                }}
                className="w-full bg-white text-zinc-900 font-black py-4 rounded-2xl shadow-xl hover:bg-zinc-100 transition-all uppercase tracking-[0.2em] text-[10px]"
             >
               Quick Slot
             </button>
           </div>
        </div>

        {/* Legend */}
        <div className="bg-white rounded-3xl p-6 border border-zinc-100 shadow-sm space-y-4">
           <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-400">Activity Types</h4>
           <div className="space-y-3 text-xs font-bold">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-emerald-500 rounded-sm" />
                <span>Work / Professional</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-amber-500 rounded-sm" />
                <span>Tasks / Vital</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-blue-500 rounded-sm" />
                <span>Personal / Social</span>
              </div>
           </div>
        </div>
      </div>

      <div className="lg:col-span-3 space-y-8">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold tracking-tight text-zinc-900">
            {format(currentMonth, 'MMMM yyyy')}
          </h2>
          <p className="text-zinc-500">Plan your days and work shifts.</p>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="flex bg-white rounded-lg border border-zinc-200 p-1">
            <button 
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              className="p-1.5 hover:bg-zinc-100 rounded-md transition-colors text-zinc-600"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button 
              onClick={() => setCurrentMonth(new Date())}
              className="px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 rounded-md transition-colors text-zinc-600"
            >
              Today
            </button>
            <button 
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              className="p-1.5 hover:bg-zinc-100 rounded-md transition-colors text-zinc-600"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="grid grid-cols-7 border-b border-zinc-100 bg-zinc-50/50">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="px-4 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wider text-center">
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {/* Calendar Grid Implementation */}
          {daysInMonth.map((day, idx) => {
            const dayEvents = getEffectiveEventsForDay(day);
            const startDayOffset = startOfMonth(currentMonth).getDay();
            const gridStyle = idx === 0 ? { gridColumnStart: startDayOffset + 1 } : {};

            return (
              <div 
                key={day.toISOString()}
                style={gridStyle}
                onClick={() => {
                  setViewingDate(day);
                }}
                className={cn(
                  "min-h-[140px] p-2 border-b border-r border-zinc-100 transition-colors cursor-pointer hover:bg-zinc-50/80 group relative",
                  !isSameMonth(day, currentMonth) && "text-zinc-300",
                  isToday(day) && "bg-blue-50/30"
                )}
              >
                <div className="flex justify-between items-start mb-2">
                  <span className={cn(
                    "text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full transition-colors",
                    isToday(day) ? "bg-zinc-900 text-white" : "text-zinc-500 group-hover:text-zinc-900 text-zinc-400"
                  )}>
                    {format(day, 'd')}
                  </span>
                  <Plus className="w-4 h-4 text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                
                <div className="space-y-1">
                  {dayEvents.slice(0, 3).map(event => (
                    <div 
                      key={event.id}
                      className={cn(
                        "text-[9px] px-1.5 py-0.5 rounded border font-black truncate uppercase tracking-tighter flex items-center gap-1",
                        event.type === EventType.WORK ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                        event.type === EventType.TASK ? "bg-amber-50 text-amber-700 border-amber-100" :
                        "bg-zinc-50 text-zinc-600 border-zinc-200",
                        event.isUrgent && "border-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.2)]"
                      )}
                    >
                      {event.recurrence && event.recurrence !== 'none' && <Repeat className="w-2 h-2" />}
                      <span className="opacity-50">{format(parseISO(event.startTime), 'HH:mm')}</span>
                      <span className="flex-1 truncate">{event.title}</span>
                    </div>
                  ))}
                  {dayEvents.length > 3 && (
                    <div className="text-[10px] text-zinc-400 font-bold pl-1 uppercase tracking-widest text-[8px]">
                      + {dayEvents.length - 3} More
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <AnimatePresence>
        {viewingDate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-md">
            <motion.div 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              className="bg-white rounded-[2.5rem] w-full max-w-sm shadow-[0_32px_64px_-16px_rgba(0,0,0,0.3)] overflow-hidden"
            >
              <div className="p-8 border-b border-zinc-100 flex justify-between items-center bg-zinc-50/50">
                <div className="space-y-1">
                  <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.3em]">Viewing Day</p>
                  <h3 className="text-2xl font-black text-zinc-900">{format(viewingDate, 'MMMM do')}</h3>
                </div>
                <button onClick={() => setViewingDate(null)} className="p-3 hover:bg-zinc-100 rounded-2xl transition-colors">
                  <X className="w-5 h-5 text-zinc-400" />
                </button>
              </div>

              <div className="p-8 max-h-[60vh] overflow-y-auto space-y-4">
                 {(() => {
                   const dayEvents = getEffectiveEventsForDay(viewingDate);
                   const parents = dayEvents.filter(e => !e.parentId);
                   const children = dayEvents.filter(e => e.parentId);

                   if (dayEvents.length === 0) {
                     return (
                       <div className="py-12 text-center space-y-4">
                          <CalendarIcon className="w-12 h-12 text-zinc-100 mx-auto" />
                          <p className="text-xs font-black text-zinc-300 uppercase tracking-widest">Day is Wide Open</p>
                       </div>
                     );
                   }

                   return parents.map(parent => (
                     <div key={parent.id} className="space-y-2">
                       <div className="flex gap-4 group">
                          <div className="flex flex-col items-center gap-1">
                            <div className="text-[10px] font-black font-mono text-zinc-400">{format(parseISO(parent.startTime), 'HH:mm')}</div>
                            <div className="w-px h-full bg-zinc-100" />
                          </div>
                          <div className="flex-1 pb-2">
                            <div className={cn(
                              "p-5 rounded-2xl border transition-all hover:translate-x-1",
                              parent.type === EventType.WORK ? "bg-emerald-50/30 border-emerald-100" :
                              parent.type === EventType.TASK ? "bg-amber-50/30 border-amber-100" :
                              "bg-zinc-50/30 border-zinc-100",
                              parent.isUrgent && "border-rose-200 bg-rose-50/20"
                            )}>
                              <div className="flex justify-between items-start mb-2">
                                 <h4 className="font-black text-zinc-900 leading-tight flex items-center gap-2">
                                   {parent.title}
                                   {parent.isUrgent && <AlertCircle className="w-4 h-4 text-rose-500 fill-rose-50" />}
                                 </h4>
                                 <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                   <button 
                                     onClick={() => {
                                       setPreselectedParentId(parent.id);
                                       setSelectedDate(viewingDate);
                                       setViewingDate(null);
                                       setIsAddingEvent(true);
                                     }}
                                     className="p-1.5 text-zinc-300 hover:text-emerald-500 transition-all"
                                     title="Add sub-slot"
                                   >
                                     <Plus className="w-4 h-4" />
                                   </button>
                                   <button 
                                     onClick={async () => {
                                       try {
                                         await deleteDoc(doc(db, 'events', parent.id));
                                       } catch (e) {
                                         handleFirestoreError(e, OperationType.DELETE, `events/${parent.id}`);
                                       }
                                     }}
                                     className="p-1.5 text-zinc-300 hover:text-rose-500 transition-all"
                                   >
                                     <X className="w-4 h-4" />
                                   </button>
                                 </div>
                              </div>
                              <p className="text-sm text-zinc-500 font-medium leading-relaxed">{parent.description}</p>
                              {parent.recurrence && parent.recurrence !== 'none' && (
                                <div className="mt-2 flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-zinc-400">
                                   <Repeat className="w-3 h-3" />
                                   Every {parent.recurrence}
                                </div>
                              )}
                            </div>
                          </div>
                       </div>
                       
                       {/* Children / Mini Events */}
                       {children.filter(c => c.parentId === parent.id).map(child => (
                         <div key={child.id} className="flex gap-4 ml-10 group relative">
                            <div className="absolute left-[-20px] top-4 w-5 h-px bg-zinc-100" />
                            <div className="flex flex-col items-center gap-1">
                              <div className="text-[9px] font-black font-mono text-zinc-300">{format(parseISO(child.startTime), 'HH:mm')}</div>
                            </div>
                            <div className="flex-1 pb-2">
                              <div className={cn(
                                "p-3 rounded-xl border border-dashed transition-all hover:translate-x-1",
                                child.type === EventType.WORK ? "bg-emerald-50/10 border-emerald-100" :
                                child.type === EventType.TASK ? "bg-amber-50/10 border-amber-100" :
                                "bg-zinc-50/10 border-zinc-100"
                              )}>
                                <div className="flex justify-between items-start">
                                   <h5 className="text-xs font-black text-zinc-700">{child.title}</h5>
                                   <button 
                                     onClick={async () => {
                                       await deleteDoc(doc(db, 'events', child.id));
                                     }}
                                     className="opacity-0 group-hover:opacity-100 p-1 text-zinc-300 hover:text-rose-500 transition-all"
                                   >
                                     <X className="w-3 h-3" />
                                   </button>
                                </div>
                              </div>
                            </div>
                         </div>
                       ))}
                     </div>
                   ));
                 })()}
              </div>

              <div className="p-8 pt-0">
                <button 
                  onClick={() => {
                    setSelectedDate(viewingDate);
                    setIsAddingEvent(true);
                    setViewingDate(null);
                  }}
                  className="w-full bg-zinc-900 text-white font-black py-5 rounded-[1.5rem] shadow-xl hover:bg-zinc-800 transition-all uppercase tracking-[0.2em] text-xs flex items-center justify-center gap-3"
                >
                  <Plus className="w-5 h-5" />
                  Slot Event
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {isAddingEvent && selectedDate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-md">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[2.5rem] w-full max-w-md shadow-2xl overflow-y-auto max-h-[90vh]"
            >
              <div className="p-8 border-b border-zinc-100 flex justify-between items-center bg-zinc-50/50">
                <div className="space-y-1">
                  <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.3em]">New Slot</p>
                  <h3 className="text-2xl font-black text-zinc-900">{format(selectedDate, 'MMM do')}</h3>
                </div>
                <button 
                  onClick={() => {
                    setIsAddingEvent(false);
                    setPreselectedParentId(null);
                  }} 
                  className="p-3 hover:bg-zinc-100 rounded-2xl transition-colors"
                >
                  <X className="w-5 h-5 text-zinc-400" />
                </button>
              </div>

              <form onSubmit={handleAddEvent} className="p-8 space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Event Title</label>
                  <input 
                    name="title" 
                    required 
                    autoFocus
                    placeholder="Walgreens Shift, Dentist, Gym..."
                    className="w-full bg-zinc-50 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-zinc-900 transition-all font-bold text-zinc-900" 
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Start</label>
                    <div className="relative">
                      <Clock className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                      <input 
                        name="startTime" 
                        type="time" 
                        defaultValue="09:00"
                        required 
                        className="w-full bg-zinc-50 border-none rounded-2xl pl-12 pr-4 py-4 focus:ring-2 focus:ring-zinc-900 transition-all font-bold text-zinc-900" 
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">End</label>
                    <div className="relative">
                      <Clock className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                      <input 
                        name="endTime" 
                        type="time" 
                        defaultValue="10:00"
                        required 
                        className="w-full bg-zinc-50 border-none rounded-2xl pl-12 pr-4 py-4 focus:ring-2 focus:ring-zinc-900 transition-all font-bold text-zinc-900" 
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Category</label>
                    <select 
                      name="type" 
                      className="w-full bg-zinc-50 border-none rounded-2xl px-5 py-4 focus:ring-2 focus:ring-zinc-900 transition-all font-bold text-zinc-900 appearance-none shadow-sm"
                    >
                      <option value={EventType.WORK}>Work Shift</option>
                      <option value={EventType.TASK}>Vital Task</option>
                      <option value={EventType.PERSONAL}>Personal</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Recurrence</label>
                    <select 
                      name="recurrence" 
                      className="w-full bg-zinc-50 border-none rounded-2xl px-5 py-4 focus:ring-2 focus:ring-zinc-900 transition-all font-bold text-zinc-900 appearance-none shadow-sm"
                    >
                      <option value="none">One-time</option>
                      <option value="daily">Daily</option>
                      <option value="weekdays">Weekdays (M-F)</option>
                      <option value="weekends">Weekends (S-S)</option>
                      <option value="bi-daily">Bi-Daily (Every 2d)</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                      <option value="annually">Annually</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                   <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Parent Event (Nested)</label>
                   <select 
                      name="parentId" 
                      defaultValue={preselectedParentId || "none"}
                      className="w-full bg-zinc-50 border-none rounded-2xl px-5 py-4 focus:ring-2 focus:ring-zinc-900 transition-all font-bold text-zinc-900 appearance-none shadow-sm"
                    >
                      <option value="none">No Parent (Main Event)</option>
                      {getEffectiveEventsForDay(selectedDate).filter(e => !e.parentId).map(e => (
                        <option key={e.id} value={e.id}>{e.title} ({format(parseISO(e.startTime), 'p')} - {format(parseISO(e.endTime), 'p')})</option>
                      ))}
                    </select>
                </div>

                <div className="flex items-center justify-between p-5 bg-rose-50/50 rounded-2xl border border-rose-100">
                   <div className="space-y-1">
                      <p className="text-xs font-black text-rose-900 uppercase tracking-widest">Urgent Event</p>
                      <p className="text-[9px] text-rose-600 font-bold leading-none">Triggers audio alert + popup</p>
                   </div>
                   <input 
                      name="isUrgent" 
                      type="checkbox" 
                      className="w-6 h-6 rounded-lg border-rose-200 text-rose-500 focus:ring-rose-500"
                   />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Context</label>
                  <textarea 
                    name="description" 
                    rows={2}
                    placeholder="Specific notes or task details..."
                    className="w-full bg-zinc-50 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-zinc-900 transition-all font-medium text-zinc-900 resize-none" 
                  />
                </div>

                <div className="pt-2">
                  <button type="submit" className="w-full bg-zinc-900 text-white font-black py-5 rounded-[1.5rem] shadow-xl hover:bg-zinc-800 transform transition-all active:scale-[0.98] uppercase tracking-[0.2em] text-xs">
                    Confirm Slot
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      </div>
    </div>
  );
}
