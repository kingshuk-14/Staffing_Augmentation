import React from "react";
import { 
  CheckCircle, XCircle, AlertCircle, TrendingUp, Calendar, ChevronRight, Download, FileText, Send, User, ChevronDown, Award, Briefcase, Zap, Search, Loader2, ArrowRight, RefreshCw, Clock, AlertTriangle
} from "lucide-react";

interface CandidateDecisionCardProps {
  cand: any;
  index: number;
  job: any;
  selectedCandidateIds: number[];
  setSelectedCandidateIds: React.Dispatch<React.SetStateAction<number[]>>;
  updateMatchStatus: (candId: number, status: string) => void;
  setOutsourceModalCand: (cand: any) => void;
  setViewingResume: (cand: any) => void;
  evaluatingId: number | null;
  updatingId: number | null;
  reevaluateCandidate: (candId: number) => void;
}

/**
 * Safely normalizes a matchBreakdown on the frontend side.
 * This is a second safety net — the backend normalizer should have already
 * produced canonical data, but this handles stale cached responses.
 */
function safeBreakdown(raw: any) {
  const defaults = {
    experienceFit: { score: 0, required: 0, candidate: 0, difference: 0, percentage: "N/A", reason: "" },
    skillFit: {
      score: 0, exact_match_score: 0, semantic_match_score: 0, practical_match_score: 0,
      required_skills_count: 0, exact_matches: [], semantic_matches: [], transferable_matches: [],
      practical_matches: [], missing_skills: [], missing_preferred: [], matched_responsibilities: [], reason: ""
    },
    budgetFit: { score: 0, jd_budget: null, candidate_budget: null, difference: null, reason: "" },
    hiringDecision: "Borderline",
    confidence: 0,
    bulleted_summary: [],
    top_strengths: [],
    top_risks: [],
    hiring_manager_summary: "",
    semanticFit: 0,
    rawOutputs: [],
    backendMetrics: {
      exactMatchCount: 0, normalizedMatchCount: 0, substringMatchCount: 0,
      semanticMatchCount: 0, practicalMatchCount: 0, criticalMatched: 0, criticalMissing: 0, appliedCap: "None"
    }
  };

  if (!raw || typeof raw !== 'object') return defaults;

  // Normalize fit sub-objects: if they're numbers (legacy), wrap them
  const normFit = (val: any, def: any) => {
    if (val === null || val === undefined) return { ...def };
    if (typeof val === 'number') return { ...def, score: val };
    if (typeof val === 'object' && !Array.isArray(val)) return { ...def, ...val };
    return { ...def };
  };

  const result = {
    experienceFit: normFit(raw.experienceFit, defaults.experienceFit),
    skillFit: normFit(raw.skillFit, defaults.skillFit),
    budgetFit: normFit(raw.budgetFit, defaults.budgetFit),
    hiringDecision: raw.hiringDecision || defaults.hiringDecision,
    confidence: typeof raw.confidence === 'number' ? raw.confidence : defaults.confidence,
    bulleted_summary: Array.isArray(raw.bulleted_summary) ? raw.bulleted_summary : defaults.bulleted_summary,
    top_strengths: Array.isArray(raw.top_strengths) ? raw.top_strengths : defaults.top_strengths,
    top_risks: Array.isArray(raw.top_risks) ? raw.top_risks : defaults.top_risks,
    hiring_manager_summary: raw.hiring_manager_summary || defaults.hiring_manager_summary,
    semanticFit: typeof raw.semanticFit === 'number' ? raw.semanticFit : defaults.semanticFit,
    rawOutputs: Array.isArray(raw.rawOutputs) ? raw.rawOutputs : defaults.rawOutputs,
    backendMetrics: raw.backendMetrics && typeof raw.backendMetrics === 'object'
      ? { ...defaults.backendMetrics, ...raw.backendMetrics }
      : defaults.backendMetrics
  };

  // Ensure skillFit arrays are always arrays
  const arrKeys = ['exact_matches', 'semantic_matches', 'transferable_matches', 'practical_matches', 'missing_skills', 'missing_preferred', 'matched_responsibilities'] as const;
  for (const key of arrKeys) {
    if (!Array.isArray(result.skillFit[key])) {
      result.skillFit[key] = (defaults.skillFit as any)[key];
    }
  }

  return result;
}

