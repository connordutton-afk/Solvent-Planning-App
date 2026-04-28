import { GoogleGenAI } from "@google/genai";
import { UserProfile, BudgetGoal, TimelyExpense, Earning } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function getBudgetAdvice(profile: UserProfile, goals: BudgetGoal[], expenses: TimelyExpense[], earnings: Earning[]) {
  const prompt = `
    As a financial advisor, analyze my budget logic and help me calculate my savings and spending.
    
    My Profile:
    - Current Balance: $${profile.balance}
    - Savings Target: ${profile.savingsPercentage}%
    - Expected Pay per Paycheck: $${profile.payPerPaycheck || 0}
    
    My Earnings History (Last few entries):
    ${earnings.slice(0, 10).map(e => `- $${e.amount} on ${e.date}`).join('\n')}
    
    My Recurring Expenses:
    ${expenses.map(e => `- ${e.item}: $${e.amount} (${e.frequency}) ${e.isUrgent ? '[URGENT]' : ''}`).join('\n')}
    
    My Savings Goals:
    ${goals.map(g => `- ${g.item}: $${g.price} (Needed: ${g.percentNeeded}%, Wanted: ${g.percentWanted}%)`).join('\n')}
    
    Note: [URGENT] expenses must be paid before anything else.
    
    Please provide:
    1. A summary of my financial health based on ACTUAL past earnings vs expected pay.
    2. Concrete calculations on how much I should be putting into each goal per paycheck.
    3. Concrete TIMELINE projections: Based on my average real income, how many months to reach each goal.
    4. Advice on where I can optimize.
    5. A clear "Action Plan" for the next month.
    
    Format the response in clear Markdown.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-1.5-flash",
    contents: prompt,
  });

  return response.text || "No advice generated.";
}

export async function crunchGoalMath(profile: UserProfile, goal: BudgetGoal, expenses: TimelyExpense[], earnings: Earning[]) {
  const avgEarnings = earnings.length ? (earnings.reduce((s, e) => s + e.amount, 0) / earnings.length) : profile.payPerPaycheck;
  const prompt = `
    Analyze this specific goal and explain the math for a $${profile.payPerPaycheck} paycheck (Expected) vs $${avgEarnings?.toFixed(2)} (Observed Average).
    
    Goal: ${goal.item}
    Target Price: $${goal.price}
    Allocation Strategy: ${goal.percentNeeded}% (Needed) + ${goal.percentWanted}% (Wanted from Surplus)
    
    Current Deductions (Urgent Must Be Paid First): 
    ${expenses.filter(e => e.isAutoDeduce).sort((a, b) => (b.isUrgent ? 1 : 0) - (a.isUrgent ? 1 : 0)).map(e => `- ${e.item}: $${e.amount} (${e.frequency}) ${e.isUrgent ? '[URGENT]' : ''}`).join('\n')}
    
    Savings Policy: ${profile.savingsPercentage}%
    
    CRITICAL MATH:
    1. Determine Net Disposable Income: Average Earnings - ALL Auto-Deductions - Savings Target.
    2. Exact timeline: Calculate paychecks/weeks until goal completion using OBSERVED average income ($${avgEarnings?.toFixed(2)}) for realism.
    3. Reality Check: How much per paycheck goes to this goal? ($ and %). Mention if any [URGENT] expenses are significantly impacting the timeline.
    
    Be extremely concise. Use bullet points for the math. No conversational filler.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-1.5-flash",
    contents: prompt,
  });

  return response.text || "Math crunch unavailable.";
}

export async function getCareerAdvice(profile: UserProfile, context: string) {
  const prompt = `
    As a career strategist, tell me exactly how to make more money based on my current profile.
    
    User Details:
    - Age: ${profile.age || 'Not specified'}
    - Certifications: ${profile.certifications?.join(', ') || 'None'}
    - Permits: ${profile.permits?.join(', ') || 'None'}
    - Additional Context: ${profile.careerDetails || 'None'}
    - User's Specific Question/Context: ${context}
    
    Please provide:
    1. 3-5 specific job or side-hustle titles I am qualified for (or nearly qualified for).
    2. A roadmap of "Next Steps" to increase my earning potential (e.g., higher certifications).
    3. Estimated hourly or project-based rates I should target.
    
    Format the response in clear Markdown with bold sections.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-1.5-flash",
    contents: prompt,
  });

  return response.text || "No career advice generated.";
}
