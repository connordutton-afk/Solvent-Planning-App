import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, deleteDoc, doc, updateDoc, orderBy, limit } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../Auth';
import { SchoolNote, AcademicRecord, AcademicSession } from '../../types';
import { GoogleGenAI } from "@google/genai";
import { format, parseISO, differenceInDays, isSameDay, isWeekend, eachDayOfInterval } from 'date-fns';
import { 
  BookOpen, 
  GraduationCap, 
  StickyNote, 
  Search, 
  Sparkles, 
  Plus, 
  Trash2, 
  BarChart3, 
  Loader2, 
  ChevronRight,
  TrendingUp,
  BrainCircuit,
  School,
  CalendarDays,
  Target,
  Info,
  Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export function SchoolView() {
  const { user, profile } = useAuth();
  const [notes, setNotes] = useState<SchoolNote[]>([]);
  const [records, setRecords] = useState<AcademicRecord[]>([]);
  const [sessions, setSessions] = useState<AcademicSession[]>([]);
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [isAddingRecord, setIsAddingRecord] = useState(false);
  const [isAddingSession, setIsAddingSession] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isQuickSyncMode, setIsQuickSyncMode] = useState(false);
  const [isCurrentGradesMode, setIsCurrentGradesMode] = useState(false);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [aiAheadness, setAiAheadness] = useState<number | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('all');
  const [counselorInput, setCounselorInput] = useState('');
  const [aiAdvice, setAiAdvice] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [progressAnalysis, setProgressAnalysis] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    const notesQ = query(collection(db, 'school_notes'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'));
    const recordsQ = query(collection(db, 'academic_records'), where('userId', '==', user.uid), orderBy('updatedAt', 'desc'));
    const sessionsQ = query(collection(db, 'academic_sessions'), where('userId', '==', user.uid), orderBy('startDate', 'desc'));

    const unsubNotes = onSnapshot(notesQ, (s) => setNotes(s.docs.map(d => ({ id: d.id, ...d.data() } as SchoolNote))));
    const unsubRecords = onSnapshot(recordsQ, (s) => setRecords(s.docs.map(d => ({ id: d.id, ...d.data() } as AcademicRecord))));
    const unsubSessions = onSnapshot(sessionsQ, (s) => setSessions(s.docs.map(d => ({ id: d.id, ...d.data() } as AcademicSession))));

    return () => { unsubNotes(); unsubRecords(); unsubSessions(); };
  }, [user]);

  const handleUpdateProfile = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    const formData = new FormData(e.currentTarget);
    await updateDoc(doc(db, 'users', user.uid), {
      currentGradeLevel: formData.get('gradeLevel'),
      targetGradeAverage: parseFloat(formData.get('targetGrade') as string),
      learningChallenges: formData.get('learningChallenges')
    });
    setIsEditingProfile(false);
  };

  const handleUpdateRecord = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user || !editingRecordId) return;
    const formData = new FormData(e.currentTarget);
    await updateDoc(doc(db, 'academic_records', editingRecordId), {
      subject: formData.get('subject'),
      grade: formData.get('grade'),
      currentProgress: parseInt(formData.get('progress') as string),
      extraKnowledge: formData.get('extra'),
      updatedAt: new Date().toISOString()
    });
    setEditingRecordId(null);
  };

  const handleUpdateRecordProgress = async (id: string, progress: number) => {
    await updateDoc(doc(db, 'academic_records', id), {
      currentProgress: Math.min(100, Math.max(0, progress)),
      updatedAt: new Date().toISOString()
    });
  };

  const handleUpdateRecordActualGrade = async (id: string, grade: string) => {
    const numericGrade = parseFloat(grade);
    if (isNaN(numericGrade)) return;
    await updateDoc(doc(db, 'academic_records', id), {
      actualGrade: Math.min(100, Math.max(0, numericGrade)),
      updatedAt: new Date().toISOString()
    });
  };

  const calculateAiEfficiency = async () => {
    if (!user || records.length === 0) return;
    setIsAiLoading(true);
    const status = calculateAheadness();
    try {
      const activeSession = sessions.find(s => {
        const now = new Date();
        return now >= parseISO(s.startDate) && now <= parseISO(s.endDate);
      });

      const prompt = `Analyze my academic efficiency on a scale of 1% to 500% (100% is standard).
        Depicted Grade Level: ${profile?.currentGradeLevel}
        Learning Challenges/Context: ${profile?.learningChallenges || 'None reported'}
        Academic Session: ${activeSession?.name} at ${activeSession?.schoolName}
        Current Date: ${format(new Date(), 'yyyy-MM-dd')}
        Calendar Progress: ${status.timeProgress.toFixed(1)}% through the year.
        Records: ${JSON.stringify(records.map(r => ({
          subject: r.subject,
          ambition: r.grade,
          actualGrade: r.actualGrade || 'Not set',
          curriculumMastery: r.currentProgress,
          extraContext: r.extraKnowledge
        })))}
        Consider class names (e.g., "Algebra 2" is harder than "Algebra 1") and whether I am ahead of the school's schedule. 
        Adjust for my specified learning challenges.
        Return ONLY a JSON object: {"efficiency": number, "explanation": "string"}`;

      const result = await ai.models.generateContent({
        model: "gemini-1.5-flash",
        contents: prompt
      });
      const data = JSON.parse(result.text?.replace(/```json|```/g, '') || '{}');
      setAiAheadness(data.efficiency);
      setProgressAnalysis(data.explanation);
    } catch (e) {
      console.error(e);
    } finally {
      setIsAiLoading(false);
    }
  };

  useEffect(() => {
    if (records.length > 0) {
      calculateAiEfficiency();
    }
  }, [records.length, selectedSessionId]);

  const handleAddNote = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    const formData = new FormData(e.currentTarget);
    await addDoc(collection(db, 'school_notes'), {
      userId: user.uid,
      title: formData.get('title'),
      content: formData.get('content'),
      createdAt: new Date().toISOString(),
      tags: []
    });
    setIsAddingNote(false);
  };

  const handleAddRecord = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    const formData = new FormData(e.currentTarget);
    await addDoc(collection(db, 'academic_records'), {
      userId: user.uid,
      subject: formData.get('subject'),
      periodId: formData.get('periodId'),
      grade: formData.get('grade'),
      currentProgress: parseInt(formData.get('progress') as string),
      extraKnowledge: formData.get('extra'),
      updatedAt: new Date().toISOString()
    });
    setIsAddingRecord(false);
  };

  const handleAddSession = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    const formData = new FormData(e.currentTarget);
    await addDoc(collection(db, 'academic_sessions'), {
      userId: user.uid,
      name: formData.get('name'),
      schoolName: formData.get('schoolName'),
      startDate: formData.get('startDate'),
      endDate: formData.get('endDate')
    });
    setIsAddingSession(false);
  };

  // Improved calculation with grade weighting and time comparison
  const calculateAheadness = () => {
    const now = new Date();
    const activeSession = sessions.find(s => {
      const start = parseISO(s.startDate);
      const end = parseISO(s.endDate);
      return now >= start && now <= end;
    }) || sessions[0];

    if (!activeSession) return { 
      aheadness: 0, label: 'Disconnected', timeProgress: 0, acadProgress: 0, daysRemaining: 0, gradeAverage: 0, activeSession: null
    };

    const sessionRecords = records.filter(r => r.periodId === activeSession.id);
    const start = parseISO(activeSession.startDate);
    const end = parseISO(activeSession.endDate);

    const allDays = eachDayOfInterval({ start, end });
    const schoolDays = allDays.filter(day => !isWeekend(day));
    const totalSchoolDays = schoolDays.length;
    const elapsedSchoolDays = schoolDays.filter(day => day <= now).length;
    const timeProgress = totalSchoolDays > 0 ? elapsedSchoolDays / totalSchoolDays : 0;
    const daysRemaining = Math.max(0, totalSchoolDays - elapsedSchoolDays);

    const avgAcadProgress = sessionRecords.length > 0 
      ? sessionRecords.reduce((sum, r) => sum + r.currentProgress, 0) / sessionRecords.length
      : 0;

    const currentGradeAvg = sessionRecords.length > 0 ? sessionRecords.reduce((sum, r) => {
      const g = r.actualGrade || 0;
      return sum + g;
    }, 0) / sessionRecords.length : 0;
    
    const target = profile?.targetGradeAverage || 100;
    const qualityFactor = target > 0 ? (currentGradeAvg / target) : 1;

    let efficiency = timeProgress > 0 ? ((avgAcadProgress / 100) / timeProgress) : 1;
    if (currentGradeAvg > 0) efficiency *= qualityFactor;

    const aheadPercent = aiAheadness !== null ? aiAheadness : (efficiency * 100);
    
    const statusLabel = 
      aheadPercent > 150 ? 'Elite Velocity ⚡' :
      aheadPercent > 110 ? 'Ahead of Curve 🚀' :
      aheadPercent > 90 ? 'On Target' :
      'At Risk 🛑';

    return { 
      aheadness: aheadPercent,
      label: statusLabel, 
      timeProgress: timeProgress * 100, 
      acadProgress: avgAcadProgress,
      activeSession,
      daysRemaining,
      gradeAverage: currentGradeAvg
    };
  };

  const status = calculateAheadness();

  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);

  const handleDeleteSession = async (id: string) => {
    await deleteDoc(doc(db, 'academic_sessions', id));
    if (selectedSessionId === id) setSelectedSessionId('all');
    setSessionToDelete(null);
  };

  const getJobAdvice = async () => {
    if (!counselorInput) return;
    setIsAiLoading(true);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `I want to be a ${counselorInput}. Based on my current school records: ${JSON.stringify(records)}, what should I learn next or change in my current path? Current Efficiency: ${status.aheadness.toFixed(0)}%. Be concise and encouraging.`
      });
      setAiAdvice(response.text || "No advice found.");
    } catch (e) {
      console.error(e);
      setAiAdvice("Error connecting to AI Counselor.");
    } finally {
      setIsAiLoading(false);
    }
  };

  const analyzeSchedule = async () => {
    setIsAiLoading(true);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Analyze my academic standing. Efficiency: ${status.aheadness.toFixed(0)}%. Records: ${JSON.stringify(records)}. Sessions: ${JSON.stringify(sessions)}. Tell me if I am ahead or behind schedule and why. Be specific about subjects.`
      });
      setProgressAnalysis(response.text || "Analysis busy.");
    } catch (e) {
      console.error(e);
    } finally {
      setIsAiLoading(false);
    }
  };

  const filteredRecords = selectedSessionId === 'all' 
    ? records 
    : records.filter(r => r.periodId === selectedSessionId);

  const groupedRecords = filteredRecords.reduce((acc, record) => {
    const session = sessions.find(s => s.id === record.periodId);
    const key = session ? `${session.name} @ ${session.schoolName}` : 'Unassigned';
    if (!acc[key]) acc[key] = [];
    acc[key].push(record);
    return acc;
  }, {} as Record<string, AcademicRecord[]>);

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-12">
      <AnimatePresence>
        {isCurrentGradesMode && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden bg-white border-2 border-zinc-900 rounded-[2.5rem] shadow-2xl mb-8"
          >
            <div className="p-8 space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-black italic tracking-tighter flex items-center gap-2">
                    <GraduationCap className="w-5 h-5" /> CURRENT GRADES
                  </h3>
                  <p className="text-zinc-500 text-[10px] uppercase font-bold tracking-widest mt-1">Input your actual scores for final aheadness calculation</p>
                </div>
                <button onClick={() => setIsCurrentGradesMode(false)} className="text-zinc-500 hover:text-zinc-900 transition-colors">
                  <Plus className="w-6 h-6 rotate-45" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {records.map(record => (
                  <div key={record.id} className="bg-zinc-50 p-8 rounded-[2rem] border border-zinc-200 flex items-center justify-between gap-6 hover:border-zinc-300 transition-colors">
                    <div className="min-w-0 flex-1">
                      <h4 className="font-bold text-base text-zinc-900 leading-tight mb-1">{record.subject}</h4>
                      <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">Mastery Goal: {record.grade}</p>
                    </div>
                    <div className="w-32 shrink-0">
                      <div className="relative group/input">
                        <input 
                          type="number"
                          placeholder="Grade %"
                          defaultValue={record.actualGrade}
                          onBlur={(e) => handleUpdateRecordActualGrade(record.id, e.target.value)}
                          className="w-full bg-white border-2 border-zinc-200 rounded-2xl px-4 py-4 text-lg font-black font-mono text-center focus:ring-4 focus:ring-zinc-900/5 focus:border-zinc-900 outline-none transition-all"
                        />
                        <div className="absolute -top-2 -right-2 bg-zinc-900 text-white text-[8px] font-black px-2 py-1 rounded-md opacity-0 group-focus-within/input:opacity-100 transition-opacity">
                          LIVE GRADE
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isQuickSyncMode && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden bg-zinc-900 text-white rounded-[2.5rem] border border-white/10 shadow-2xl mb-8"
          >
            <div className="p-8 space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-black italic tracking-tighter flex items-center gap-2">
                    <Zap className="w-5 h-5 text-yellow-400" /> DAILY SYNC PROTOCOL
                  </h3>
                  <p className="text-zinc-500 text-[10px] uppercase font-bold tracking-widest mt-1">Update all class progression markers daily</p>
                </div>
                <button onClick={() => setIsQuickSyncMode(false)} className="text-zinc-500 hover:text-white transition-colors">
                  <Plus className="w-6 h-6 rotate-45" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {records.slice(0, 8).map(record => (
                  <div key={record.id} className="bg-white/5 p-5 rounded-2xl border border-white/5 space-y-4">
                    <div className="flex justify-between items-start">
                      <h4 className="font-bold text-sm truncate pr-2">{record.subject}</h4>
                      <span className="text-[10px] font-black font-mono text-zinc-400">{record.currentProgress}%</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={() => handleUpdateRecordProgress(record.id, record.currentProgress - 5)}
                        className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                      >-</button>
                      <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full bg-white" style={{ width: `${record.currentProgress}%` }} />
                      </div>
                      <button 
                        onClick={() => handleUpdateRecordProgress(record.id, record.currentProgress + 5)}
                        className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                      >+</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h2 className="text-3xl font-bold tracking-tight text-zinc-900 italic font-mono uppercase">ACADEMIC ENGINE</h2>
            {profile?.currentGradeLevel && (
              <span className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-black tracking-widest border border-emerald-100">
                {profile.currentGradeLevel}
              </span>
            )}
          </div>
          <p className="text-zinc-500 font-medium tracking-tight">Syncing your curriculum with reality.</p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setIsCurrentGradesMode(!isCurrentGradesMode)}
            className={cn(
              "flex items-center gap-2 px-5 py-2.5 rounded-[1.25rem] text-xs font-bold transition-all shadow-sm active:scale-95 border",
              isCurrentGradesMode ? "bg-zinc-900 text-white border-zinc-900" : "bg-white border-zinc-200 text-zinc-900 hover:bg-zinc-50"
            )}
          >
            <GraduationCap className="w-4 h-4" />
            Current Grades
          </button>
          <button 
            onClick={() => setIsQuickSyncMode(!isQuickSyncMode)}
            className={cn(
              "flex items-center gap-2 px-5 py-2.5 rounded-[1.25rem] text-xs font-bold transition-all shadow-sm active:scale-95",
              isQuickSyncMode ? "bg-zinc-900 text-white" : "bg-white border border-zinc-200 text-zinc-900 hover:bg-zinc-50"
            )}
          >
            <Zap className="w-4 h-4" />
            Quick Sync
          </button>
          <button 
            onClick={() => setIsEditingProfile(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-white border border-zinc-200 rounded-[1.25rem] text-xs font-bold hover:bg-zinc-50 transition-all shadow-sm active:scale-95"
          >
            <Target className="w-4 h-4 text-zinc-400" />
            Set Grade Level
          </button>
          <button 
            onClick={() => setIsAddingSession(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-white border border-zinc-200 rounded-[1.25rem] text-xs font-bold hover:bg-zinc-50 transition-all shadow-sm active:scale-95"
          >
            <School className="w-4 h-4 text-zinc-400" />
            Academic Year
          </button>
          <button 
            onClick={() => setIsAddingRecord(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-zinc-900 text-white rounded-[1.25rem] text-xs font-bold hover:bg-zinc-800 transition-all shadow-lg active:scale-95"
          >
            <Plus className="w-4 h-4" />
            New Class
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Ahead-ness Dashboard */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-[2.5rem] p-10 border border-zinc-200 shadow-xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-10 opacity-[0.03] -rotate-12 pointer-events-none">
              <TrendingUp className="w-80 h-80" />
            </div>
            
            <div className="relative z-10 grid grid-cols-1 md:grid-cols-12 gap-12 items-start">
              <div className="md:col-span-4 space-y-6">
                <div>
                  <div className="flex items-center gap-2 text-xs font-black text-emerald-600 uppercase tracking-[0.25em] mb-2 bg-emerald-50 w-fit px-3 py-1 rounded-full">
                    <Target className="w-3 h-3" />
                    ACADEMIC VELOCITY
                  </div>
                  <h3 className="text-4xl font-black text-zinc-900 italic tracking-tighter">{status.label}</h3>
                  {status.activeSession && (
                    <div className="flex flex-col gap-1 mt-4">
                      <p className="text-sm font-bold text-zinc-900 flex items-center gap-2">
                        <School className="w-4 h-4 text-zinc-400" />
                        {status.activeSession.schoolName}
                      </p>
                      <p className="text-xs font-medium text-zinc-500 italic">
                        {status.activeSession.name} • {status.daysRemaining} days remaining in year
                      </p>
                    </div>
                  )}
                </div>
                
                <div className="space-y-1">
                    <span className="text-6xl font-black font-mono tracking-tighter text-zinc-900">
                        {status.aheadness.toFixed(0)}<span className="text-2xl">%</span>
                    </span>
                    <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest pl-1">PACE VS. STANDARD STUDENT</p>
                </div>
              </div>

              <div className="md:col-span-8 space-y-12">
                {/* PACE BAR */}
                <div className="space-y-4">
                  <div className="flex justify-between items-end">
                    <div className="space-y-1">
                        <p className="text-xs font-bold text-zinc-900">Efficiency Indicator</p>
                        <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-widest">
                          {status.aheadness >= 0 ? `${status.aheadness.toFixed(1)}% ahead of standard student` : `${Math.abs(status.aheadness).toFixed(1)}% behind standard student`}
                        </p>
                    </div>
                    <div className="text-right">
                        <p className="text-2xl font-black text-zinc-900 italic">
                            {status.aheadness > 0 ? `+${status.aheadness.toFixed(0)}%` : `${status.aheadness.toFixed(0)}%`}
                        </p>
                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Delta Baseline</p>
                    </div>
                  </div>
                  
                  <div className="relative h-14 bg-zinc-100 rounded-3xl border-2 border-zinc-200 p-1.5 overflow-hidden group">
                    <button 
                       onClick={calculateAiEfficiency}
                       disabled={isAiLoading}
                       className="absolute right-3 top-1/2 -translate-y-1/2 z-40 bg-white/20 backdrop-blur-md p-2 rounded-full hover:bg-white/40 transition-all active:scale-95 border border-white/20"
                    >
                       {isAiLoading ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : <Sparkles className="w-4 h-4 text-white" />}
                    </button>
                    {/* Standard Student Marker (Year Progression) */}
                    <div 
                      className="absolute top-0 bottom-0 w-0.5 bg-zinc-400 z-30 shadow-sm" 
                      style={{ left: `${status.timeProgress}%` }}
                    >
                      <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-[9px] font-black text-zinc-400 uppercase">Standard Pace</span>
                      </div>
                    </div>

                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, status.aheadness / 5)}%` }}
                      className="h-full rounded-2xl bg-gradient-to-r from-zinc-900 to-zinc-700 shadow-xl relative z-20 flex items-center px-4"
                    >
                        <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.1)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.1)_50%,rgba(255,255,255,0.1)_75%,transparent_75%,transparent)] bg-[length:1rem_1rem] opacity-20" />
                        <span className="text-[11px] font-black text-white uppercase tracking-widest relative z-10">
                          {status.aheadness.toFixed(0)}% VELOCITY
                        </span>
                    </motion.div>
                    
                    {/* Ghost bar for time progression */}
                    <div 
                        className="absolute top-1.5 left-1.5 bottom-1.5 rounded-2xl border border-dashed border-zinc-400 opacity-20"
                        style={{ width: `calc(${status.timeProgress}% - 6px)` }}
                    />
                  </div>
                  
                  <div className="flex justify-between items-center px-2">
                    <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Current Standard Student: {status.timeProgress.toFixed(0)}%</p>
                    <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Year Completion</p>
                  </div>
                  {progressAnalysis && (
                    <div className="mt-4 p-4 bg-zinc-50 rounded-2xl border border-zinc-100 italic text-[11px] text-zinc-500 font-medium leading-relaxed">
                      "{progressAnalysis}"
                    </div>
                  )}
                </div>

                {/* YEARLY GRADE PROGRESS BAR */}
                <div className="space-y-4 pt-8 border-t border-zinc-100">
                  <div className="flex justify-between items-end">
                    <div className="space-y-1">
                        <p className="text-xs font-bold text-zinc-900 uppercase tracking-widest">Grade Target Progress</p>
                        <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-widest">Yearly progression toward average of {profile?.targetGradeAverage || 100}%</p>
                    </div>
                    <div className="text-right">
                        <p className="text-2xl font-black text-zinc-900 italic">
                            {((status.gradeAverage / (profile?.targetGradeAverage || 100)) * 100).toFixed(0)}%
                        </p>
                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Goal Completion</p>
                    </div>
                  </div>
                  
                  <div className="relative h-6 bg-zinc-100 rounded-full border border-zinc-200 p-1 overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, (status.gradeAverage / (profile?.targetGradeAverage || 100)) * 100)}%` }}
                      className="h-full rounded-full bg-emerald-500 shadow-inner"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-12 lg:gap-20 pt-4">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                        <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Calendar Progression</p>
                        <span className="text-sm font-black font-mono">{status.timeProgress.toFixed(0)}%</span>
                    </div>
                    <div className="h-2 w-full bg-zinc-50 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${status.timeProgress}%` }}
                        className="h-full bg-zinc-300 rounded-full" 
                      />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                        <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Curriculum Mastery</p>
                        <span className="text-sm font-black font-mono">{status.acadProgress.toFixed(0)}%</span>
                    </div>
                    <div className="h-2 w-full bg-zinc-50 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${status.acadProgress}%` }}
                        className="h-full bg-zinc-900 rounded-full" 
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Academic Records */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold flex items-center gap-2 italic">
              <GraduationCap className="w-5 h-5 text-zinc-400" /> Subject Catalog
            </h3>
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar max-w-[400px]">
                <button
                    onClick={() => setSelectedSessionId('all')}
                    className={cn(
                    "px-4 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap",
                    selectedSessionId === 'all' ? "bg-zinc-900 text-white shadow-lg" : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
                    )}
                >
                    All History
                </button>
                {sessions.map(s => (
                    <div key={s.id} className="relative group/chip">
                        <button
                            onClick={() => setSelectedSessionId(s.id)}
                            className={cn(
                            "px-4 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap pr-8",
                            selectedSessionId === s.id ? "bg-zinc-900 text-white shadow-lg" : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
                            )}
                        >
                            {s.name}
                        </button>
                        <button 
                            onClick={(e) => {
                                e.stopPropagation();
                                setSessionToDelete(s.id);
                            }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-rose-500 transition-colors"
                        >
                            <Trash2 className="w-3 h-3" />
                        </button>
                    </div>
                ))}
            </div>
          </div>

          <div className="space-y-12">
            {Object.entries(groupedRecords).map(([sessionTitle, periodRecords]) => (
              <div key={sessionTitle} className="space-y-6">
                <div className="flex items-center gap-4">
                  <span className="text-[10px] font-black text-zinc-900 uppercase tracking-[0.3em] bg-zinc-100 px-3 py-1 rounded-md">{sessionTitle}</span>
                  <div className="h-px flex-1 bg-zinc-100" />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {(periodRecords as AcademicRecord[]).map(record => (
                    <div key={record.id} className="bg-white p-6 rounded-[2rem] border border-zinc-200 shadow-sm hover:shadow-xl transition-all group relative">
                      <div className="absolute top-4 right-4 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                        <button 
                            onClick={() => setEditingRecordId(record.id)}
                            className="p-2 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-50 rounded-xl transition-all"
                        >
                            <Plus className="w-4 h-4 rotate-0" />
                        </button>
                        <button 
                            onClick={() => deleteDoc(doc(db, 'academic_records', record.id))}
                            className="p-2 text-zinc-200 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="flex justify-between items-start mb-5">
                        <div>
                          <h4 className="font-bold text-zinc-900 text-lg leading-tight">{record.subject}</h4>
                          <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mt-1">Target Grade: {record.grade}</p>
                        </div>
                        <div className="px-3 py-1.5 bg-zinc-900 text-white rounded-xl text-xs font-mono font-bold shadow-lg">
                          {record.currentProgress}%
                        </div>
                      </div>
                      <div className="w-full h-2 bg-zinc-50 rounded-full overflow-hidden border border-zinc-100 p-0.5">
                        <motion.div 
                           initial={{ width: 0 }}
                           animate={{ width: `${record.currentProgress}%` }}
                           className="h-full bg-zinc-900 rounded-full shadow-[0_0_10px_rgba(0,0,0,0.1)]" 
                        />
                      </div>
                      {record.extraKnowledge && (
                        <p className="mt-5 text-[11px] text-zinc-500 italic line-clamp-3 bg-zinc-50/50 p-3 rounded-xl border border-zinc-50">
                          {record.extraKnowledge}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            
            {records.length === 0 && (
              <div className="py-24 flex flex-col items-center justify-center text-zinc-400 bg-zinc-50 rounded-[3rem] border-2 border-dashed border-zinc-200">
                <BarChart3 className="w-16 h-16 opacity-5 mb-6" />
                <p className="font-black uppercase tracking-[0.2em] text-xs text-zinc-400">Registry Isolated & Offline</p>
                <button onClick={() => setIsAddingRecord(true)} className="mt-4 text-zinc-900 font-bold hover:underline underline-offset-8">INITIALIZE FIRST SYNC</button>
              </div>
            )}
          </div>
        </div>

        {/* Notes & Counselor */}
        <div className="space-y-8">
          {/* AI Counselor */}
          <div className="bg-zinc-100 rounded-[2.5rem] p-8 border border-zinc-200 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-5">
              <Sparkles className="w-24 h-24 rotate-12" />
            </div>
            
            <div className="relative z-10 space-y-6">
              <div>
                <h3 className="text-xl font-bold flex items-center gap-3 tracking-tight text-zinc-900">
                  <Search className="w-5 h-5 text-zinc-400" /> CAREER PROXY
                </h3>
                <p className="text-zinc-500 text-xs mt-1 font-medium italic">Simulate your future based on current metrics.</p>
              </div>

              <div className="space-y-3">
                <input 
                    type="text" 
                    value={counselorInput}
                    onChange={(e) => setCounselorInput(e.target.value)}
                    placeholder="Enter target occupation..."
                    className="w-full bg-white border border-zinc-200 rounded-2xl px-5 py-4 text-sm focus:ring-2 focus:ring-zinc-900 transition-all placeholder:text-zinc-400 outline-none font-bold"
                />
                <button 
                  onClick={getJobAdvice}
                  disabled={isAiLoading || !counselorInput}
                  className="w-full bg-zinc-900 text-white font-black py-4 rounded-2xl shadow-xl hover:bg-zinc-800 transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-xs uppercase tracking-widest active:scale-95"
                >
                  {isAiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  Generate Roadmap
                </button>
              </div>

              <AnimatePresence>
                {aiAdvice && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-white border border-zinc-200 rounded-2xl p-5 text-xs text-zinc-600 leading-loose font-bold shadow-sm"
                  >
                    {aiAdvice}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Notes List */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <StickyNote className="w-5 h-5 text-zinc-300" /> Lab Notes
              </h3>
              <button 
                onClick={() => setIsAddingNote(true)}
                className="p-2 hover:bg-zinc-100 rounded-lg transition-colors text-zinc-400"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              {notes.map(note => (
                <div key={note.id} className="bg-white p-6 rounded-2xl border border-zinc-200 group relative shadow-sm hover:shadow-md transition-shadow">
                  <h4 className="font-bold text-zinc-900 mb-2">{note.title}</h4>
                  <p className="text-[11px] text-zinc-500 line-clamp-2 leading-relaxed font-medium">{note.content}</p>
                  <button 
                    onClick={() => deleteDoc(doc(db, 'school_notes', note.id))}
                    className="absolute top-4 right-4 p-2 text-zinc-200 hover:text-rose-500 hover:bg-rose-50 rounded-xl opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {notes.length === 0 && (
                <div className="py-12 text-center text-zinc-300 border-2 border-dashed border-zinc-100 rounded-[2rem]">
                  <p className="text-xs font-bold uppercase tracking-widest">No captures found.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-zinc-50 rounded-[2.5rem] p-10 border border-dashed border-zinc-200">
        <div className="max-w-2xl">
          <h4 className="text-zinc-900 font-bold mb-2 flex items-center gap-2">
            <Info className="w-4 h-4 text-zinc-400" /> What is "Curriculum Mastery"?
          </h4>
          <p className="text-sm text-zinc-500 leading-relaxed">
            Curriculum Mastery represents your physical progress through a course syllabus. 
            While "Grades" measure your performance on what you've already touched, **Mastery** measures how much of the total year's required content you've successfully engaged with. 
            100% Mastery means you have finished the entire course curriculum.
          </p>
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {editingRecordId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/40 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="bg-white rounded-[2.5rem] w-full max-w-md shadow-2xl p-10 space-y-8">
              <div className="flex justify-between items-center">
                <h3 className="text-2xl font-black italic tracking-tighter">EDIT CLASS</h3>
                <button onClick={() => setEditingRecordId(null)} className="p-2 hover:bg-zinc-100 rounded-full transition-colors text-zinc-400">
                  <Plus className="w-6 h-6 rotate-45" />
                </button>
              </div>
              <form onSubmit={handleUpdateRecord} className="space-y-5">
                {(() => {
                  const record = records.find(r => r.id === editingRecordId);
                  if (!record) return null;
                  return (
                    <>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-zinc-900 uppercase tracking-[0.2em] pl-1">Subject Name</label>
                        <input name="subject" defaultValue={record.subject} required className="w-full bg-zinc-50 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-zinc-900 font-bold" />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-zinc-900 uppercase tracking-[0.2em] pl-1">Target Score %</label>
                          <input name="grade" defaultValue={record.grade} required className="w-full bg-zinc-50 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-zinc-900 font-bold" />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-zinc-900 uppercase tracking-[0.2em] pl-1">Initial Mastery %</label>
                          <input name="progress" type="number" defaultValue={record.currentProgress} required className="w-full bg-zinc-50 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-zinc-900 font-bold" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-zinc-900 uppercase tracking-[0.2em] pl-1">Extra Intel (Optional)</label>
                        <textarea name="extra" defaultValue={record.extraKnowledge} className="w-full bg-zinc-50 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-zinc-900 font-bold h-24" />
                      </div>
                      <button type="submit" className="w-full bg-zinc-900 text-white font-black py-5 rounded-2xl shadow-xl hover:bg-zinc-800 transition-all uppercase tracking-widest text-xs">Update Course Registry</button>
                    </>
                  );
                })()}
              </form>
            </motion.div>
          </div>
        )}
        {sessionToDelete && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-md">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-[2.5rem] w-full max-w-sm shadow-2xl p-8 text-center space-y-6">
              <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto">
                <Trash2 className="w-8 h-8" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-black italic tracking-tighter">DELETE SESSION?</h3>
                <p className="text-sm text-zinc-500 font-medium">This will wipe all courses associated with this year. This action is irreversible.</p>
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={() => handleDeleteSession(sessionToDelete)}
                  className="flex-1 bg-rose-500 text-white font-black py-4 rounded-2xl hover:bg-rose-600 transition-all active:scale-[0.98] text-xs uppercase tracking-widest shadow-lg shadow-rose-100"
                >
                  Confirm Wipe
                </button>
                <button 
                  onClick={() => setSessionToDelete(null)}
                  className="flex-1 bg-zinc-100 text-zinc-500 font-bold py-4 rounded-2xl hover:bg-zinc-200 transition-all text-xs"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
        {isEditingProfile && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/40 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="bg-white rounded-[2.5rem] w-full max-w-md shadow-2xl p-10 space-y-8">
              <div className="text-center">
                 <h3 className="text-2xl font-bold italic tracking-tighter">ACADEMIC PROFILE</h3>
                 <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] mt-1">Configuring the calibration baseline</p>
              </div>
              <form onSubmit={handleUpdateProfile} className="space-y-5">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-900 uppercase tracking-[0.2em] pl-1">Grade Level / Year</label>
                  <input 
                    name="gradeLevel" 
                    defaultValue={profile?.currentGradeLevel}
                    required 
                    placeholder="e.g. 10th Grade" 
                    className="w-full bg-zinc-50 border-none rounded-2xl px-6 py-5 focus:ring-2 focus:ring-zinc-900 font-bold placeholder:text-zinc-400 text-lg" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-900 uppercase tracking-[0.2em] pl-1">Target Average Grade</label>
                  <input 
                    name="targetGrade" 
                    type="number"
                    defaultValue={profile?.targetGradeAverage || 100}
                    required 
                    placeholder="e.g. 95, 100" 
                    className="w-full bg-zinc-50 border-none rounded-2xl px-6 py-5 focus:ring-2 focus:ring-zinc-900 font-bold placeholder:text-zinc-400 text-lg" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-900 uppercase tracking-[0.2em] pl-1">Learning Challenges / Context</label>
                  <textarea 
                    name="learningChallenges" 
                    defaultValue={profile?.learningChallenges}
                    placeholder="e.g. ADHD, Dyslexia, English as Second Language, or specific academic difficulty..." 
                    className="w-full bg-zinc-50 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-zinc-900 font-bold placeholder:text-zinc-400 text-sm h-32 resize-none" 
                  />
                </div>
                <div className="flex gap-3 pt-4">
                  <button type="submit" className="flex-1 bg-zinc-900 text-white font-black py-5 rounded-2xl shadow-xl hover:bg-zinc-800 transition-all active:scale-95 text-xs uppercase tracking-widest">Update Baseline</button>
                  <button type="button" onClick={() => setIsEditingProfile(false)} className="px-8 bg-zinc-100 text-zinc-500 font-bold rounded-2xl hover:bg-zinc-200 transition-all text-xs">Dismiss</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
        {isAddingNote && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/40 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="bg-white rounded-[2.5rem] w-full max-w-md shadow-2xl p-10 space-y-8">
              <div className="text-center">
                 <h3 className="text-2xl font-bold italic tracking-tighter">NEW DATA ENTRY</h3>
                 <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mt-1">Academic Lab Observations</p>
              </div>
              <form onSubmit={handleAddNote} className="space-y-5">
                <input name="title" required placeholder="Subject / Title" className="w-full bg-zinc-50 border-none rounded-2xl px-5 py-4 focus:ring-2 focus:ring-zinc-900 font-bold placeholder:text-zinc-400" />
                <textarea name="content" required rows={5} placeholder="Captured insights..." className="w-full bg-zinc-50 border-none rounded-2xl px-5 py-4 focus:ring-2 focus:ring-zinc-900 resize-none font-medium text-sm" />
                <div className="flex gap-3 pt-4">
                  <button type="submit" className="flex-1 bg-zinc-900 text-white font-black py-5 rounded-2xl shadow-xl hover:bg-zinc-800 transition-all active:scale-95 text-xs uppercase tracking-widest">Save Note</button>
                  <button type="button" onClick={() => setIsAddingNote(false)} className="px-8 bg-zinc-100 text-zinc-500 font-bold rounded-2xl hover:bg-zinc-200 transition-all text-xs">Dismiss</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {isAddingRecord && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/40 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="bg-white rounded-[2.5rem] w-full max-w-lg shadow-2xl p-10 space-y-8">
              <div className="space-y-1">
                <h3 className="text-3xl font-black italic tracking-tighter">SUBJECT LOG</h3>
                <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Cataloging active course progress</p>
              </div>
              <form onSubmit={handleAddRecord} className="space-y-5">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-900 uppercase tracking-[0.2em] pl-1 text-center">Active Session</label>
                  <select name="periodId" required className="w-full bg-zinc-50 border-none rounded-2xl px-6 py-5 focus:ring-2 focus:ring-zinc-900 font-black appearance-none text-zinc-900">
                    {sessions.map(s => <option key={s.id} value={s.id}>{s.name} @ {s.schoolName}</option>)}
                    {sessions.length === 0 && <option disabled>Establish a session first</option>}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-900 uppercase tracking-[0.2em] pl-1">Course Title</label>
                  <input name="subject" required placeholder="e.g. Quantum Physics, Art History" className="w-full bg-zinc-50 border-none rounded-2xl px-6 py-5 focus:ring-2 focus:ring-zinc-900 font-bold" />
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-900 uppercase tracking-[0.2em] pl-1">Grade Ambition</label>
                    <input name="grade" required placeholder="A, 4.0, Pass..." className="w-full bg-zinc-50 border-none rounded-2xl px-6 py-5 focus:ring-2 focus:ring-zinc-900 font-bold" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-900 uppercase tracking-[0.2em] pl-1">Knowledge Density %</label>
                    <input name="progress" type="number" min="0" max="100" defaultValue="1" className="w-full bg-zinc-50 border-none rounded-2xl px-6 py-5 focus:ring-2 focus:ring-zinc-900 font-black font-mono text-center" />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-900 uppercase tracking-[0.2em] pl-1">Technical Context</label>
                  <textarea name="extra" placeholder="Internalized concepts, milestones reached..." className="w-full bg-zinc-50 border-none rounded-2xl px-6 py-5 focus:ring-2 focus:ring-zinc-900 resize-none font-medium text-xs h-24" />
                </div>
                <div className="flex gap-4 pt-4">
                  <button type="submit" disabled={sessions.length === 0} className="flex-1 bg-zinc-900 text-white font-black py-5 rounded-[1.5rem] shadow-2xl hover:bg-zinc-800 transition-all disabled:opacity-50 uppercase tracking-widest text-xs active:scale-95">LOG DATA</button>
                  <button type="button" onClick={() => setIsAddingRecord(false)} className="px-10 bg-zinc-100 text-zinc-500 font-black rounded-[1.5rem] hover:bg-zinc-200 transition-all text-xs uppercase tracking-widest">Abort</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {isAddingSession && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/40 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="bg-white rounded-[3rem] w-full max-w-md shadow-2xl p-10 space-y-8">
              <div className="space-y-1 text-center">
                <h3 className="text-3xl font-black italic tracking-tighter uppercase">DEPLOY SESSION</h3>
                <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">Configuring the baseline timeline</p>
              </div>
              <form onSubmit={handleAddSession} className="space-y-5">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-900 uppercase tracking-[0.2em] pl-1">Session Identity</label>
                  <input name="name" required placeholder="e.g. YEAR ONE, SPRING 26" className="w-full bg-zinc-50 border-none rounded-2xl px-6 py-5 focus:ring-2 focus:ring-zinc-900 font-black" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-900 uppercase tracking-[0.2em] pl-1">HQ / School</label>
                  <input name="schoolName" required placeholder="e.g. Oxford, Private Lab" className="w-full bg-zinc-50 border-none rounded-2xl px-6 py-5 focus:ring-2 focus:ring-zinc-900 font-bold" />
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-900 uppercase tracking-[0.2em] pl-1">Protocol Start</label>
                    <input name="startDate" type="date" required className="w-full bg-zinc-50 border-none rounded-2xl px-6 py-5 focus:ring-2 focus:ring-zinc-900 font-bold text-xs" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-900 uppercase tracking-[0.2em] pl-1">Protocol End</label>
                    <input name="endDate" type="date" required className="w-full bg-zinc-50 border-none rounded-2xl px-6 py-5 focus:ring-2 focus:ring-zinc-900 font-bold text-xs" />
                  </div>
                </div>
                <div className="pt-6 space-y-3">
                    <button type="submit" className="w-full bg-zinc-900 text-white font-black py-6 rounded-[2rem] shadow-2xl hover:shadow-emerald-100 transition-all uppercase tracking-[0.2em] text-xs active:scale-95">BOOTSTRAP SESSION</button>
                    <button type="button" onClick={() => setIsAddingSession(false)} className="w-full text-zinc-400 text-[10px] font-black uppercase tracking-widest hover:text-zinc-900 transition-colors py-2">CANCEL DEPLOYMENT</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
