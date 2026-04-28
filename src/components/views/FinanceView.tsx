import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, doc, updateDoc, deleteDoc, orderBy, limit } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../Auth';
import { BudgetGoal, TimelyExpense, Earning } from '../../types';
import { Wallet, Target, PiggyBank, Plus, Trash2, Edit3, DollarSign, Clock, PieChart, ArrowUpRight, Receipt, CalendarRange, MinusCircle, PlusCircle, CheckCircle2, Circle, Sparkles, BrainCircuit, Loader2, X, AlertCircle, TrendingUp } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, formatCurrency } from '../../lib/utils';
import Markdown from 'react-markdown';

import { handleFirestoreError, OperationType } from '../../lib/firestoreUtils';
import { getBudgetAdvice } from '../../services/geminiService';

export function FinanceView() {
  const { user, profile } = useAuth();
  const [goals, setGoals] = useState<BudgetGoal[]>([]);
  const [expenses, setExpenses] = useState<TimelyExpense[]>([]);
  const [earnings, setEarnings] = useState<Earning[]>([]);
  const [isAddingGoal, setIsAddingGoal] = useState(false);
  const [isAddingExpense, setIsAddingExpense] = useState(false);
  const [isSettingInitial, setIsSettingInitial] = useState(false);
  const [aiAdvice, setAiAdvice] = useState<string | null>(null);
  const [isGettingAdvice, setIsGettingAdvice] = useState(false);
  const [goalCrunches, setGoalCrunches] = useState<Record<string, string>>({});
  const [isCrunchingGoal, setIsCrunchingGoal] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!user) return;

    const qGoals = query(
      collection(db, 'budget_goals'),
      where('userId', '==', user.uid)
    );

    const qExpenses = query(
      collection(db, 'timely_expenses'),
      where('userId', '==', user.uid)
    );

    const unsubGoals = onSnapshot(qGoals, (snapshot) => {
      setGoals(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as BudgetGoal[]);
    }, (error) => {
      console.error("Goals sync error:", error);
    });

    const unsubExpenses = onSnapshot(qExpenses, (snapshot) => {
      setExpenses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as TimelyExpense[]);
    }, (error) => {
      console.error("Expenses sync error:", error);
    });

    const qEarnings = query(
      collection(db, 'earnings'),
      where('userId', '==', user.uid),
      orderBy('date', 'desc'),
      limit(10)
    );

    const unsubEarnings = onSnapshot(qEarnings, (snapshot) => {
      setEarnings(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Earning[]);
    }, (error) => {
      console.error("Earnings sync error:", error);
    });

    return () => {
      unsubGoals();
      unsubExpenses();
      unsubEarnings();
    };
  }, [user]);

  const handleUpdateBalance = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    const formData = new FormData(e.currentTarget);
    const amount = parseFloat(formData.get('amount') as string);
    const paycheck = parseFloat(formData.get('paycheck') as string);
    
    await updateDoc(doc(db, 'users', user.uid), {
      balance: amount,
      startingBalance: amount,
      payPerPaycheck: paycheck
    });
    setIsSettingInitial(false);
  };

  const handleUpdateSavings = async (val: number) => {
    if (!user) return;
    await updateDoc(doc(db, 'users', user.uid), {
      savingsPercentage: val
    });
  };

  const handleAddGoal = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;

    const formData = new FormData(e.currentTarget);
    const needed = parseFloat(formData.get('percentNeeded') as string);
    const wanted = parseFloat(formData.get('percentWanted') as string);
    const totalAlloc = needed + wanted;

    await addDoc(collection(db, 'budget_goals'), {
      userId: user.uid,
      item: formData.get('item'),
      price: parseFloat(formData.get('price') as string),
      estWeeks: 0, // No longer strictly needed as we calculate it
      investPercentage: totalAlloc,
      percentNeeded: needed,
      percentWanted: wanted,
      createdAt: new Date().toISOString()
    });

    setIsAddingGoal(false);
  };

  const deleteGoal = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'budget_goals', id));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `budget_goals/${id}`);
    }
  };

  const handleAddExpense = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    try {
      const formData = new FormData(e.currentTarget);
      const amount = parseFloat(formData.get('amount') as string);
      const item = formData.get('item') as string;
      const frequency = formData.get('frequency') as string;
      const isAutoDeduce = formData.get('isAutoDeduce') === 'on';
      const isUrgent = formData.get('isUrgent') === 'on';
      
      if (isNaN(amount) || !item) return;

      await addDoc(collection(db, 'timely_expenses'), {
        userId: user.uid,
        item: item,
        amount: amount,
        frequency: frequency,
        isAutoDeduce: isAutoDeduce,
        isUrgent: isUrgent,
        createdAt: new Date().toISOString()
      });
      setIsAddingExpense(false);
      (e.target as HTMLFormElement).reset();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'timely_expenses');
    }
  };

  const deleteExpense = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'timely_expenses', id));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `timely_expenses/${id}`);
    }
  };

  const toggleExpenseDeduction = async (id: string, current: boolean) => {
    await updateDoc(doc(db, 'timely_expenses', id), { isAutoDeduce: !current });
  };

  const handleQuickAdjustment = async (type: 'add' | 'remove', amountStr: string) => {
    if (!user || !profile) return;
    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) return;
    
    const newBalance = type === 'add' ? profile.balance + amount : profile.balance - amount;
    await updateDoc(doc(db, 'users', user.uid), { balance: newBalance });
  };

  const handleGetAdvice = async () => {
    if (!profile) return;
    setIsGettingAdvice(true);
    try {
      const advice = await getBudgetAdvice(profile, goals, expenses, earnings);
      setAiAdvice(advice || "Sorry, I couldn't generate advice right now.");
    } catch (e) {
      console.error(e);
      setAiAdvice("An error occurred while getting AI advice.");
    } finally {
      setIsGettingAdvice(false);
    }
  };

  const handleGetGoalCrunch = async (goal: BudgetGoal) => {
    if (!profile || isCrunchingGoal[goal.id]) return;
    setIsCrunchingGoal(prev => ({ ...prev, [goal.id]: true }));
    try {
      const { crunchGoalMath } = await import('../../services/geminiService');
      const crunch = await crunchGoalMath(profile, goal, expenses, earnings);
      setGoalCrunches(prev => ({ ...prev, [goal.id]: crunch }));
    } catch (e) {
      console.error(e);
    } finally {
      setIsCrunchingGoal(prev => ({ ...prev, [goal.id]: false }));
    }
  };

  // Logic: "Need should be flat, wanted should be any extra money"
  const payPerPaycheck = profile?.payPerPaycheck || 0;
  
  // Priority Logic: Urgent first, then normal
  const sortedExpenses = [...expenses].sort((a, b) => {
    if (a.isUrgent && !b.isUrgent) return -1;
    if (!a.isUrgent && b.isUrgent) return 1;
    return 0;
  });

  const avgEarningsValue = earnings.length 
    ? (earnings.reduce((s, e) => s + e.amount, 0) / earnings.length) 
    : profile?.payPerPaycheck || 0;

  const totalExpensesPerPaycheck = sortedExpenses.filter(e => e.isAutoDeduce).reduce((sum, exp) => {
    let factor = 1;
    if (exp.frequency === 'Daily') factor = 14;
    if (exp.frequency === 'Weekly') factor = 2;
    if (exp.frequency === 'Monthly') factor = 12 / 26;
    if (exp.frequency === 'Bi-Weekly') factor = 1;
    return sum + (exp.amount * factor);
  }, 0);

  const urgentExpenses = sortedExpenses.filter(e => e.isAutoDeduce && e.isUrgent).reduce((sum, exp) => {
    let factor = 1;
    if (exp.frequency === 'Daily') factor = 14;
    if (exp.frequency === 'Weekly') factor = 2;
    if (exp.frequency === 'Monthly') factor = 12 / 26;
    if (exp.frequency === 'Bi-Weekly') factor = 1;
    return sum + (exp.amount * factor);
  }, 0);

  const projectedSurplus = avgEarningsValue - totalExpensesPerPaycheck;

  const savingsAmount = payPerPaycheck * ((profile?.savingsPercentage || 0) / 100);
  const totalNeededPercentage = goals.reduce((sum, g) => sum + (g.percentNeeded || 0), 0);
  const totalNeededAmount = payPerPaycheck * (totalNeededPercentage / 100);
  
  const extraPool = Math.max(0, payPerPaycheck - totalExpensesPerPaycheck - savingsAmount - totalNeededAmount);
  const extraPoolPercentage = payPerPaycheck > 0 ? (extraPool / payPerPaycheck) * 100 : 0;
  
  const totalAllocated = goals.reduce((sum, g) => sum + (g.percentNeeded || 0) + (g.percentWanted || 0), 0);
  const totalWantedPercentage = goals.reduce((sum, g) => sum + (g.percentWanted || 0), 0);

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold tracking-tight text-zinc-900">Finance & Budgeting</h2>
          <p className="text-zinc-500">Manage your wealth and track saving goals.</p>
        </div>

        <button 
          onClick={() => setIsAddingGoal(true)}
          disabled={!profile?.payPerPaycheck}
          className="flex items-center gap-2 bg-zinc-900 text-white px-5 py-2.5 rounded-xl font-semibold shadow-lg hover:bg-zinc-800 transition-all uppercase tracking-wide text-sm disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Plus className="w-5 h-5" />
          Create Note Pad
        </button>
      </div>

      {!profile?.payPerPaycheck && (
         <motion.div 
           initial={{ opacity: 0, y: -10 }}
           animate={{ opacity: 1, y: 0 }}
           className="bg-amber-50 border border-amber-200 rounded-2xl p-6 flex items-center justify-between"
         >
           <div className="flex items-center gap-4">
              <div className="p-2 bg-amber-100 rounded-xl text-amber-600">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <p className="font-bold text-amber-900">Calculations Disabled</p>
                <p className="text-sm text-amber-700">You must set your Paycheck amount to enable budget crunching.</p>
              </div>
           </div>
           <button 
             onClick={() => setIsSettingInitial(true)}
             className="bg-amber-600 text-white px-4 py-2 rounded-xl font-bold hover:bg-amber-700 transition-colors"
           >
             Set Baseline Now
           </button>
         </motion.div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Main Balance Card */}
        <div className="md:col-span-2 bg-white rounded-3xl p-8 border border-zinc-200 shadow-sm relative overflow-hidden group">
          <div className="absolute -right-12 -top-12 p-8 opacity-[0.03] group-hover:opacity-[0.05] transition-opacity">
            <Wallet className="w-64 h-64" />
          </div>
          
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-8">
            <div className="space-y-4">
              <div>
                <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Current Balance</p>
                <div className="flex items-center gap-4">
                  <h3 className="text-5xl font-black font-mono text-zinc-900 tracking-tighter">
                    {formatCurrency(profile?.balance || 0)}
                  </h3>
                  <button 
                    onClick={() => setIsSettingInitial(true)}
                    className="p-1.5 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors"
                  >
                    <Edit3 className="w-5 h-5" />
                  </button>
                </div>
              </div>
              
              <div className="flex items-center gap-6 text-sm">
                <div>
                  <p className="text-zinc-400 font-medium">Starting</p>
                  <p className="font-bold text-zinc-900">{formatCurrency(profile?.startingBalance || 0)}</p>
                </div>
                <div className="w-px h-8 bg-zinc-100" />
                <div>
                  <p className="text-zinc-400 font-medium">Net Change</p>
                  <p className={cn(
                    "font-bold",
                    (profile?.balance || 0) - (profile?.startingBalance || 0) >= 0 ? "text-emerald-600" : "text-rose-600"
                  )}>
                    {(profile?.balance || 0) - (profile?.startingBalance || 0) >= 0 ? '+' : ''}
                    {formatCurrency((profile?.balance || 0) - (profile?.startingBalance || 0))}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-zinc-50 rounded-2xl p-6 border border-zinc-100 min-w-[200px]">
              <div className="flex items-center gap-2 mb-3">
                <DollarSign className="w-4 h-4 text-emerald-600" />
                <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Est. Paycheck</span>
              </div>
              <div className="space-y-1">
                <p className="text-2xl font-black font-mono text-zinc-900">{formatCurrency(profile?.payPerPaycheck || 0)}</p>
                <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">Base Income per period</p>
              </div>
              
              <div className="mt-4 pt-4 border-t border-zinc-100 flex items-center gap-2 mb-3">
                <PiggyBank className="w-4 h-4 text-emerald-600" />
                <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Savings Target</span>
              </div>
              <div className="space-y-4">
                <div className="flex items-end justify-between">
                  <span className="text-3xl font-black font-mono text-zinc-900 leading-none">{profile?.savingsPercentage}%</span>
                  <div className="flex gap-1">
                    {[10, 20, 30, 50].map(v => (
                      <button 
                        key={v}
                        onClick={() => handleUpdateSavings(v)}
                        className={cn(
                          "px-2 py-1 text-[10px] font-bold rounded border transition-all",
                          profile?.savingsPercentage === v 
                            ? "bg-zinc-900 text-white border-zinc-900" 
                            : "bg-white text-zinc-400 border-zinc-200 hover:border-zinc-400"
                        )}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="w-full h-2 bg-zinc-200 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500" style={{ width: `${profile?.savingsPercentage}%` }} />
                  </div>
                  <p className="text-[10px] text-zinc-400 font-bold">REMAINING BUDGET: {100 - (profile?.savingsPercentage || 0)}%</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Calculator Card */}
        <div className="bg-emerald-600 rounded-3xl p-6 text-white shadow-xl flex flex-col justify-between">
          <div>
            <div className="p-2 bg-white/20 rounded-xl w-fit mb-4">
              <ArrowUpRight className="w-6 h-6" />
            </div>
            <h4 className="text-lg font-bold mb-1">Savings Impact</h4>
            <p className="text-emerald-100 text-sm opacity-80">What your current target ({(profile?.balance || 0) * ((profile?.savingsPercentage || 0)/100)}) would look like.</p>
          </div>
          <div className="space-y-4">
            <div className="space-y-1">
              <p className="text-3xl font-black font-mono tracking-tighter">
                {formatCurrency((profile?.balance || 0) * ((profile?.savingsPercentage || 0) / 100))}
              </p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-200">Current Savings Reserve</p>
            </div>
            <button 
              onClick={handleGetAdvice}
              disabled={isGettingAdvice}
              className="w-full bg-white/10 hover:bg-white/20 border border-white/20 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {isGettingAdvice ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {aiAdvice ? 'Refresh AI Insights' : 'Get AI Budget Advice'}
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {aiAdvice && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="bg-zinc-900 text-white rounded-3xl p-8 border border-zinc-800 shadow-2xl relative overflow-hidden group"
          >
            <div className="absolute top-0 right-0 p-8 opacity-5">
              <BrainCircuit className="w-64 h-64" />
            </div>
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-500/20 rounded-xl text-emerald-400">
                    <Sparkles className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-bold font-mono uppercase tracking-tighter italic">FINANCE_AI ADVISORY</h3>
                </div>
                <button 
                  onClick={() => setAiAdvice(null)}
                  className="text-zinc-500 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="prose prose-invert prose-zinc max-w-none">
                <div className="markdown-body">
                  <Markdown>{aiAdvice}</Markdown>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reality Check Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-zinc-100 p-6 rounded-3xl shadow-sm space-y-4">
          <div className="flex items-center gap-2 text-zinc-400">
            <TrendingUp className="w-4 h-4" />
            <span className="text-[10px] font-bold uppercase tracking-widest">Observed Avg. Pay</span>
          </div>
          <div className="space-y-1">
            <p className="text-2xl font-bold text-zinc-900">{formatCurrency(avgEarningsValue)}</p>
            <p className="text-[10px] text-zinc-500 font-medium italic">Based on real history</p>
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl shadow-lg space-y-4 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-3 opacity-10">
            <AlertCircle className="w-12 h-12 text-rose-500" />
          </div>
          <div className="flex items-center gap-2 text-zinc-400">
            <AlertCircle className="w-4 h-4 text-rose-500" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Urgent Deductions</span>
          </div>
          <div className="space-y-1">
            <p className="text-2xl font-bold text-rose-500">{formatCurrency(urgentExpenses)}</p>
            <p className="text-[10px] text-zinc-400 font-medium italic">Auto-paid mandatory items</p>
          </div>
        </div>

        <div className="bg-white border border-zinc-100 p-6 rounded-3xl shadow-sm space-y-4">
           <div className="flex items-center gap-2 text-zinc-400">
            <Wallet className="w-4 h-4" />
            <span className="text-[10px] font-bold uppercase tracking-widest">True Surplus</span>
          </div>
          <div className="space-y-1">
            <p className={cn(
              "text-2xl font-bold",
              projectedSurplus > 0 ? "text-emerald-600" : "text-rose-600"
            )}>
              {formatCurrency(projectedSurplus)}
            </p>
            <p className="text-[10px] text-zinc-500 font-medium italic">Left for your goals</p>
          </div>
        </div>

        <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-3xl shadow-sm space-y-4">
           <div className="flex items-center gap-2 text-emerald-600">
            <PieChart className="w-4 h-4" />
            <span className="text-[10px] font-bold uppercase tracking-widest">Goal Coverage</span>
          </div>
          <div className="space-y-1">
            <p className="text-2xl font-bold text-emerald-900">
              {((totalNeededAmount / (profile?.payPerPaycheck || 1)) * 100).toFixed(0)}%
            </p>
            <p className="text-[10px] text-emerald-600 font-medium italic">Allocated of base pay</p>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold text-zinc-900">Custom Budgeting Goals</h3>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Investment Coverage:</span>
            <span className={cn(
              "text-xs font-bold px-2 py-1 rounded-md",
              totalAllocated > 100 ? "bg-rose-100 text-rose-700" : "bg-zinc-100 text-zinc-900"
            )}>
              {totalAllocated}% / 100%
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {goals.map(goal => {
            const goalNeededAmount = payPerPaycheck * ((goal.percentNeeded || 0) / 100);
            const goalWantedAmount = extraPool * ((goal.percentWanted || 0) / 100);
            const paycheckAmount = goalNeededAmount + goalWantedAmount;
            const paychecksToGoal = paycheckAmount > 0 ? Math.ceil(goal.price / paycheckAmount) : Infinity;
            
            return (
            <motion.div 
              layout
              key={goal.id} 
              className="group bg-white rounded-3xl p-6 border border-zinc-200 shadow-sm hover:shadow-md transition-all relative overflow-hidden"
            >
              <button 
                onClick={() => deleteGoal(goal.id)}
                className="absolute top-4 right-4 p-2 text-zinc-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl opacity-0 group-hover:opacity-100 transition-all"
              >
                <Trash2 className="w-4 h-4" />
              </button>

              <div className="space-y-6">
                <div>
                  <h4 className="font-bold text-zinc-900 text-lg group-hover:text-zinc-600 transition-colors capitalize">{goal.item}</h4>
                  <p className="text-2xl font-black font-mono text-zinc-900 mt-1">{formatCurrency(goal.price)}</p>
                </div>

                <div className="grid grid-cols-2 gap-4 py-4 border-y border-zinc-50">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-zinc-400">
                      <Clock className="w-3 h-3" />
                      <span className="text-[10px] font-bold uppercase tracking-widest">Timeline</span>
                    </div>
                    <p className="font-bold text-zinc-900 text-sm">{paychecksToGoal === Infinity ? 'Infinite' : `${paychecksToGoal} Paychecks`}</p>
                  </div>
                  <div className="space-y-1 text-right">
                    <div className="flex items-center gap-1.5 text-zinc-400 justify-end">
                      <PieChart className="w-3 h-3" />
                      <span className="text-[10px] font-bold uppercase tracking-widest">Efficiency</span>
                    </div>
                    <button 
                      onClick={() => handleGetGoalCrunch(goal)}
                      disabled={isCrunchingGoal[goal.id]}
                      className="text-[10px] font-black text-emerald-600 hover:underline flex items-center gap-1 justify-end ml-auto"
                    >
                      {isCrunchingGoal[goal.id] ? <Loader2 className="w-3 h-3 animate-spin" /> : <BrainCircuit className="w-3 h-3" />}
                      {goalCrunches[goal.id] ? 'Refresh Stats' : 'AI Crunch'}
                    </button>
                  </div>
                </div>

                <AnimatePresence>
                  {goalCrunches[goal.id] && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="bg-zinc-50 rounded-2xl p-4 text-[11px] leading-relaxed relative"
                    >
                      <button 
                        onClick={() => setGoalCrunches(prev => {
                          const next = { ...prev };
                          delete next[goal.id];
                          return next;
                        })}
                        className="absolute top-2 right-2 text-zinc-300 hover:text-zinc-900"
                      >
                        <X className="w-3 h-3" />
                      </button>
                      <Markdown>{goalCrunches[goal.id]}</Markdown>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="space-y-3">
                   <div className="flex justify-between items-end">
                      <div className="space-y-0.5">
                        <span className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest">Goal Yield</span>
                        <span className="text-xl font-black text-zinc-900 font-mono leading-none">{formatCurrency(paycheckAmount)}</span>
                      </div>
                      <div className="text-right">
                        <span className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest">Net Share</span>
                        <span className="text-xs font-black text-zinc-500 font-mono">{((paycheckAmount / Math.max(1, payPerPaycheck)) * 100).toFixed(1)}%</span>
                      </div>
                   </div>
                   <div className="flex h-2 rounded-full overflow-hidden bg-zinc-100">
                      <div 
                        className="h-full bg-zinc-900" 
                        style={{ width: `${(goal.percentNeeded || 0)}%` }} 
                        title="Needed"
                      />
                      <div 
                        className="h-full bg-zinc-400" 
                        style={{ width: `${(goal.percentWanted || 0)}%` }} 
                        title="Wanted"
                      />
                   </div>
                   <div className="flex justify-between text-[9px] font-black uppercase tracking-widest">
                      <div className="flex items-center gap-1 text-zinc-900">
                        <div className="w-2 h-2 bg-zinc-900 rounded-full" />
                        <span>Needed ({goal.percentNeeded || 0}%)</span>
                      </div>
                      <div className="flex items-center gap-1 text-zinc-400">
                        <div className="w-2 h-2 bg-zinc-400 rounded-full" />
                        <span>Wanted ({goal.percentWanted || 0}%)</span>
                      </div>
                   </div>
                </div>
              </div>
            </motion.div>
          )})}
          
          {goals.length === 0 && (
            <div className="col-span-full py-20 flex flex-col items-center justify-center text-zinc-300 border-2 border-dashed border-zinc-100 rounded-3xl">
              <Target className="w-12 h-12 mb-4 opacity-50" />
              <p className="font-bold uppercase tracking-widest text-sm">No budgeting goals yet.</p>
              <button 
                onClick={() => setIsAddingGoal(true)}
                className="mt-4 text-zinc-900 font-bold hover:underline"
              >
                Create your first note pad
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Timely Expenses Section */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="text-xl font-bold text-zinc-900">Timely Expenses</h3>
          </div>
          <button 
            onClick={() => setIsAddingExpense(true)}
            className="text-sm font-bold text-zinc-900 hover:bg-zinc-100 px-4 py-2 rounded-xl transition-all flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Expense
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-zinc-900 text-white rounded-2xl p-5 border border-zinc-800 space-y-4 shadow-xl">
             <div className="flex items-center gap-2 mb-1">
                <ArrowUpRight className="w-4 h-4 text-emerald-400" />
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Quick Inflow</span>
             </div>
             <input 
                type="number" 
                placeholder="Gift / Bonus"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-black font-mono placeholder:text-zinc-700 outline-none focus:border-emerald-500 transition-colors"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleQuickAdjustment('add', e.currentTarget.value);
                    e.currentTarget.value = '';
                  }
                }}
             />
             <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest text-center italic">Press Enter to Add</p>
          </div>

          <div className="bg-white rounded-2xl p-5 border-2 border-zinc-900 space-y-4 shadow-xl">
             <div className="flex items-center gap-2 mb-1">
                <MinusCircle className="w-4 h-4 text-rose-500" />
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Quick Outflow</span>
             </div>
             <input 
                type="number" 
                placeholder="Cash Spend"
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm font-black font-mono placeholder:text-zinc-300 outline-none focus:border-rose-500 transition-colors"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleQuickAdjustment('remove', e.currentTarget.value);
                    e.currentTarget.value = '';
                  }
                }}
             />
             <p className="text-[9px] text-zinc-400 font-bold uppercase tracking-widest text-center italic">Press Enter to Deduct</p>
          </div>

          {sortedExpenses.map(expense => (
            <motion.div 
              layout
              key={expense.id}
              className={cn(
                "border p-5 rounded-2xl flex items-center justify-between group transition-all relative overflow-hidden",
                expense.isAutoDeduce ? "bg-white border-zinc-900 shadow-lg" : "bg-zinc-50 border-zinc-200 opacity-60",
                expense.isUrgent && "border-rose-500"
              )}
            >
              {expense.isUrgent && (
                <div className="absolute top-0 right-0 p-1 px-3 bg-rose-500 text-white text-[8px] font-black uppercase tracking-widest rounded-bl-xl">
                  URGENT
                </div>
              )}
              <div className="space-y-1 flex-1">
                <div className="flex items-center gap-2">
                   <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{expense.frequency}</p>
                   {expense.isAutoDeduce && <span className="text-[8px] font-black bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded border border-emerald-100">DEDUCING</span>}
                </div>
                <h4 className="font-bold text-zinc-900 leading-tight">{expense.item}</h4>
                <p className={cn("text-sm font-black font-mono", expense.isAutoDeduce ? "text-zinc-900" : "text-zinc-500")}>
                  {formatCurrency(expense.amount)}
                </p>
              </div>
              <div className="flex flex-col gap-1 items-end">
                <button 
                  onClick={() => toggleExpenseDeduction(expense.id, expense.isAutoDeduce)}
                  title={expense.isAutoDeduce ? "Stop Auto-Deduce" : "Start Auto-Deduce"}
                  className={cn(
                    "p-2 rounded-lg transition-all",
                    expense.isAutoDeduce ? "text-emerald-500 bg-emerald-50" : "text-zinc-300 hover:text-zinc-500 bg-white"
                  )}
                >
                  {expense.isAutoDeduce ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
                </button>
                <button 
                  onClick={() => deleteExpense(expense.id)}
                  className="p-2 text-zinc-200 hover:text-rose-500 hover:bg-rose-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {isAddingGoal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[2rem] w-full max-w-lg shadow-2xl overflow-hidden"
            >
              <div className="p-8 border-b border-zinc-100">
                <h3 className="text-2xl font-bold text-zinc-900">Custom Budget Note Pad</h3>
                <p className="text-zinc-500 text-sm">Define what you're saving for and how to get there.</p>
              </div>

              <form onSubmit={handleAddGoal} className="p-8 space-y-6">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Item Name</label>
                  <input name="item" required autoFocus className="w-full bg-zinc-50 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-zinc-900 font-medium" placeholder="MacBook Pro, New Shoes, House Fund..." />
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Target Price</label>
                    <div className="relative">
                      <DollarSign className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" />
                      <input name="price" type="number" step="0.01" required className="w-full bg-zinc-50 border-none rounded-2xl pl-10 pr-6 py-4 focus:ring-2 focus:ring-zinc-900 font-medium" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Est. Weeks Override</label>
                    <input name="estWeeks" type="number" defaultValue="0" disabled className="w-full bg-zinc-50 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-zinc-900 font-medium opacity-50" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">% Needed</label>
                    <div className="flex items-center gap-3">
                      <input name="percentNeeded" type="number" min="0" max="100" defaultValue="10" className="w-full bg-zinc-50 border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-zinc-900 font-bold" />
                      <span className="font-mono font-bold text-zinc-400">%</span>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">% Wanted</label>
                    <div className="flex items-center gap-3">
                      <input name="percentWanted" type="number" min="0" max="100" defaultValue="5" className="w-full bg-zinc-50 border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-zinc-900 font-bold" />
                      <span className="font-mono font-bold text-zinc-400">%</span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button type="submit" className="flex-1 bg-zinc-900 text-white font-bold py-5 rounded-2xl hover:bg-zinc-800 shadow-lg transition-transform active:scale-[0.98]">
                    Save Note Pad
                  </button>
                  <button type="button" onClick={() => setIsAddingGoal(false)} className="px-8 bg-zinc-100 text-zinc-600 font-bold rounded-2xl hover:bg-zinc-200 transition-colors">
                    Back
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {isSettingInitial && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl w-full max-w-sm shadow-2xl p-8"
            >
              <h3 className="text-xl font-bold text-zinc-900 mb-6 text-center">Financial Baseline</h3>
              <form onSubmit={handleUpdateBalance} className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Fluid Balance</label>
                    <div className="relative">
                      <DollarSign className="w-6 h-6 absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" />
                      <input 
                        name="amount" 
                        type="number" 
                        step="0.01" 
                        defaultValue={profile?.balance}
                        autoFocus 
                        className="w-full bg-zinc-50 border-none rounded-2xl pl-12 pr-6 py-5 focus:ring-2 focus:ring-zinc-900 font-mono text-3xl font-bold" 
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Paycheck Amount</label>
                    <div className="relative">
                      <DollarSign className="w-6 h-6 absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" />
                      <input 
                        name="paycheck" 
                        type="number" 
                        step="0.01" 
                        defaultValue={profile?.payPerPaycheck || 0}
                        className="w-full bg-zinc-50 border-none rounded-2xl pl-12 pr-6 py-5 focus:ring-2 focus:ring-zinc-900 font-mono text-3xl font-bold" 
                      />
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button type="submit" className="flex-1 bg-zinc-900 text-white font-bold py-4 rounded-xl hover:bg-zinc-800 transition-transform active:scale-[0.98]">Update</button>
                  <button type="button" onClick={() => setIsSettingInitial(false)} className="px-4 bg-zinc-100 text-zinc-600 font-bold rounded-xl hover:bg-zinc-200">Cancel</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {isAddingExpense && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[2rem] w-full max-w-sm shadow-2xl p-8"
            >
              <h3 className="text-xl font-bold text-zinc-900 mb-6 font-mono italic tracking-tighter">ADD TIMELY EXPENSE</h3>
              <form onSubmit={handleAddExpense} className="space-y-5">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-900 uppercase tracking-[0.2em] pl-1">What is it?</label>
                  <input name="item" required placeholder="Monster, Spotify, Gas..." className="w-full bg-zinc-50 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-zinc-900 font-bold" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-900 uppercase tracking-[0.2em] pl-1">Amount</label>
                    <div className="relative">
                      <DollarSign className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" />
                      <input name="amount" type="number" step="0.01" required className="w-full bg-zinc-50 border-none rounded-2xl pl-10 pr-6 py-4 focus:ring-2 focus:ring-zinc-900 font-bold" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-900 uppercase tracking-[0.2em] pl-1">Cycles</label>
                    <select name="frequency" className="w-full bg-zinc-50 border-none rounded-2xl px-4 py-4 focus:ring-2 focus:ring-zinc-900 font-bold">
                      <option>Daily</option>
                      <option>Weekly</option>
                      <option>Bi-Weekly</option>
                      <option>Monthly</option>
                    </select>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-4 bg-rose-50/50 rounded-2xl border border-rose-100">
                  <input 
                    name="isUrgent" 
                    type="checkbox" 
                    className="w-5 h-5 rounded border-rose-300 text-rose-600 focus:ring-rose-500" 
                  />
                  <div className="space-y-0.5 pointer-events-none">
                    <p className="text-xs font-bold text-rose-900 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      Mark as Urgent
                    </p>
                    <p className="text-[9px] text-rose-400 font-medium leading-tight">Priority deduction before all other budget items.</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-4 bg-zinc-50 rounded-2xl border border-zinc-100">
                  <input 
                    name="isAutoDeduce" 
                    type="checkbox" 
                    defaultChecked
                    className="w-5 h-5 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900" 
                  />
                  <div className="space-y-0.5 pointer-events-none">
                    <p className="text-xs font-bold text-zinc-900">Enable Auto-Deduction</p>
                    <p className="text-[9px] text-zinc-400 font-medium leading-tight">Factor this cost into your budget calculations.</p>
                  </div>
                </div>
                <div className="flex gap-3 pt-4">
                  <button type="submit" className="flex-1 bg-zinc-900 text-white font-black py-4 rounded-2xl shadow-xl hover:bg-zinc-800 transition-all uppercase tracking-widest text-[10px]">Track Expense</button>
                  <button type="button" onClick={() => setIsAddingExpense(false)} className="px-6 bg-zinc-100 text-zinc-500 font-bold rounded-2xl hover:bg-zinc-200 transition-all text-[10px] uppercase">Back</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
