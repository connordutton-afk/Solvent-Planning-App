export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  balance: number;
  startingBalance: number;
  savingsPercentage: number;
  payPerPaycheck?: number;
  theme?: {
    primaryColor: string;
    accentColor: string;
    fontFamily: string;
  };
  currentGradeLevel?: string;
  targetGradeAverage?: number;
  learningChallenges?: string;
  academicSessions?: AcademicSession[];
  age?: number;
  certifications?: string[];
  permits?: string[];
  careerDetails?: string;
  notificationSoundUrl?: string;
  clickSoundUrl?: string;
}

export interface TimelyExpense {
  id: string;
  userId: string;
  item: string;
  amount: number;
  frequency: 'Daily' | 'Weekly' | 'Bi-Weekly' | 'Monthly';
  isAutoDeduce: boolean;
  isUrgent?: boolean;
  createdAt: string;
}

export enum EventType {
  WORK = 'work',
  PERSONAL = 'personal',
  TASK = 'task',
  SCHOOL = 'school',
}

export interface CalendarEvent {
  id: string;
  userId: string;
  title: string;
  description: string;
  startTime: string; // ISO string
  endTime: string;   // ISO string
  type: EventType;
  isUrgent?: boolean;
  recurrence?: 'none' | 'daily' | 'weekly' | 'monthly' | 'weekdays' | 'weekends' | 'bi-daily' | 'annually' | 'one-off';
  parentId?: string;
}

export interface Earning {
  id: string;
  userId: string;
  amount: number;
  hours: number;
  date: string; // ISO date YYYY-MM-DD
  status: 'pending' | 'paid';
  createdAt: string;
}

export interface BudgetGoal {
  id: string;
  userId: string;
  item: string;
  price: number;
  estWeeks: number;
  investPercentage: number;
  percentNeeded: number;
  percentWanted: number;
  createdAt: string;
}

export interface SchoolNote {
  id: string;
  userId: string;
  title: string;
  content: string;
  createdAt: string;
  tags: string[];
}

export interface AcademicRecord {
  id: string;
  userId: string;
  subject: string;
  periodId: string; // References AcademicSession.id
  grade: string;
  currentProgress: number; // 0-100
  actualGrade?: number; // 0-100
  extraKnowledge: string; // Additional info for AI
  updatedAt: string;
}

export interface AcademicSession {
  id: string;
  userId: string;
  name: string;
  schoolName: string;
  startDate: string;
  endDate: string;
}

export enum View {
  CALENDAR = 'calendar',
  WORK = 'work',
  FINANCE = 'finance',
  SCHOOL = 'school',
  SETTINGS = 'settings',
}
