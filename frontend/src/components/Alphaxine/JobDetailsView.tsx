import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { 
  ArrowLeft, Briefcase, Users, IndianRupee, Calendar, AlertCircle, FileText, CheckCircle, 
  XCircle, Send, Plus, Sparkles, Loader2, Award, ClipboardCheck, Trash2, Mail, ExternalLink, X
} from "lucide-react";

export function JobDetailsView() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<any | null>(null);
  const [vendors, setVendors] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  
  // Tab control
  const [activeTab, setActiveTab] = useState<"matches" | "outreach" | "upload">("matches");
  
  // State for Evaluation & Statuses
  const [evaluatingId, setEvaluatingId] = useState<number | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  
  // State for Outreach
  const [selectedVendors, setSelectedVendors] = useState<number[]>([]);
  const [isSendingOutreach, setIsSendingOutreach] = useState(false);
  const [outreachResult, setOutreachResult] = useState<string | null>(null);

  // State for Manual Resume Upload
  const [manualFile, setManualFile] = useState<File | null>(null);
  const [isUploadingManual, setIsUploadingManual] = useState(false);

  // State for Inline Resume Viewer
  const [viewingResume, setViewingResume] = useState<{
    candidateName: string;
    fileName: string;
    filePath: string;
    extractedText: string;
  } | null>(null);
  const [resumeTab, setResumeTab] = useState<"preview" | "text">("preview");

  // State for Client Outsource Proposal Email
  const [outsourceModalCand, setOutsourceModalCand] = useState<any>(null);
  const [clientEmail, setClientEmail] = useState("client@company.com");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [isEmailBodyEdited, setIsEmailBodyEdited] = useState(false);
  const [attachResume, setAttachResume] = useState(true);
  const [isSendingOutsource, setIsSendingOutsource] = useState(false);

  // Background Upload States
  const [uploadStage, setUploadStage] = useState<"IDLE" | "UPLOADING" | "PARSING" | "SUCCESS" | "ERROR">("IDLE");
  const [uploadAbortController, setUploadAbortController] = useState<AbortController | null>(null);

  // State for Batch Candidate Selection
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<number[]>([]);

  const generateEmailBody = (selectedCands: any[], attach: boolean) => {
    if (!selectedCands || selectedCands.length === 0) return "";
    
    const isSingle = selectedCands.length === 1;
    let bodyStr = "";

    if (isSingle) {
      const single = selectedCands[0];
      const expStr = single.totalExperienceYears || single.total_experience_years || "Not specified";
      const expDisplay = expStr === "Not specified" ? expStr : `${expStr} years`;
      
      bodyStr += `Dear Client,\n\nWe are pleased to submit the following candidate for the position of "${data?.job?.title || 'Job'}".\n\n`;
      bodyStr += `- Candidate Name: ${single.candidateName}\n`;
      bodyStr += `- Experience: ${expDisplay}\n\n`;
      
      if (attach) {
        bodyStr += `Please find the attached resume PDF for your review.\n\n`;
      }
    } else {
      bodyStr += `Dear Client,\n\nWe are pleased to submit the following candidate proposals for your "${data?.job?.title || 'Job'}" position:\n\n`;
      
      selectedCands.forEach((c: any, idx: number) => {
        const expStr = c.totalExperienceYears || c.total_experience_years || "Not specified";
        const expDisplay = expStr === "Not specified" ? expStr : `${expStr} years`;
        
        bodyStr += `${idx + 1}. Candidate Name: ${c.candidateName}\n`;
        bodyStr += `   - Experience: ${expDisplay}\n\n`;
      });
      
      if (attach) {
        bodyStr += `Please find the attached resume PDFs for your review.\n\n`;
      }
    }

    bodyStr += `Please let us know if you would like to proceed with scheduling an interview.\n\nBest regards,\nAlphaxine Recruiting Operations`;
    
    return bodyStr;
  };

  useEffect(() => {
    if (outsourceModalCand && !isEmailBodyEdited) {
      const isSingle = !outsourceModalCand.isBatch;
      const selectedCands = isSingle 
        ? [outsourceModalCand] 
        : matches.filter((c: any) => outsourceModalCand.selectedIds.includes(c.candidateId));
      
      setEmailBody(generateEmailBody(selectedCands, attachResume));
    }
  }, [attachResume, outsourceModalCand, isEmailBodyEdited, data?.job?.title]);

  const openOutsourceModal = (cand: any) => {
    // If it's a single candidate
    const isSingle = !!cand;
    const selectedCands = isSingle 
      ? [cand] 
      : matches.filter((c: any) => selectedCandidateIds.includes(c.candidateId));

    if (selectedCands.length === 0) return;

    const batchCand = isSingle ? cand : {
      isBatch: true,
      selectedIds: selectedCands.map((c: any) => c.candidateId),
      name: selectedCands.map((c: any) => c.candidateName).join(", ")
    };

    setOutsourceModalCand(batchCand);
    setClientEmail("client@company.com");
    setIsEmailBodyEdited(false); // Reset edited flag
    
    if (selectedCands.length === 1) {
      const single = selectedCands[0];
      setEmailSubject(`Candidate Proposal: ${single.candidateName} for ${data?.job?.title || 'Job'}`);
    } else {
      setEmailSubject(`Candidate Proposals: ${selectedCands.length} Matches for ${data?.job?.title || 'Job'}`);
    }
  };

  const handleSendOutsourceProposal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!outsourceModalCand) return;
    setIsSendingOutsource(true);

    try {
      const token = localStorage.getItem("token");

      // Dispatch batch outsource API call
      const res = await fetch(`/api/matches/${id}/outsource`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          candidateIds: outsourceModalCand.isBatch ? outsourceModalCand.selectedIds : [outsourceModalCand.candidateId],
          clientEmail,
          subject: emailSubject,
          body: emailBody,
          attachResume
        })
      });

      if (!res.ok) throw new Error("Failed to outsource candidate proposal(s)");
      const resData = await res.json();

      alert(`Successfully outsourced candidate(s) and sent proposal!\n\nSaved mock email to: ${resData.filePath}`);
      
      setOutsourceModalCand(null);
      setSelectedCandidateIds([]);
      await fetchJobDetails();
    } catch (err: any) {
      console.error(err);
      alert(err.message || "An error occurred while outsourcing candidate(s).");
    } finally {
      setIsSendingOutsource(false);
    }
  };

  const fetchJobDetails = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`/api/jobs/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) throw new Error("Failed to fetch job details");
      const details = await response.json();
      setData(details);
    } catch (err) {
      console.error(err);
      setError("Failed to load job details.");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchVendors = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`/api/jobs/${id}/vendors`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        const vendorList = await response.json();
        setVendors(vendorList);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchJobDetails();
    fetchVendors();
  }, [id]);

  const handleRunEvaluation = async (candidateId: number, semanticScore: number, breakdown: any) => {
    setEvaluatingId(candidateId);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`/api/matches/${id}/${candidateId}/evaluate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ semanticScore, breakdown })
      });
      if (!response.ok) throw new Error("Failed to score candidate");
      await fetchJobDetails();
    } catch (err) {
      console.error(err);
      alert("Failed to complete AI scoring evaluation.");
    } finally {
      setEvaluatingId(null);
    }
  };

  const handleUpdateStatus = async (candidateId: number, newStatus: string) => {
    setUpdatingId(candidateId);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`/api/matches/${id}/${candidateId}/status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status: newStatus })
      });
      if (!response.ok) throw new Error("Failed to update status");
      await fetchJobDetails();
    } catch (err) {
      console.error(err);
      alert("Failed to update candidate selection stage.");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleVendorSelect = (vendorId: number) => {
    setSelectedVendors(prev => 
      prev.includes(vendorId) ? prev.filter(v => v !== vendorId) : [...prev, vendorId]
    );
  };

  const handleSendOutreach = async () => {
    if (selectedVendors.length === 0) return;
    setIsSendingOutreach(true);
    setOutreachResult(null);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch("/api/vendors/outreach", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ jobId: id, vendorIds: selectedVendors })
      });
      if (!response.ok) throw new Error("Outreach request failed");
      const resultData = await response.json();
      
      const fileLogged = resultData.results.map((r: any) => 
        `${r.name}: ${r.outreachEmail.mode === 'LOCAL_MOCK' ? `Mock saved locally (${r.outreachEmail.path})` : 'Dispatched via SMTP'}`
      ).join("\n");

      setOutreachResult(`Successfully triggered outreach!\n\n${fileLogged}`);
      setSelectedVendors([]);
    } catch (err) {
      console.error(err);
      alert("Failed to send outreach to selected vendors.");
    } finally {
      setIsSendingOutreach(false);
    }
  };

  const handleStopUpload = () => {
    if (uploadAbortController) {
      uploadAbortController.abort();
      setUploadStage("IDLE");
      setIsUploadingManual(false);
      setManualFile(null);
      setUploadAbortController(null);
    }
  };

  const handleManualUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualFile) return;

    setIsUploadingManual(true);
    setUploadStage("UPLOADING");

    const controller = new AbortController();
    setUploadAbortController(controller);

    // Transition stages visually: UPLOADING (uploading bytes) -> PARSING (server parsing + AI parsing)
    const stageTimer = setTimeout(() => {
      setUploadStage("PARSING");
    }, 600);

    try {
      const token = localStorage.getItem("token");
      const formData = new FormData();
      formData.append("resume", manualFile);

      const response = await fetch(`/api/jobs/${id}/manual-candidate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
        signal: controller.signal
      });

      if (!response.ok) throw new Error("Manual upload failed");
      
      setManualFile(null);
      await fetchJobDetails();
      
      // Auto redirect to matches tab if they are currently on the upload tab
      if (activeTab === "upload") {
        setActiveTab("matches");
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log("Upload request aborted successfully.");
        alert("Resume upload cancelled.");
      } else {
        console.error(err);
        alert("Failed to upload and parse candidate resume.");
      }
    } finally {
      clearTimeout(stageTimer);
      setUploadStage("IDLE");
      setIsUploadingManual(false);
      setUploadAbortController(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12 text-slate-500 gap-2">
        <Loader2 className="size-6 animate-spin text-blue-600" />
        <span>Loading Job Details...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-red-50 text-red-600 p-4 rounded-lg flex items-center gap-3 border border-red-100 max-w-xl mx-auto">
        <AlertCircle className="size-5 shrink-0" />
        <p className="text-sm">{error || "Job details not found"}</p>
      </div>
    );
  }

  const { job, matches } = data;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Back Button */}
      <Link to="/alphaxine/jobs" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800 transition">
        <ArrowLeft className="size-4" />
        Back to Jobs Directory
      </Link>

      {/* JD Main Details Card */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between gap-6">
        <div className="space-y-4 flex-1">
          <div className="flex items-center gap-3">
            <span className={`text-[10px] font-bold tracking-wider uppercase px-2.5 py-0.5 rounded-full ${
              job.status === "OPEN" ? "bg-green-50 text-green-700 border border-green-200" :
              job.status === "PAUSED" ? "bg-amber-50 text-amber-700 border border-amber-200" :
              "bg-slate-100 text-slate-700 border border-slate-200"
            }`}>
              {job.status}
            </span>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{job.title}</h1>
              {job.client_name && (
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mt-0.5">
                  Client: <span className="text-[#F55036] font-bold">{job.client_name}</span>
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <IndianRupee className="size-4 text-slate-400" />
              <span>Budget: <strong>{job.budget ? `₹${parseInt(job.budget).toLocaleString("en-IN")}` : "N/A"}</strong></span>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Users className="size-4 text-slate-400" />
              <span>Positions: <strong>{job.positions_filled}/{job.positions_needed}</strong></span>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Award className="size-4 text-slate-400" />
              <span>Min Experience: <strong>{job.experience_years ? `${job.experience_years} years` : "Open"}</strong></span>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Calendar className="size-4 text-slate-400" />
              <span>Created: <strong>{new Date(job.created_at).toLocaleDateString()}</strong></span>
            </div>
          </div>

          {/* Skills Matrix and Raw JD Writeup */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-100">
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Required Skills Matrix</h4>
              <div className="flex flex-wrap gap-1.5">
                {job.skills_required && job.skills_required.length > 0 ? (
                  job.skills_required.map((skill: string, index: number) => (
                    <span key={index} className="px-2.5 py-1 bg-slate-100 text-slate-700 text-xs font-semibold rounded-md border border-slate-200">
                      {skill}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-slate-400 italic">None specified</span>
                )}
                {job.skills_preferred && job.skills_preferred.map((skill: string, index: number) => (
                  <span key={index} className="px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-semibold rounded-md border border-blue-100">
                    {skill} (Preferred)
                  </span>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Raw Job Description</h4>
              <div className="max-h-36 overflow-y-auto text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100 whitespace-pre-wrap leading-relaxed">
                {job.raw_text || "No job description text available."}
              </div>
            </div>
          </div>
        </div>

        <div className="md:w-64 border-t md:border-t-0 md:border-l border-slate-100 pt-4 md:pt-0 md:pl-6 flex flex-col justify-center">
          <div className="bg-slate-50 p-4 rounded-lg space-y-1.5">
            <h5 className="text-xs font-bold text-slate-500 uppercase">Need more candidates?</h5>
            <p className="text-xs text-slate-400">Trigger vendor email outreach. Resumes will be automatically parsed, linked, and scored.</p>
            <button
              onClick={() => setActiveTab("outreach")}
              className="w-full mt-2 py-1.5 px-3 bg-primary text-white rounded text-xs font-semibold hover:bg-primary/95 transition"
            >
              Trigger Outreach
            </button>
          </div>
        </div>
      </div>

      {/* Tabs Menu */}
      <div className="flex gap-1 border-b border-slate-200/80 bg-white rounded-t-xl px-2">
        <button
          onClick={() => setActiveTab("matches")}
          className={`relative px-5 py-3 text-sm font-bold transition-all duration-200 ${
            activeTab === "matches"
              ? "text-[#F55036] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-gradient-to-r after:from-[#F55036] after:to-[#c9381f] after:rounded-t"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          Matching Candidates
          <span className={`ml-2 text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
            activeTab === "matches" ? "bg-[#F55036]/10 text-[#F55036]" : "bg-slate-100 text-slate-500"
          }`}>{matches.length}</span>
        </button>
        <button
          onClick={() => setActiveTab("outreach")}
          className={`relative px-5 py-3 text-sm font-bold transition-all duration-200 ${
            activeTab === "outreach"
              ? "text-[#F55036] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-gradient-to-r after:from-[#F55036] after:to-[#c9381f] after:rounded-t"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          Vendor Outreach
        </button>
        <button
          onClick={() => setActiveTab("upload")}
          className={`relative px-5 py-3 text-sm font-bold transition-all duration-200 ${
            activeTab === "upload"
              ? "text-[#F55036] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-gradient-to-r after:from-[#F55036] after:to-[#c9381f] after:rounded-t"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          Resume Ingestion
        </button>
      </div>

      {/* Tab Contents */}
      <div className={activeTab === "matches" ? "" : "hidden"}>
        <div className="space-y-4">
          {matches.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-500">
              <ClipboardCheck className="size-10 text-slate-300 mx-auto mb-2" />
              <h4 className="font-semibold text-slate-700 text-md">No candidates matched yet</h4>
              <p className="text-xs mt-1 max-w-sm mx-auto">Upload resumes manually, or send job requirements to vendors to generate matching scores.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Batch selection and action bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
                <div className="flex items-center gap-4">
                  <input
                    type="checkbox"
                    id="master-candidate-select"
                    className="rounded border-slate-300 text-[#F55036] focus:ring-[#F55036] size-4 cursor-pointer"
                    checked={
                      matches.length > 0 &&
                      matches.filter((c: any) => c.status !== "SENT_TO_CLIENT").length > 0 &&
                      matches
                        .filter((c: any) => c.status !== "SENT_TO_CLIENT")
                        .every((c: any) => selectedCandidateIds.includes(c.candidateId))
                    }
                    onChange={(e) => {
                      if (e.target.checked) {
                        const nonOutsourcedIds = matches
                          .filter((c: any) => c.status !== "SENT_TO_CLIENT")
                          .map((c: any) => c.candidateId);
                        setSelectedCandidateIds(nonOutsourcedIds);
                      } else {
                        setSelectedCandidateIds([]);
                      }
                    }}
                  />
                  <label htmlFor="master-candidate-select" className="text-[11px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer select-none">
                    Select All Profiles
                  </label>
                  {selectedCandidateIds.length > 0 && (
                    <span className="text-xs font-extrabold text-[#F55036] bg-[#F55036]/10 px-3 py-1 rounded-full border border-[#F55036]/20">
                      {selectedCandidateIds.length} Selected
                    </span>
                  )}
                </div>

                {selectedCandidateIds.length > 0 && (
                  <button
                    onClick={() => openOutsourceModal(null)}
                    className="flex items-center justify-center gap-2 py-2 px-5 bg-gradient-to-r from-[#F55036] to-[#c9381f] text-white rounded-xl text-xs font-bold transition-all duration-200 shadow-sm hover:shadow-lg hover:shadow-orange-600/20 active:scale-95"
                  >
                    <Send className="size-3.5" />
                    Outsource {selectedCandidateIds.length} to Client
                  </button>
                )}
              </div>

              {matches.map((cand: any, index: number) => {
                const displayScore = cand.llmScore !== null ? cand.llmScore : cand.semanticScore;
                const isLlmScored = cand.llmScore !== null;
                
                return (
                  <div key={cand.candidateId} className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row justify-between gap-6 hover:border-[#F55036]/30 hover:shadow-md transition-all duration-300 items-start">
                    <div className="flex items-start gap-4 flex-1">
                      {cand.status !== "SENT_TO_CLIENT" ? (
                        <input
                          type="checkbox"
                          aria-label={`Select candidate ${cand.candidateName}`}
                          className="rounded border-slate-300 text-[#F55036] focus:ring-[#F55036] size-4 cursor-pointer mt-2 shrink-0"
                          checked={selectedCandidateIds.includes(cand.candidateId)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedCandidateIds(prev => [...prev, cand.candidateId]);
                            } else {
                              setSelectedCandidateIds(prev => prev.filter(id => id !== cand.candidateId));
                            }
                          }}
                        />
                      ) : (
                        <input
                          type="checkbox"
                          disabled
                          aria-label={`Candidate ${cand.candidateName} is already outsourced`}
                          className="rounded border-slate-200 text-slate-300 size-4 mt-2 shrink-0 cursor-not-allowed opacity-40"
                          checked={false}
                        />
                      )}
                      {/* Candidate Avatar */}
                      <div className="size-10 rounded-full bg-gradient-to-br from-[#F55036] to-[#c9381f] text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-sm">
                        {cand.candidateName?.split(' ').map((n: string) => n[0]).slice(0,2).join('').toUpperCase()}
                      </div>
                      <div className="flex-1 space-y-3">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-[9px] font-extrabold uppercase px-2.5 py-1 rounded-lg bg-slate-800 text-white shadow-sm tracking-wider">
                          #{index + 1}
                        </span>
                        <h3 className="text-base font-bold text-slate-900">{cand.candidateName}</h3>
                        <span className={`text-[9px] font-extrabold uppercase px-2.5 py-1 rounded-lg border ${
                          cand.status === "HIRED" ? "bg-green-50 text-green-700 border-green-200/60" :
                          cand.status === "REJECTED" ? "bg-red-50 text-red-700 border-red-200/60" :
                          cand.status === "SENT_TO_CLIENT" ? "bg-blue-50 text-blue-700 border-blue-200/60" :
                          "bg-slate-50 text-slate-600 border-slate-200/60"
                        }`}>
                          {cand.status}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs text-slate-500">
                        <div>Email: <strong className="text-slate-700">{cand.email}</strong></div>
                        <div>Desired Salary: <strong className="text-slate-700">{cand.expectedSalary ? `₹${parseInt(cand.expectedSalary).toLocaleString("en-IN")}` : "N/A"}</strong></div>
                        <div>
                          Resume:{" "}
                          <button
                            type="button"
                            onClick={() => {
                              setViewingResume({
                                candidateName: cand.candidateName,
                                fileName: cand.fileName,
                                filePath: cand.filePath,
                                extractedText: cand.extractedText || ""
                              });
                              setResumeTab("preview");
                            }}
                            className="text-primary hover:text-primary/80 hover:underline font-semibold inline-flex items-center gap-1 text-left"
                          >
                            {cand.fileName} <FileText className="size-3 text-primary" />
                          </button>
                        </div>
                      </div>

                      <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100">
                        <strong className="text-slate-700 block mb-0.5">Matching Rationale:</strong>
                        {cand.rationale}
                      </div>

                      {/* Candidate Skills Column Segment */}
                      {cand.skills && cand.skills.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-1">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mr-1 align-middle mt-0.5">Skills:</span>
                          {cand.skills.slice(0, 5).map((skill: string, index: number) => {
                            const isReq = data.job.skills_required?.some((s: string) => s.toLowerCase() === skill.toLowerCase());
                            const isPref = data.job.skills_preferred?.some((s: string) => s.toLowerCase() === skill.toLowerCase());
                            return (
                              <span 
                                key={index} 
                                className={`px-2 py-0.5 rounded text-[9px] font-semibold border ${
                                  isReq ? "bg-green-50 text-green-700 border-green-200" :
                                  isPref ? "bg-blue-50 text-blue-700 border-blue-200" :
                                  "bg-slate-50 text-slate-600 border-slate-200"
                                }`}
                              >
                                {skill}
                              </span>
                            );
                          })}
                          {cand.skills.length > 5 && (
                            <span className="text-[10px] text-slate-400 font-semibold self-center ml-1">+{cand.skills.length - 5} more</span>
                          )}
                        </div>
                      )}

                      {/* Score Breakdown (if evaluated) */}
                      {cand.matchBreakdown && (
                        <div className="grid grid-cols-3 gap-2 pt-2 text-[10px] uppercase font-bold text-slate-500">
                          <div className="flex flex-col">
                            <span>Skill Fit: {cand.matchBreakdown.skillFit}%</span>
                            <div className="h-1.5 bg-slate-100 rounded-full mt-1 overflow-hidden">
                              <div className="h-full bg-primary" style={{ width: `${cand.matchBreakdown.skillFit}%` }}></div>
                            </div>
                          </div>
                          <div className="flex flex-col">
                            <span>Experience Fit: {cand.matchBreakdown.experienceFit}%</span>
                            <div className="h-1.5 bg-slate-100 rounded-full mt-1 overflow-hidden">
                              <div className="h-full bg-primary" style={{ width: `${cand.matchBreakdown.experienceFit}%` }}></div>
                            </div>
                          </div>
                          <div className="flex flex-col">
                            <span>Budget Fit: {cand.matchBreakdown.budgetFit}%</span>
                            <div className="h-1.5 bg-slate-100 rounded-full mt-1 overflow-hidden">
                              <div className="h-full bg-primary" style={{ width: `${cand.matchBreakdown.budgetFit}%` }}></div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                    <div className="md:w-60 flex flex-col justify-between items-end border-t md:border-t-0 md:border-l border-slate-100 pt-4 md:pt-0 md:pl-6 space-y-4">
                      {/* Overall Visual Score Circle */}
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Match Score</span>
                          <span className="text-xs text-slate-400">{isLlmScored ? "AI Reasoned" : "Local Keyword"}</span>
                        </div>
                        <div className={`size-12 rounded-full border-2 flex items-center justify-center font-bold text-sm ${
                          displayScore >= 80 ? "border-green-500 text-green-600 bg-green-50" :
                          displayScore >= 60 ? "border-amber-500 text-amber-600 bg-amber-50" :
                          "border-slate-400 text-slate-600 bg-slate-50"
                        }`}>
                          {displayScore}%
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="w-full space-y-2">
                        {!isLlmScored && (
                          <button
                            onClick={() => handleRunEvaluation(cand.candidateId, cand.semanticScore, cand.matchBreakdown)}
                            disabled={evaluatingId === cand.candidateId}
                            className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-[#F55036]/5 hover:bg-[#F55036]/10 text-[#F55036] border border-[#F55036]/20 rounded-xl text-xs font-bold transition-all duration-200"
                          >
                            {evaluatingId === cand.candidateId ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <Sparkles className="size-3.5" />
                            )}
                            Deep AI Evaluation
                          </button>
                        )}

                        <div className="w-full">
                          {cand.status !== "SENT_TO_CLIENT" ? (
                            <button
                              onClick={() => openOutsourceModal(cand)}
                              className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-gradient-to-r from-[#F55036] to-[#c9381f] text-white rounded-xl text-xs font-bold transition-all duration-200 hover:shadow-md hover:shadow-orange-600/20 active:scale-95"
                            >
                              <Send className="size-3.5" />
                              Outsource to Client
                            </button>
                          ) : (
                            <span className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 bg-green-50 text-green-700 rounded-xl text-xs font-bold border border-green-200/60 select-none">
                              <CheckCircle className="size-3.5" />
                              Outsourced
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className={activeTab === "outreach" ? "" : "hidden"}>
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
          <div>
            <h3 className="text-md font-bold text-slate-800 flex items-center gap-1.5">
              <Mail className="size-5 text-primary" />
              Automated Vendor Outreach
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">Select high-performing staffing vendors. The system will email job details and secure links for them to upload matching resumes.</p>
          </div>

          {outreachResult && (
            <div className="bg-slate-900 text-slate-100 p-4 rounded-lg font-mono text-xs whitespace-pre-line border border-slate-800">
              {outreachResult}
            </div>
          )}

          {vendors.length === 0 ? (
            <div className="text-xs text-slate-400 italic">No vendors registered in database. Go to the "Vendors Manager" tab to add recruiters.</div>
          ) : (
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Select Outreach Partners (Ranked by Score)</h4>
              <div className="border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-100">
                {vendors.map((vendor, index: number) => (
                  <div key={vendor.id} className="p-3 flex items-center justify-between hover:bg-slate-50 transition text-sm">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selectedVendors.includes(vendor.id)}
                        onChange={() => handleVendorSelect(vendor.id)}
                        className="size-4 text-primary border-slate-300 rounded focus:ring-primary"
                      />
                      <div>
                        <div className="font-semibold text-slate-800 flex items-center gap-2">
                          <span className="text-[9px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-bold">
                            Rank #{index + 1}
                          </span>
                          {vendor.name}
                        </div>
                        <div className="text-xs text-slate-400">{vendor.email}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-xs">
                      <div>
                        Specialties:{" "}
                        <strong className="text-slate-600">
                          {vendor.specializations ? vendor.specializations.join(", ") : "General"}
                        </strong>
                      </div>
                      <div className="flex flex-col items-end gap-1 select-none">
                        <div className="flex items-center gap-1">
                          Skill Match:{" "}
                          <span className={`font-bold px-1.5 py-0.5 rounded text-[10px] ${
                            vendor.skill_score >= 80 ? "bg-green-50 text-green-700" :
                            vendor.skill_score >= 50 ? "bg-amber-50 text-amber-700" :
                            "bg-slate-50 text-slate-500"
                          }`}>
                            {vendor.skill_score}%
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400">
                          Performance Rank: {vendor.historical_score}%
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Email Template Preview */}
              <div className="border border-slate-200 rounded-lg p-4 bg-slate-50 space-y-2 text-xs">
                <h5 className="font-bold text-slate-600 uppercase">Email Preview Example:</h5>
                <div className="bg-white p-3 rounded border border-slate-100 space-y-1">
                  <div><strong>Subject:</strong> [OUTSOURCE REQUEST] Resumes requested for: {job.title}</div>
                  <div className="border-t border-slate-100 my-2 pt-2"></div>
                  <div>Hello Vendor Team,</div>
                  <div className="text-slate-400 italic">We are looking for matching candidates for {job.title} with experience in: {job.skills_required?.join(", ")}. Please click the link to submit profiles...</div>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={handleSendOutreach}
                  disabled={selectedVendors.length === 0 || isSendingOutreach}
                  className="flex items-center gap-2 px-5 py-2 bg-primary text-white rounded-lg hover:bg-primary/95 transition text-sm font-semibold disabled:opacity-50"
                >
                  {isSendingOutreach ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Dispatched requests...
                    </>
                  ) : (
                    <>
                      <Send className="size-4" />
                      Send Outreach Request ({selectedVendors.length})
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className={activeTab === "upload" ? "" : "hidden"}>
        <form onSubmit={handleManualUploadSubmit} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <div>
            <h3 className="text-md font-bold text-slate-800 flex items-center gap-2">
              <Plus className="size-5 text-primary" />
              Manual Resume Attachment
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">Manually ingest candidate resumes. The system will parse candidate metadata and map overall fit score against this job instantly.</p>
          </div>

          <div className="border border-dashed border-slate-300 rounded-xl p-8 flex flex-col items-center justify-center bg-slate-50 cursor-pointer hover:bg-slate-100 transition relative">
            <input
              type="file"
              accept=".pdf,.docx,.txt"
              onChange={(e) => e.target.files && setManualFile(e.target.files[0])}
              className="absolute inset-0 opacity-0 cursor-pointer"
              required
            />
            <FileText className="size-10 text-slate-400 mb-2" />
            <span className="text-sm font-semibold text-slate-700">
              {manualFile ? manualFile.name : "Select candidate resume file"}
            </span>
            <span className="text-xs text-slate-400 mt-1">Supports PDF or DOCX (max 10MB)</span>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            {isUploadingManual && (
              <button
                type="button"
                onClick={handleStopUpload}
                className="px-4 py-2 border border-red-200 hover:border-red-300 text-red-600 hover:bg-red-50 text-sm font-semibold rounded-lg transition"
              >
                Stop Upload
              </button>
            )}
            <button
              type="submit"
              disabled={!manualFile || isUploadingManual}
              className="flex items-center gap-2 px-5 py-2 bg-primary text-white rounded-lg hover:bg-primary/95 transition text-sm font-semibold disabled:opacity-50"
            >
              {isUploadingManual ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {uploadStage === "UPLOADING" ? "Uploading file..." : "Extracting Profile via AI..."}
                </>
              ) : (
                "Attach Candidate"
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Styles for drawer animation */}
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .animate-slide-in {
          animation: slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>

      {/* Slide-out Resume Viewer Drawer */}
      {viewingResume && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-slate-900/60 backdrop-blur-sm transition-opacity duration-300">
          <div className="w-full max-w-3xl h-full bg-white shadow-2xl flex flex-col animate-slide-in">
            {/* Header */}
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <div>
                <h3 className="text-md font-bold text-slate-800 flex items-center gap-2">
                  <FileText className="size-5 text-blue-600" />
                  Resume: {viewingResume.candidateName}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">{viewingResume.fileName}</p>
              </div>
              <button 
                type="button"
                onClick={() => setViewingResume(null)}
                className="p-1.5 hover:bg-slate-200 rounded-full text-slate-500 hover:text-slate-800 transition"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-200 px-4 bg-slate-50">
              <button
                type="button"
                onClick={() => setResumeTab("preview")}
                className={`px-4 py-2 text-xs font-bold border-b-2 transition ${
                  resumeTab === "preview" ? "border-primary text-primary" : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                Document Preview
              </button>
              <button
                type="button"
                onClick={() => setResumeTab("text")}
                className={`px-4 py-2 text-xs font-bold border-b-2 transition ${
                  resumeTab === "text" ? "border-primary text-primary" : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                Parsed Text Content
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 p-4 bg-slate-100 overflow-auto flex flex-col">
              {resumeTab === "preview" ? (
                <div className="flex-1 bg-white rounded border border-slate-200 overflow-hidden flex flex-col justify-between">
                  {viewingResume.fileName.toLowerCase().endsWith(".pdf") ? (
                    <iframe
                      src={`http://localhost:5000/${viewingResume.filePath}`}
                      className="w-full h-full border-none"
                      title="Resume PDF Viewer"
                    />
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-slate-500 text-center gap-3">
                      <FileText className="size-12 text-slate-300" />
                      <div>
                        <h4 className="font-semibold text-slate-700">Document Preview Unavailable</h4>
                        <p className="text-xs text-slate-400 mt-1 max-w-sm">Direct browser preview is optimized for PDF files. For Word (.docx) or image files, please download the file or switch to the <strong>Parsed Text Content</strong> tab to view extracted resume details.</p>
                      </div>
                      <a
                        href={`http://localhost:5000/${viewingResume.filePath}`}
                        download
                        className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary/95 text-white rounded text-xs font-semibold transition"
                      >
                        Download File
                      </a>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex-1 bg-white rounded border border-slate-200 p-4 font-mono text-xs text-slate-700 overflow-auto whitespace-pre-wrap select-text leading-relaxed">
                  {viewingResume.extractedText || "No parsed text available."}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-200 flex justify-end gap-2 bg-slate-50">
              <a
                href={`http://localhost:5000/${viewingResume.filePath}`}
                download
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded text-xs font-semibold transition"
              >
                Download File
              </a>
              <button
                type="button"
                onClick={() => setViewingResume(null)}
                className="px-4 py-2 bg-primary hover:bg-primary/95 text-white rounded text-xs font-semibold transition"
              >
                Close Viewer
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Outsource Proposal Modal Dialog */}
      {outsourceModalCand && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white max-w-lg w-full p-6 rounded-xl border border-slate-200 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-3">
                <div className="size-9 bg-primary/10 text-primary rounded-lg flex items-center justify-center border border-primary/20">
                  <Send className="size-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Outsource Candidate Proposal</h3>
                  <p className="text-xs text-slate-400">Propose {outsourceModalCand.name} for {data?.job?.title}</p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setOutsourceModalCand(null)}
                className="p-1 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-700 transition"
              >
                <X className="size-5" />
              </button>
            </div>

            <form onSubmit={handleSendOutsourceProposal} className="space-y-4">
              <div className="space-y-3 text-sm">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Client Contact Email</label>
                  <input
                    type="text"
                    required
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
                    placeholder="e.g. client1@company.com, client2@company.com (comma separated)"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Email Subject</label>
                  <input
                    type="text"
                    required
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Email Body (Client Proposal Letter)</label>
                  <textarea
                    required
                    rows={8}
                    value={emailBody}
                    onChange={(e) => {
                      setEmailBody(e.target.value);
                      setIsEmailBodyEdited(true);
                    }}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-xs font-sans leading-relaxed"
                  />
                </div>

                <div className="flex items-center gap-2 pt-1 pb-2">
                  <input
                    type="checkbox"
                    id="attachResumeCheckbox"
                    checked={attachResume}
                    onChange={(e) => setAttachResume(e.target.checked)}
                    className="size-4 rounded border-slate-300 text-primary focus:ring-primary"
                  />
                  <label htmlFor="attachResumeCheckbox" className="text-sm text-slate-700 font-medium cursor-pointer">
                    Attach candidate's resume to this email
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setOutsourceModalCand(null)}
                  className="px-4 py-2 border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSendingOutsource}
                  className="flex items-center gap-1.5 px-5 py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary/95 transition disabled:opacity-50"
                >
                  {isSendingOutsource ? <Loader2 className="size-4 animate-spin" /> : null}
                  Send Outsource Proposal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Background Task Floating Status Indicator */}
      {uploadStage !== "IDLE" && activeTab !== "upload" && (
        <div className="fixed bottom-6 right-6 bg-slate-900 text-white px-5 py-4 rounded-xl shadow-2xl border border-slate-850 z-50 flex items-center gap-4 max-w-sm border-l-4 border-l-primary animate-pulse">
          <div className="size-9 bg-primary/10 text-primary rounded-lg flex items-center justify-center border border-primary/20 shrink-0">
            <Loader2 className="size-5 animate-spin text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Background Upload</div>
            <div className="text-xs font-bold truncate text-slate-100">{manualFile?.name || "resume.pdf"}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              {uploadStage === "UPLOADING" ? "Uploading bytes..." : "Extracting candidate details via AI..."}
            </div>
          </div>
          <button
            onClick={handleStopUpload}
            className="px-2.5 py-1 bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white border border-red-500/10 hover:border-red-600 rounded text-[10px] font-bold transition shrink-0 uppercase tracking-wider"
            title="Stop Upload"
          >
            Stop
          </button>
        </div>
      )}
    </div>
  );
}
