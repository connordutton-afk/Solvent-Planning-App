import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, doc, updateDoc, deleteDoc, getDoc, orderBy, limit, runTransaction } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../Auth';
import { Earning, CalendarEvent, EventType } from '../../types';
import { format, startOfMonth, endOfMonth, parseISO, isSameDay } from 'date-fns';
import { Briefcase, Clock, DollarSign, Plus, CheckCircle2, Circle, TrendingUp, Calendar, AlertCircle, Sparkles, BrainCircuit, Loader2, Award, User, FileText, Send, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, formatCurrency } from '../../lib/utils';
import Markdown from 'react-markdown';
import { getCareerAdvice } from '../../services/geminiService';

export function WorkView() {
  const { user, profile } = useAuth();
  const [earnings, setEarnings] = useState<Earning[]>([]);
  const [todayShifts, setTodayShifts] = useState<CalendarEvent[]>([]);
  const [isAddingEarning, setIsAddingEarning] = useState(false);
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [careerAiAdvice, setCareerAiAdvice] = useState<string | null>(null);
  const [isGettingCareerAdvice, setIsGettingCareerAdvice] = useState(false);
  const [careerContext, setCareerContext] = useState("");

  useEffect(() => {
    if (!user) return;

    // Fetch Earnings
    const earningsQ = query(
      collection(db, 'earnings'),
      where('userId', '==', user.uid),
      orderBy('date', 'desc'),
      limit(10)
    );

    const unsubscribeEarnings = onSnapshot(earningsQ, (snapshot) => {
      setEarnings(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Earning[]);
    });

    // Fetch Today's Shifts
    const eventsQ = query(
      collection(db, 'events'),
      where('userId', '==', user.uid),
      where('type', '==', EventType.WORK)
    );

    const unsubscribeShifts = onSnapshot(eventsQ, (snapshot) => {
      const today = new Date();
      const shifts = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as CalendarEvent))
        .filter(event => isSameDay(parseISO(event.startTime), today));
      setTodayShifts(shifts);
    });

    return () => {
      unsubscribeEarnings();
      unsubscribeShifts();
    };
  }, [user]);

  const handleAddEarning = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;

    const formData = new FormData(e.currentTarget);
    const amount = parseFloat(formData.get('amount') as string);
    const hours = parseFloat(formData.get('hours') as string);
    const date = formData.get('date') as string;

    await addDoc(collection(db, 'earnings'), {
      userId: user.uid,
      amount,
      hours,
      date,
      status: 'pending',
      createdAt: new Date().toISOString()
    });

    setIsAddingEarning(false);
  };

  const handleMarkAsPaid = async (earning: Earning) => {
    if (!user || !profile) return;

    try {
      await runTransaction(db, async (transaction) => {
        const userRef = doc(db, 'users', user.uid);
        const earningRef = doc(db, 'earnings', earning.id);

        const userSnapshot = await transaction.get(userRef);
        if (!userSnapshot.exists()) throw "User does not exist!";

        const currentBalance = userSnapshot.data().balance;
        
        transaction.update(userRef, { balance: currentBalance + earning.amount });
        transaction.update(earningRef, { status: 'paid' });
      });
    } catch (e) {
      console.error("Transaction failed: ", e);
    }
  };

  const calculateMeanPay = () => {
    if (earnings.length === 0) return 0;
    const totalAmount = earnings.reduce((sum, e) => sum + e.amount, 0);
    const totalHours = earnings.reduce((sum, e) => sum + e.hours, 0);
    return totalHours > 0 ? totalAmount / totalHours : 0;
  };

  const handleUpdateCareerProfile = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    const formData = new FormData(e.currentTarget);
    const age = parseInt(formData.get('age') as string);
    const certifications = (formData.get('certifications') as string).split(',').map(s => s.trim()).filter(s => s);
    const permits = (formData.get('permits') as string).split(',').map(s => s.trim()).filter(s => s);
    const careerDetails = formData.get('careerDetails') as string;

    await updateDoc(doc(db, 'users', user.uid), {
      age,
      certifications,
      permits,
      careerDetails
    });
    setIsUpdatingProfile(false);
  };

  const handleGetCareerAdvice = async () => {
    if (!profile) return;
    setIsGettingCareerAdvice(true);
    try {
      const advice = await getCareerAdvice(profile, careerContext);
      setCareerAiAdvice(advice || "No advice available.");
    } catch (e) {
      console.error(e);
      setCareerAiAdvice("Failed to get career advice.");
    } finally {
      setIsGettingCareerAdvice(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold tracking-tight text-zinc-900">Work & Earnings</h2>
          <p className="text-zinc-500">Track your shifts and calculate your hourly rate.</p>
        </div>
        
        <button 
          onClick={() => setIsAddingEarning(!isAddingEarning)}
          className="flex items-center gap-2 bg-zinc-900 text-white px-5 py-2.5 rounded-xl font-semibold shadow-lg hover:bg-zinc-800 transition-all uppercase tracking-wide text-sm"
        >
          <Plus className="w-5 h-5" />
          Log Paycheck
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Stats Card */}
        <div className="bg-zinc-900 rounded-2xl p-6 text-white shadow-xl flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <TrendingUp className="w-24 h-24 rotate-12" />
          </div>
          <div className="relative z-10">
            <p className="text-zinc-400 text-xs font-bold uppercase tracking-widest mb-1">Mean Hourly Rate</p>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-mono font-bold">{formatCurrency(calculateMeanPay())}</span>
              <span className="text-zinc-400 text-sm font-medium">/hr</span>
            </div>
            <p className="mt-4 text-sm text-zinc-400">Based on your last {earnings.length} entries.</p>
          </div>
        </div>

        {/* Mini Schedule */}
        <div className="md:col-span-2 bg-white rounded-2xl border border-zinc-200 p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-zinc-100 rounded-lg">
              <Calendar className="w-5 h-5 text-zinc-600" />
            </div>
            <h3 className="font-bold text-lg text-zinc-900">Daily Shifts</h3>
          </div>

          <div className="space-y-3">
            {todayShifts.length > 0 ? (
              todayShifts.map(shift => (
                <div key={shift.id} className="flex items-center justify-between p-4 bg-zinc-50 rounded-xl border border-zinc-100">
                  <div className="flex items-center gap-4">
                    <div className="w-2 h-10 bg-emerald-500 rounded-full" />
                    <div>
                      <p className="font-bold text-zinc-900">{shift.title}</p>
                      <div className="flex items-center gap-2 text-zinc-500 text-xs">
                        <Clock className="w-3 h-3" />
                        {format(parseISO(shift.startTime), 'p')} - {format(parseISO(shift.endTime), 'p')}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-semibold px-2 py-1 bg-emerald-100 text-emerald-700 rounded-md uppercase">Work</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-8 flex flex-col items-center justify-center text-zinc-400 gap-2 border-2 border-dashed border-zinc-100 rounded-2xl">
                <Clock className="w-8 h-8 opacity-50" />
                <p className="text-sm font-medium">No shifts scheduled for today.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div 
          onClick={() => setIsUpdatingProfile(true)}
          className="bg-white rounded-3xl p-6 border border-zinc-200 shadow-sm hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between mb-4">
             <div className="p-2 bg-zinc-100 rounded-xl group-hover:bg-zinc-900 group-hover:text-white transition-all">
                <User className="w-5 h-5" />
             </div>
             <Award className="w-4 h-4 text-zinc-300" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-1">Career Profile</p>
            <h4 className="font-bold text-zinc-900">Education & Tools</h4>
            <p className="text-xs text-zinc-500 mt-2">Age: {profile?.age || '--'} • {profile?.certifications?.length || 0} Certs</p>
          </div>
        </div>

        <div className="lg:col-span-3 bg-zinc-900 rounded-3xl p-8 border border-zinc-800 shadow-2xl relative overflow-hidden flex flex-col md:flex-row gap-8 items-center">
           <div className="absolute top-0 right-0 p-8 opacity-5">
              <Sparkles className="w-64 h-64" />
           </div>
           
           <div className="relative z-10 flex-1 space-y-4">
              <div className="flex items-center gap-3">
                 <div className="p-2 bg-emerald-500/20 rounded-xl text-emerald-400">
                    <BrainCircuit className="w-6 h-6" />
                 </div>
                 <h3 className="text-xl font-bold font-mono uppercase tracking-tighter italic text-white underline decoration-emerald-500/50">CAREER_STRATEGIST AI</h3>
              </div>
              <p className="text-zinc-400 text-sm max-w-md">I analyze your certifications, permits, and current pay to find better opportunities.</p>
              <div className="flex gap-2">
                 <input 
                    placeholder="Ask about a specific field or job..."
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:border-emerald-500 transition-colors outline-none"
                    value={careerContext}
                    onChange={(e) => setCareerContext(e.target.value)}
                 />
                 <button 
                  onClick={handleGetCareerAdvice}
                  disabled={isGettingCareerAdvice}
                  className="bg-emerald-500 hover:bg-emerald-600 text-zinc-900 font-bold px-6 py-3 rounded-xl flex items-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50 h-[46px]"
                 >
                    {isGettingCareerAdvice ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    <span>ANALYZE</span>
                 </button>
              </div>
           </div>
        </div>
      </div>

      <AnimatePresence>
        {careerAiAdvice && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-white rounded-3xl p-8 border-2 border-zinc-900 shadow-xl relative"
          >
             <button 
                onClick={() => setCareerAiAdvice(null)}
                className="absolute top-6 right-6 text-zinc-400 hover:text-zinc-900 transition-colors"
             >
                <X className="w-6 h-6" />
             </button>
             <div className="prose prose-zinc max-w-none">
                <div className="markdown-body">
                  <Markdown>{careerAiAdvice}</Markdown>
                </div>
             </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Earnings List */}
        <div className="lg:col-span-2 space-y-4">
          <h3 className="font-bold text-xl text-zinc-900">Recent Paychecks</h3>
          <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-zinc-50 border-b border-zinc-100">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-bold text-zinc-400 uppercase tracking-widest">Date</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-zinc-400 uppercase tracking-widest">Hours</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-zinc-400 uppercase tracking-widest">Amount</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-zinc-400 uppercase tracking-widest">Status</th>
                  <th className="px-6 py-4 text-right text-xs font-bold text-zinc-400 uppercase tracking-widest">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {earnings.map(earning => (
                  <tr key={earning.id} className="hover:bg-zinc-50/50 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-zinc-900">{format(parseISO(earning.date), 'MMM d, yyyy')}</td>
                    <td className="px-6 py-4 text-sm text-zinc-500 font-mono">{earning.hours}h</td>
                    <td className="px-6 py-4 text-sm text-zinc-900 font-bold">{formatCurrency(earning.amount)}</td>
                    <td className="px-6 py-4">
                      <div className={cn(
                        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                        earning.status === 'paid' ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                      )}>
                        {earning.status === 'paid' ? <CheckCircle2 className="w-3 h-3" /> : <Circle className="w-3 h-3" />}
                        {earning.status}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {earning.status === 'pending' && (
                        <button 
                          onClick={() => handleMarkAsPaid(earning)}
                          className="text-emerald-600 hover:text-emerald-700 font-bold text-xs uppercase tracking-tight hover:underline"
                        >
                          Collect Pay
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {earnings.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-zinc-400">
                      No earnings records yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Form to add */}
        <div className="space-y-4">
          <h3 className="font-bold text-xl text-zinc-900">Add Entry</h3>
          <div className={cn(
            "bg-zinc-50 rounded-2xl border-2 border-dashed border-zinc-200 p-6 transition-all",
            isAddingEarning ? "bg-white border-solid border-zinc-900 ring-2 ring-zinc-900/5" : "hover:border-zinc-300 cursor-pointer"
          )}
          onClick={() => !isAddingEarning && setIsAddingEarning(true)}
          >
            {isAddingEarning ? (
              <form onSubmit={handleAddEarning} className="space-y-5">
                <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Gross Pay</label>
                    <div className="relative">
                        <DollarSign className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                        <input name="amount" type="number" step="0.01" required className="w-full bg-zinc-50 border-none rounded-xl pl-9 pr-4 py-3 focus:ring-2 focus:ring-zinc-900" />
                    </div>
                </div>
                <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Total Hours</label>
                    <div className="relative">
                        <Clock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                        <input name="hours" type="number" step="0.1" required className="w-full bg-zinc-50 border-none rounded-xl pl-9 pr-4 py-3 focus:ring-2 focus:ring-zinc-900" />
                    </div>
                </div>
                <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Pay Period End</label>
                    <input name="date" type="date" required className="w-full bg-zinc-50 border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-zinc-900" />
                </div>
                <div className="pt-2 flex gap-2">
                    <button type="submit" className="flex-1 bg-zinc-900 text-white font-bold py-3 rounded-xl hover:bg-zinc-800 shadow-md">Save</button>
                    <button type="button" onClick={() => setIsAddingEarning(false)} className="px-4 bg-zinc-100 text-zinc-600 font-bold rounded-xl hover:bg-zinc-200">Cancel</button>
                </div>
              </form>
            ) : (
                <div className="flex flex-col items-center justify-center py-10 gap-3">
                    <div className="p-3 bg-white rounded-2xl shadow-sm border border-zinc-100">
                        <Plus className="w-8 h-8 text-zinc-400" />
                    </div>
                    <p className="text-sm font-bold text-zinc-500 uppercase tracking-widest">Click to log new pay</p>
                </div>
            )}
          </div>
        </div>
      </div>
      <AnimatePresence>
        {isAddingEarning && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[2rem] w-full max-w-sm shadow-2xl p-8"
            >
              <h3 className="text-xl font-bold text-zinc-900 mb-6 font-mono italic tracking-tighter uppercase">LOG NEW PAYCHECK</h3>
              <form onSubmit={handleAddEarning} className="space-y-5">
                <div className="space-y-2 text-left">
                    <label className="text-[10px] font-black text-zinc-900 uppercase tracking-[0.2em] pl-1">Gross Pay</label>
                    <div className="relative">
                        <DollarSign className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" />
                        <input name="amount" type="number" step="0.01" required className="w-full bg-zinc-50 border-none rounded-2xl pl-12 pr-4 py-4 focus:ring-2 focus:ring-zinc-900 font-bold" />
                    </div>
                </div>
                <div className="space-y-2 text-left">
                    <label className="text-[10px] font-black text-zinc-900 uppercase tracking-[0.2em] pl-1">Total Hours</label>
                    <div className="relative">
                        <Clock className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" />
                        <input name="hours" type="number" step="0.1" required className="w-full bg-zinc-50 border-none rounded-2xl pl-12 pr-4 py-4 focus:ring-2 focus:ring-zinc-900 font-bold" />
                    </div>
                </div>
                <div className="space-y-2 text-left">
                    <label className="text-[10px] font-black text-zinc-900 uppercase tracking-[0.2em] pl-1">Period End</label>
                    <input name="date" type="date" required className="w-full bg-zinc-50 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-zinc-900 font-bold" />
                </div>
                <div className="pt-4 flex gap-3">
                    <button type="submit" className="flex-1 bg-zinc-900 text-white font-black py-4 rounded-2xl shadow-xl hover:bg-zinc-800 transition-all uppercase tracking-widest text-[10px]">SAVE ENTRY</button>
                    <button type="button" onClick={() => setIsAddingEarning(false)} className="px-6 bg-zinc-100 text-zinc-500 font-bold rounded-2xl hover:bg-zinc-200 transition-all text-[10px] uppercase">BACK</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {isUpdatingProfile && (
           <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[2rem] w-full max-w-lg shadow-2xl p-8 overflow-y-auto max-h-[90vh]"
            >
              <h3 className="text-xl font-bold text-zinc-900 mb-6 font-mono italic tracking-tighter uppercase">CAREER PROFILE</h3>
              <form onSubmit={handleUpdateCareerProfile} className="space-y-5">
                <div className="grid grid-cols-4 gap-4">
                  <div className="col-span-1 space-y-2 text-left">
                      <label className="text-[10px] font-black text-zinc-900 uppercase tracking-[0.2em] pl-1">Age</label>
                      <input name="age" type="number" defaultValue={profile?.age} required className="w-full bg-zinc-50 border-none rounded-2xl px-4 py-4 focus:ring-2 focus:ring-zinc-900 font-bold" />
                  </div>
                  <div className="col-span-3 space-y-2 text-left">
                      <label className="text-[10px] font-black text-zinc-900 uppercase tracking-[0.2em] pl-1">Certifications (comma separated)</label>
                      <input name="certifications" placeholder="First Aid, CPR, Food Safe..." defaultValue={profile?.certifications?.join(', ')} className="w-full bg-zinc-50 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-zinc-900 font-bold" />
                  </div>
                </div>
                <div className="space-y-2 text-left">
                    <label className="text-[10px] font-black text-zinc-900 uppercase tracking-[0.2em] pl-1">Permits (comma separated)</label>
                    <input name="permits" placeholder="Driver's License, Serving it Right..." defaultValue={profile?.permits?.join(', ')} className="w-full bg-zinc-50 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-zinc-900 font-bold" />
                </div>
                <div className="space-y-2 text-left">
                    <label className="text-[10px] font-black text-zinc-900 uppercase tracking-[0.2em] pl-1">Career Details / Dreams</label>
                    <textarea 
                      name="careerDetails" 
                      rows={4}
                      defaultValue={profile?.careerDetails}
                      placeholder="I want to be an engineer. I enjoy problem solving and math..." 
                      className="w-full bg-zinc-50 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-zinc-900 font-bold resize-none" 
                    />
                </div>
                <div className="pt-4 flex gap-3">
                    <button type="submit" className="flex-1 bg-zinc-900 text-white font-black py-4 rounded-2xl shadow-xl hover:bg-zinc-800 transition-all uppercase tracking-widest text-[10px]">UPDATE PROFILE</button>
                    <button type="button" onClick={() => setIsUpdatingProfile(false)} className="px-6 bg-zinc-100 text-zinc-500 font-bold rounded-2xl hover:bg-zinc-200 transition-all text-[10px] uppercase">BACK</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