export function CandidateDecisionCard({
  cand, index, job, selectedCandidateIds, setSelectedCandidateIds,
  updateMatchStatus, setOutsourceModalCand, setViewingResume,
  evaluatingId, updatingId, reevaluateCandidate
}: CandidateDecisionCardProps) {

  const rawBreakdown = typeof cand.matchBreakdown === 'string'
    ? (() => { try { return JSON.parse(cand.matchBreakdown); } catch { return null; } })()
    : cand.matchBreakdown;

  const breakdown = safeBreakdown(rawBreakdown);

  // Determine evaluation state
  const evalStatus = cand.evaluationStatus || (cand.llmScore !== null ? 'COMPLETED' : 'PENDING');
  const isPending = evalStatus === 'PENDING';
  const isFailed = evalStatus === 'FAILED';
  const isCompleted = evalStatus === 'COMPLETED';

  const backendMetrics = breakdown.backendMetrics;
  const skillFit = breakdown.skillFit;
  const experienceFit = breakdown.experienceFit;
  const budgetFit = breakdown.budgetFit;

  // Score Composition Calculations (out of 100)
  const skillsScore = skillFit.score || 0;
  const experienceScore = experienceFit.score || 0;
  const budgetScore = budgetFit.score || 0;
  const finalScore = cand.llmScore || cand.semanticScore || 0;

  // Hiring Recommendation Styles
  const rec = breakdown.hiringDecision || 'Borderline';
  const recConfigMap: any = {
    'Strong Hire': { bg: 'bg-[#10B981]', text: 'text-white', label: 'Strong Hire', icon: <TrendingUp className="size-4" /> },
    'Hire': { bg: 'bg-[#059669]', text: 'text-white', label: 'Hire', icon: <CheckCircle className="size-4" /> },
    'Borderline': { bg: 'bg-[#F59E0B]', text: 'text-white', label: 'Borderline', icon: <AlertCircle className="size-4" /> },
    'Reject': { bg: 'bg-[#EF4444]', text: 'text-white', label: 'Reject', icon: <XCircle className="size-4" /> },
    'Consider if Talent Pool is Limited': { bg: 'bg-[#F59E0B]', text: 'text-white', label: 'Consider', icon: <AlertCircle className="size-4" /> },
  };
  const recConfig = recConfigMap[rec] || { bg: 'bg-slate-200', text: 'text-slate-800', label: rec, icon: <AlertCircle className="size-4" /> };

  // AI Confidence
  const conf = breakdown.confidence || 0;
  const confLvl = conf >= 85 ? 'High' : conf >= 70 ? 'Medium' : 'Low';
  
  // Readiness Estimation
  const missingCriticalCount = backendMetrics.criticalMissing || 0;
  const readiness = missingCriticalCount === 0 
    ? 'Immediate' 
    : missingCriticalCount === 1 ? 'Ready in 2 Weeks' 
    : missingCriticalCount === 2 ? 'Ready in 1 Month' 
    : 'Needs Significant Upskilling';

  // Risk Estimation
  const budgetDiff = parseInt(budgetFit.difference || "0");
  const budgetRisk = budgetDiff > 20 ? 'High' : budgetDiff > 0 ? 'Medium' : 'Low';
  const techRisk = missingCriticalCount > 1 ? 'High' : missingCriticalCount === 1 ? 'Medium' : 'Low';
  const expDiff = typeof experienceFit.difference === 'number' ? experienceFit.difference : parseFloat(experienceFit.difference || "0");
  const expRisk = expDiff < -2 ? 'High' : expDiff < 0 ? 'Medium' : 'Low';
  
  const overallRisk = (missingCriticalCount > 1 || budgetRisk === 'High' || expRisk === 'High') ? 'High' 
    : (missingCriticalCount === 1 || budgetRisk === 'Medium' || expRisk === 'Medium') ? 'Medium' : 'Low';

  const riskColor: Record<string, string> = {
    'High': 'text-red-600 font-bold',
    'Medium': 'text-amber-600 font-semibold',
    'Low': 'text-green-600 font-medium'
  };

  // Safe Arrays
  const exactMatches = skillFit.exact_matches || [];
  const semanticMatches = skillFit.semantic_matches || [];
  const practicalMatches = skillFit.practical_matches || [];
  const missingRequired = skillFit.missing_skills || [];
  const missingPreferred = skillFit.missing_preferred || [];
  const matchedResponsibilities = skillFit.matched_responsibilities || [];

  // Categorize empty states
  const hasTransferable = semanticMatches.length > 0;
  const hasPractical = practicalMatches.length > 0 || matchedResponsibilities.length > 0;

  // Filter generic skills for display
  const genericSkills = ['excel', 'communication', 'teamwork', 'leadership', 'powerpoint', 'word', 'autocad', 'problem solving'];
  const highValueExactMatches = exactMatches.filter((s: string) => !genericSkills.includes(s.toLowerCase())).slice(0, 8);

  const getProgressColor = (score: number, max: number) => {
    const p = score/max;
    if (p >= 0.8) return 'bg-emerald-500';
    if (p >= 0.5) return 'bg-amber-400';
    return 'bg-red-500';
  };

  const criticalMatchedSafe = backendMetrics.criticalMatched || 0;
  const criticalMissingSafe = backendMetrics.criticalMissing || 0;
  const criticalTotalSafe = criticalMatchedSafe + criticalMissingSafe;

  // Normalize experience string
  const expRaw = cand.totalExperienceYears || "N/A";
  const expFormatted = typeof expRaw === 'string' && expRaw.toLowerCase().includes('year') ? expRaw : `${expRaw} Yrs Exp`;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-6 hover:shadow-md transition-shadow">
      
      {/* HEADER: Recruiter Decision Dashboard */}
      <div className="bg-slate-50 p-4 border-b border-slate-200 flex flex-col md:flex-row justify-between gap-4 relative overflow-hidden">
        
        {/* Left: Candidate Info & Rank */}
        <div className="flex items-center gap-4 relative z-10">
          <div className="flex flex-col items-center justify-center shrink-0">
            <span className="text-[10px] font-extrabold uppercase text-slate-500 tracking-wider">Rank</span>
            <span className="text-2xl font-black text-slate-800">#{index + 1}</span>
          </div>
          
          <div className="size-12 rounded-full bg-gradient-to-br from-[#F55036] to-[#c9381f] text-white flex items-center justify-center font-bold text-lg shrink-0 shadow-sm">
            {cand.candidateName?.split(' ').map((n: string) => n[0]).slice(0,2).join('').toUpperCase()}
          </div>
          
          <div>
            <h3 className="text-lg font-bold text-slate-900">{cand.candidateName}</h3>
            <div className="text-xs font-medium text-slate-500 mt-0.5 flex gap-3">
              <span>{expFormatted}</span>
              <span>₹{budgetFit.candidate_budget?.toLocaleString('en-IN') || (cand.expectedSalary ? parseInt(cand.expectedSalary).toLocaleString('en-IN') : 'N/A')}</span>
            </div>
          </div>
        </div>

        {/* Right: Key ATS Metrics */}
        <div className="flex flex-wrap items-center gap-3 md:gap-6 relative z-10">
          
          {isCompleted ? (
            <>
              <div className="flex flex-col items-end">
                <span className="text-[10px] font-extrabold uppercase text-slate-500 tracking-wider">Overall Match</span>
                <div className="text-3xl font-black text-slate-800 tracking-tighter flex items-end">
                  {finalScore}<span className="text-lg text-slate-400 mb-1">%</span>
                </div>
              </div>

              <div className="h-10 w-px bg-slate-200 hidden md:block"></div>

              <div className="flex flex-col gap-1.5">
                <div className={`flex items-center justify-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${recConfig.bg} ${recConfig.text}`}>
                  {recConfig.icon}
                  <span>{recConfig.label}</span>
                </div>
                
                <div className="flex gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider justify-end">
                  <span className="flex items-center gap-1">
                    <Zap className="size-3 text-amber-500" />
                    Conf: {confLvl}
                  </span>
                  <span className="flex items-center gap-1">
                    <AlertCircle className={`size-3 ${overallRisk === 'High' ? 'text-red-500' : overallRisk === 'Medium' ? 'text-amber-500' : 'text-green-500'}`} />
                    Risk: {overallRisk}
                  </span>
                </div>
              </div>
            </>
          ) : isPending ? (
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-50 border border-blue-200">
              <Clock className="size-4 text-blue-500" />
              <div>
                <div className="text-xs font-bold text-blue-700">Evaluation Pending</div>
                <div className="text-[10px] text-blue-500">Click Re-evaluate to generate insights</div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-50 border border-amber-200">
              <AlertTriangle className="size-4 text-amber-500" />
              <div>
                <div className="text-xs font-bold text-amber-700">Evaluation Failed</div>
                <div className="text-[10px] text-amber-500">Click Re-evaluate to retry</div>
                {cand.lastError && <div className="text-[9px] text-amber-400 mt-0.5 truncate max-w-[200px]" title={cand.lastError}>{cand.lastError}</div>}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* ACTION BAR */}
      <div className="bg-white px-4 py-2 border-b border-slate-100 flex flex-wrap items-center justify-between text-xs gap-3">
        <div className="flex items-center gap-3">
           <input
              type="checkbox"
              className="rounded border-slate-300 text-primary focus:ring-primary size-4 cursor-pointer"
              checked={selectedCandidateIds.includes(cand.candidateId)}
              onChange={(e) => {
                if (e.target.checked) setSelectedCandidateIds((prev: number[]) => [...prev, cand.candidateId]);
                else setSelectedCandidateIds((prev: number[]) => prev.filter((id: number) => id !== cand.candidateId));
              }}
            />
            <span className="font-semibold text-slate-600">Select for Bulk Actions</span>
        </div>
        <div className="flex flex-wrap gap-2">
            <button
              onClick={() => reevaluateCandidate(cand.candidateId)}
              disabled={evaluatingId === cand.candidateId}
              className="px-3 py-1.5 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold transition flex items-center gap-1.5 disabled:opacity-50"
            >
              {evaluatingId === cand.candidateId ? (
                <><Loader2 className="size-3.5 animate-spin" /> Evaluating...</>
              ) : (
                <><RefreshCw className="size-3.5" /> Re-evaluate (AI)</>
              )}
            </button>
            <button
              onClick={() => setViewingResume({
                candidateName: cand.candidateName,
                fileName: cand.fileName,
                filePath: cand.filePath,
                extractedText: cand.extractedText || "",
                matchBreakdown: breakdown
              })}
              className="px-3 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold transition flex items-center gap-1.5"
            >
              <FileText className="size-3.5" /> View Resume
            </button>
            <button
              onClick={() => setOutsourceModalCand({ ...cand, isBatch: false, selectedIds: [] })}
              className="px-3 py-1.5 rounded bg-primary/10 hover:bg-primary/20 text-primary font-semibold transition flex items-center gap-1.5"
            >
              <Send className="size-3.5" /> Outsource to Client
            </button>
        </div>
      </div>

      {/* BODY: Show full dashboard for COMPLETED, placeholder for PENDING/FAILED */}
      {!isCompleted ? (
        <div className="p-8 text-center">
          {isPending ? (
            <div className="flex flex-col items-center gap-3">
              <div className="size-16 rounded-full bg-blue-50 flex items-center justify-center">
                <Clock className="size-8 text-blue-400" />
              </div>
              <h4 className="text-sm font-bold text-slate-700">Detailed Evaluation Not Available</h4>
              <p className="text-xs text-slate-500 max-w-md">
                This candidate has not been evaluated by the AI engine yet. Click <strong>Re-evaluate (AI)</strong> above to generate a full hiring scorecard with skill analysis, experience fit, budget fit, strengths, and risks.
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="size-16 rounded-full bg-amber-50 flex items-center justify-center">
                <AlertTriangle className="size-8 text-amber-400" />
              </div>
              <h4 className="text-sm font-bold text-slate-700">Evaluation Failed</h4>
              <p className="text-xs text-slate-500 max-w-md">
                The AI evaluation encountered an error. Click <strong>Re-evaluate (AI)</strong> above to retry. 
                {cand.retryCount > 0 && <span className="block mt-1 text-amber-500">Attempts: {cand.retryCount}</span>}
              </p>
              {cand.lastError && (
                <p className="text-[10px] text-slate-400 bg-slate-50 px-3 py-1.5 rounded border border-slate-100 max-w-md truncate" title={cand.lastError}>
                  Error: {cand.lastError}
                </p>
              )}
            </div>
          )}
        </div>
      ) : (
        /* FULL DASHBOARD for COMPLETED evaluations */
        <div className="p-4 grid grid-cols-1 xl:grid-cols-3 gap-6">
          
          {/* LEFT COLUMN: Summary, Insights, Breakdown */}
          <div className="xl:col-span-2 flex flex-col gap-5">
            
            {/* AI Hiring Manager Summary */}
            <div className="bg-slate-50 border-l-4 border-primary p-4 rounded-r-lg">
              <h4 className="text-[11px] font-extrabold uppercase text-primary tracking-wider mb-2 flex items-center gap-1.5">
                <User className="size-3.5" /> AI Hiring Manager Summary
              </h4>
              <p className="text-sm text-slate-700 leading-relaxed italic font-medium">
                "{breakdown.hiring_manager_summary || "Candidate matches baseline criteria. Detailed reasoning is unavailable for this candidate. Click Re-evaluate to generate a full hiring summary."}"
              </p>
            </div>

            {/* Match Breakdown Progress Bars */}
            <div>
              <h4 className="text-xs font-bold text-slate-800 mb-3 uppercase tracking-wider">Score Explainability</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                
                {/* Skills */}
                <div className="bg-white border border-slate-200 p-3 rounded-lg">
                  <div className="flex justify-between items-end mb-1.5">
                    <span className="text-xs font-bold text-slate-600">Skills</span>
                    <span className="text-xs font-bold text-slate-900">{skillsScore}<span className="text-[10px] text-slate-400 font-normal">/60</span></span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full ${getProgressColor(skillsScore, 60)}`} style={{ width: `${(skillsScore/60)*100}%` }}></div>
                  </div>
                  <div className="mt-2 flex justify-between text-[9px] font-bold text-slate-400 uppercase">
                    <span>Crit: {criticalMatchedSafe}/{criticalTotalSafe}</span>
                    <span>Imp: {backendMetrics.importantMatched || 0}</span>
                  </div>
                </div>

                {/* Experience */}
                <div className="bg-white border border-slate-200 p-3 rounded-lg">
                  <div className="flex justify-between items-end mb-1.5">
                    <span className="text-xs font-bold text-slate-600">Experience</span>
                    <span className="text-xs font-bold text-slate-900">{experienceScore}<span className="text-[10px] text-slate-400 font-normal">/20</span></span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full ${getProgressColor(experienceScore, 20)}`} style={{ width: `${(experienceScore/20)*100}%` }}></div>
                  </div>
                  <div className="mt-2 text-[9px] font-bold text-slate-400 uppercase text-center">
                    Gap: {expDiff} Yrs
                  </div>
                </div>

                {/* Budget */}
                <div className="bg-white border border-slate-200 p-3 rounded-lg">
                  <div className="flex justify-between items-end mb-1.5">
                    <span className="text-xs font-bold text-slate-600">Budget</span>
                    <span className="text-xs font-bold text-slate-900">{budgetScore}<span className="text-[10px] text-slate-400 font-normal">/20</span></span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full ${getProgressColor(budgetScore, 20)}`} style={{ width: `${(budgetScore/20)*100}%` }}></div>
                  </div>
                  <div className="mt-2 text-[9px] font-bold text-slate-400 uppercase text-center">
                    Risk: {budgetFit.difference || "0%"}
                  </div>
                </div>

              </div>
            </div>

            {/* Deep Match Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Strong Matches */}
              <div className="bg-white border border-slate-200 p-4 rounded-lg">
                <h4 className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-2.5 flex items-center gap-1">
                  <CheckCircle className="size-3" /> High-Value Matches ({highValueExactMatches.length})
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {highValueExactMatches.map((s: string, i: number) => (
                    <span key={i} className="px-2 py-1 rounded border border-emerald-200 bg-emerald-50 text-[11px] font-semibold text-emerald-700">
                      {s}
                    </span>
                  ))}
                  {highValueExactMatches.length === 0 && (
                    <span className="text-xs text-slate-400 italic">No critical exact matches found. Click Re-evaluate to analyze.</span>
                  )}
                </div>
              </div>

              {/* Practical Matches */}
              {hasPractical && (
                <div className="bg-white border border-slate-200 p-4 rounded-lg">
                  <h4 className="text-[10px] font-bold text-purple-600 uppercase tracking-wider mb-2.5 flex items-center gap-1">
                    <Briefcase className="size-3" /> Practical Experience ({matchedResponsibilities.length + practicalMatches.length})
                  </h4>
                  <div className="flex flex-col gap-1.5">
                    {matchedResponsibilities.map((r: string, i: number) => (
                      <div key={`mr-${i}`} className="px-2 py-1.5 rounded bg-purple-50 border border-purple-100 text-[11px] font-semibold text-purple-800 flex items-center gap-1.5">
                        <CheckCircle className="size-3 text-purple-400 shrink-0" /> {r}
                      </div>
                    ))}
                    {practicalMatches.map((pm: any, i: number) => {
                      const respName = typeof pm === 'string' ? pm : pm.responsibility;
                      if (!respName) return null;
                      return (
                        <div key={`pm-${i}`} className="px-2 py-1.5 rounded bg-purple-50 border border-purple-100 text-[11px] font-semibold text-purple-800 flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5">
                            <CheckCircle className="size-3 text-purple-400 shrink-0" /> {respName}
                          </div>
                          {pm.match_type === "Practical" && pm.reason && (
                            <div className="pl-4.5 text-[9px] text-purple-500 font-normal italic">
                              Found in: {pm.matched_with} • {pm.reason}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Transferable Skills */}
              {hasTransferable && (
                <div className="bg-white border border-slate-200 p-4 rounded-lg col-span-1 md:col-span-2">
                  <h4 className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-2.5 flex items-center gap-1">
                    <Search className="size-3" /> Transferable Skills Mapped ({semanticMatches.length})
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {semanticMatches.map((sm: any, i: number) => {
                      const skillName = typeof sm === 'string' ? sm : (sm.skill || sm.candidate_skill || 'Unknown Skill');
                      const matchedWith = sm.matched_with || sm.matched_requirement || 'Related Skill';
                      const confVal = sm.confidence || 0;
                      
                      return (
                        <div key={i} className="flex flex-col bg-amber-50 rounded border border-amber-200 p-2">
                          <div className="flex items-center justify-between mb-1 gap-2">
                            <span className="text-[10px] font-bold text-amber-900 line-clamp-1" title={skillName}>{skillName}</span>
                            {confVal > 0 && <span className="text-[8px] font-extrabold text-amber-500 bg-amber-100 px-1 rounded">{confVal}%</span>}
                          </div>
                          <div className="flex items-center gap-1.5 text-amber-500 mb-1">
                            <ArrowRight className="size-3 shrink-0" />
                            <span className="text-[10px] font-bold text-amber-700 line-clamp-1" title={matchedWith}>{matchedWith}</span>
                          </div>
                          {sm.reason && <p className="text-[9px] text-amber-600 italic leading-tight line-clamp-2">{sm.reason}</p>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

            </div>

          </div>

          {/* RIGHT COLUMN: Insights Panel & Risks */}
          <div className="flex flex-col gap-4">
            
            {/* Recruiter Insights Panel */}
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden flex flex-col">
              <div className="bg-slate-800 text-white p-3 border-b border-slate-700 flex items-center justify-between">
                <h4 className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                  <Award className="size-3.5 text-blue-400" /> Recruiter Insights
                </h4>
              </div>
              
              <div className="p-4 flex flex-col gap-4">
                
                {/* Readiness & Ranking */}
                <div className="grid grid-cols-2 gap-3 pb-3 border-b border-slate-100">
                  <div>
                    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Candidate Readiness</div>
                    <div className="text-xs font-semibold text-slate-700">{readiness}</div>
                  </div>
                  <div>
                    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Comparative Rank</div>
                    <div className="text-xs font-semibold text-slate-700">
                      {index === 0 ? "Highest Match" : "Alternative Option"}
                    </div>
                  </div>
                </div>

                {/* Strengths */}
                <div>
                  <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Top Reasons to Hire</div>
                  {breakdown.top_strengths && breakdown.top_strengths.length > 0 ? (
                    <ul className="space-y-1">
                      {breakdown.top_strengths.map((s: string, i: number) => (
                        <li key={i} className="text-[11px] font-medium text-emerald-700 flex items-start gap-1.5 leading-snug">
                          <span className="text-emerald-500 font-bold shrink-0">+</span> {s}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-xs text-slate-400 italic">No specific strengths listed. Click Re-evaluate.</div>
                  )}
                </div>

                {/* Risks & Concerns */}
                <div>
                  <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Top Concerns & Risks</div>
                  <ul className="space-y-1">
                    {(breakdown.top_risks || []).map((r: string, i: number) => (
                      <li key={i} className="text-[11px] font-medium text-red-600 flex items-start gap-1.5 leading-snug">
                        <span className="text-red-400 font-bold shrink-0">-</span> {r}
                      </li>
                    ))}
                    {missingRequired.length > 0 && (
                       <li className="text-[11px] font-medium text-red-600 flex items-start gap-1.5 leading-snug">
                       <span className="text-red-400 font-bold shrink-0">-</span> Missing {missingRequired.length} Critical Skills ({missingRequired.slice(0,2).join(', ')})
                     </li>
                    )}
                    {!(breakdown.top_risks && breakdown.top_risks.length > 0) && missingRequired.length === 0 && (
                      <li className="text-xs text-slate-400 italic">No specific concerns identified.</li>
                    )}
                  </ul>
                </div>

                {/* Trainability / Upskilling */}
                {(missingRequired.length > 0 || missingPreferred.length > 0) && (
                  <div className="bg-slate-50 p-2.5 rounded border border-slate-100 mt-2">
                    <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Potential Upskilling Areas</div>
                    <div className="flex flex-wrap gap-1">
                      {missingRequired.slice(0,3).map((m: string, i: number) => (
                        <span key={`mr-${i}`} className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded text-[9px] font-bold">Crit: {m}</span>
                      ))}
                      {missingPreferred.slice(0,3).map((m: string, i: number) => (
                        <span key={`mp-${i}`} className="px-1.5 py-0.5 bg-slate-200 text-slate-600 rounded text-[9px] font-bold">Pref: {m}</span>
                      ))}
                    </div>
                  </div>
                )}

              </div>
            </div>
            
            {/* Hiring Risk Analysis Panel */}
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden flex flex-col">
              <div className="bg-slate-50 p-3 border-b border-slate-200">
                <h4 className="text-[10px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                  <AlertCircle className="size-3" /> Hiring Risk Analysis
                </h4>
              </div>
              <div className="p-3 grid grid-cols-2 gap-y-3 gap-x-2 bg-white">
                 <div>
                    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Technical Risk</div>
                    <div className={`text-[11px] ${riskColor[techRisk] || 'text-slate-600'}`}>{techRisk}</div>
                  </div>
                  <div>
                    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Experience Risk</div>
                    <div className={`text-[11px] ${riskColor[expRisk] || 'text-slate-600'}`}>{expRisk}</div>
                  </div>
                  <div>
                    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Budget Risk</div>
                    <div className={`text-[11px] ${riskColor[budgetRisk] || 'text-slate-600'}`}>{budgetRisk}</div>
                  </div>
                  <div>
                    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Overall Risk</div>
                    <div className={`text-[11px] ${riskColor[overallRisk] || 'text-slate-600'}`}>{overallRisk}</div>
                  </div>
              </div>
            </div>

          </div>

        </div>
      )}
    </div>
  );
}
