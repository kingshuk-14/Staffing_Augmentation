import React, { useEffect, useState } from "react";
import { Users, Search, AlertCircle, Loader2, Mail, Phone, Calendar, Shield, Trash2, Edit3, CheckCircle, XCircle, Send, Check, Clock } from "lucide-react";

interface Candidate {
  id: number;
  resume_id: number;
  name: string;
  email: string;
  phone: string;
  expected_salary: string;
  current_location: string;
  total_experience_years: string;
  status: string;
  file_name: string;
  file_path: string;
  skills: string[];
  hired_at?: string;
  hired_by_company?: string;
  employment_start_date?: string;
  tenure_months?: number;
}

export function CandidatesManager() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  
  // Hired Modal State
  const [hiredModalCand, setHiredModalCand] = useState<Candidate | null>(null);
  const [hiredCompany, setHiredCompany] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [tenureMonths, setTenureMonths] = useState("12");
  const [isSubmittingHired, setIsSubmittingHired] = useState(false);

  // History Panel State
  const [historyPanel, setHistoryPanel] = useState<{ cand: Candidate; events: any[] } | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const openHistory = async (cand: Candidate) => {
    setIsLoadingHistory(true);
    setHistoryPanel({ cand, events: [] });
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/matches/candidate/${cand.id}/history`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setHistoryPanel({ cand, events: data });
    } catch {
      setHistoryPanel({ cand, events: [] });
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const fetchCandidates = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch("/api/candidates", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) throw new Error("Failed to fetch candidates list");
      const data = await response.json();
      setCandidates(data);
    } catch (err: any) {
      console.error(err);
      setError("Failed to load candidates.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCandidates();
  }, []);

  const handleUpdateStatus = async (candId: number, status: string, extraData = {}) => {
    try {
      setError("");
      const token = localStorage.getItem("token");
      const response = await fetch(`/api/candidates/${candId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status, ...extraData })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Failed to update candidate status");
      }

      await fetchCandidates();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to update candidate status.");
    }
  };

  const handleDeleteCandidate = async (candId: number) => {
    if (!confirm("Are you sure you want to delete this candidate? The original resume file will NOT be deleted.")) return;
    
    try {
      setError("");
      const token = localStorage.getItem("token");
      const response = await fetch(`/api/candidates/${candId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Failed to delete candidate");
      }

      await fetchCandidates();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to delete candidate.");
    }
  };

  const openHiredModal = (cand: Candidate) => {
    setHiredModalCand(cand);
    setHiredCompany(cand.hired_by_company || "TBD Company");
    setStartDate(cand.employment_start_date ? cand.employment_start_date.split("T")[0] : new Date().toISOString().split("T")[0]);
    setTenureMonths(cand.tenure_months ? cand.tenure_months.toString() : "12");
  };

  const handleHiredSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hiredModalCand) return;
    setIsSubmittingHired(true);

    try {
      await handleUpdateStatus(hiredModalCand.id, "HIRED", {
        hired_by_company: hiredCompany,
        employment_start_date: startDate,
        tenure_months: parseInt(tenureMonths) || 0
      });
      setHiredModalCand(null);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmittingHired(false);
    }
  };

  // Filter and search
  const filteredCandidates = candidates.filter(cand => {
    const query = searchQuery.toLowerCase();
    const matchesSearch = 
      cand.name.toLowerCase().includes(query) ||
      cand.email.toLowerCase().includes(query) ||
      cand.skills.some(s => s.toLowerCase().includes(query)) ||
      (cand.current_location && cand.current_location.toLowerCase().includes(query));

    const matchesStatus = statusFilter === "ALL" || cand.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-200/80 pb-6 gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Candidates Tracking &amp; Locking</h1>
          <p className="text-slate-500 mt-1 text-sm">
            Monitor outsourced profiles, lock hired candidates from further matching pools, and track active statuses.
          </p>
        </div>
        <div className="size-10 bg-primary/10 rounded-lg flex items-center justify-center text-primary border border-primary/20 shrink-0">
          <Users className="size-5" />
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg flex items-center gap-3 border border-red-100">
          <AlertCircle className="size-5 shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="flex flex-col md:flex-row gap-4 justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 size-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search candidates by name, email, location, or skills..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#F55036] focus:border-transparent transition-all duration-200 placeholder-slate-400"
          />
        </div>
        
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Status:</span>
          <div className="flex gap-1 bg-slate-100/80 p-1 rounded-xl border border-slate-200/60">
            {["ALL", "ACTIVE", "HIRED", "OUTSOURCED", "REJECTED"].map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={
                  statusFilter === status
                    ? "px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-gradient-to-r from-[#F55036] to-[#c9381f] shadow-sm transition-all duration-200"
                    : "px-4 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:text-slate-800 hover:bg-white transition-all duration-200"
                }
              >
                {status.toLowerCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center p-12 text-slate-500 gap-2">
          <Loader2 className="size-6 animate-spin text-primary" />
          <span>Loading candidates...</span>
        </div>
      ) : filteredCandidates.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-500 shadow-sm">
          <Users className="size-12 text-slate-300 mx-auto mb-3" />
          <h3 className="font-semibold text-slate-800 text-lg">No Candidates Found</h3>
          <p className="text-sm mt-1 max-w-md mx-auto">
            {searchQuery || statusFilter !== "ALL"
              ? "Try adjusting your search query or filter selection parameters."
              : "Upload recruiter resumes to automatically populate candidate profiles."}
          </p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                <th className="p-4 pl-6">Candidate / Details</th>
                <th className="p-4">Key Skills</th>
                <th className="p-4">Resume File</th>
                <th className="p-4 text-center">Current Status</th>
                <th className="p-4 pr-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
              {filteredCandidates.map((cand) => (
                <tr key={cand.id} className="hover:bg-slate-50/50 transition">
                  <td className="p-4 pl-6 max-w-xs">
                    <div className="flex items-center">
                      <div className="size-9 rounded-full bg-gradient-to-br from-[#F55036] to-[#c9381f] text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-sm mr-3 inline-flex">
                        {cand.name?.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()}
                      </div>
                      <div>
                        <div className="font-bold text-slate-900">{cand.name}</div>
                        <div className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                          <Mail className="size-3" />
                          {cand.email}
                        </div>
                        {cand.phone && (
                          <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                            <Phone className="size-3" />
                            {cand.phone}
                          </div>
                        )}
                        {cand.current_location && (
                          <div className="text-xs text-slate-500 font-medium mt-1">
                            Location: <span className="text-slate-700">{cand.current_location}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="p-4 max-w-xs">
                    <div className="flex flex-wrap gap-1">
                      {cand.skills && cand.skills.length > 0 ? (
                        cand.skills.slice(0, 5).map((skill, idx) => (
                          <span key={idx} className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-medium border border-slate-200">
                            {skill}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-slate-400 italic">No skills extracted</span>
                      )}
                      {cand.skills && cand.skills.length > 5 && (
                        <span className="text-[10px] text-slate-400 font-semibold self-center ml-1">+{cand.skills.length - 5} more</span>
                      )}
                    </div>
                  </td>
                  <td className="p-4">
                    {cand.file_name ? (
                      <a
                        href={`http://localhost:5000/${cand.file_path}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-primary font-bold hover:underline truncate max-w-[150px] inline-block"
                      >
                        {cand.file_name}
                      </a>
                    ) : (
                      <span className="text-xs text-slate-400 italic">No file linked</span>
                    )}
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      Exp: {cand.total_experience_years ? `${cand.total_experience_years} years` : "Open"}
                    </div>
                  </td>
                  <td className="p-4 text-center">
                    <span className={`inline-flex items-center gap-1 text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-lg select-none ${
                      cand.status === "HIRED" ? "bg-emerald-50 text-emerald-700 border border-emerald-200/60" :
                      cand.status === "OUTSOURCED" || cand.status === "SENT_TO_CLIENT" ? "bg-blue-50 text-blue-700 border border-blue-200/60" :
                      cand.status === "REJECTED" ? "bg-red-50 text-red-700 border border-red-200/60" :
                      "bg-green-50 text-green-700 border border-green-200/60"
                    }`}>
                      {cand.status === "HIRED" && <Check className="size-3" />}
                      {(cand.status === "OUTSOURCED" || cand.status === "SENT_TO_CLIENT") && <Send className="size-3" />}
                      {cand.status === "REJECTED" && <XCircle className="size-3" />}
                      {cand.status}
                    </span>

                    {cand.status === "HIRED" && cand.hired_by_company && (
                      <div className="text-[10px] text-slate-400 font-medium mt-1">
                        at <strong className="text-slate-600">{cand.hired_by_company}</strong>
                        {cand.tenure_months ? ` (${cand.tenure_months}m tenure)` : ""}
                      </div>
                    )}
                  </td>
                  <td className="p-4 pr-6 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <select
                        value={cand.status}
                        onChange={(e) => {
                          const nextStatus = e.target.value;
                          if (nextStatus === "HIRED") {
                            openHiredModal(cand);
                          } else {
                            handleUpdateStatus(cand.id, nextStatus);
                          }
                        }}
                        className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer text-slate-700 hover:border-slate-300 transition"
                      >
                        <option value="ACTIVE">Mark Active</option>
                        <option value="OUTSOURCED">Mark Outsourced</option>
                        <option value="REJECTED">Mark Rejected</option>
                        <option value="HIRED">Lock Hired</option>
                      </select>
                      
                      {cand.status === "HIRED" && (
                        <button
                          onClick={() => openHiredModal(cand)}
                          title="Edit Hire details"
                          className="p-1.5 text-slate-400 hover:text-primary rounded border border-slate-100 hover:border-primary/20 bg-slate-50 hover:bg-primary/5 transition"
                        >
                          <Edit3 className="size-3.5" />
                        </button>
                      )}
                      
                      <button
                        onClick={() => openHistory(cand)}
                        title="View Outsource History"
                        className="p-1.5 text-slate-400 hover:text-blue-600 rounded border border-slate-100 hover:border-blue-200 bg-slate-50 hover:bg-blue-50 transition"
                      >
                        <Clock className="size-3.5" />
                      </button>

                      <button
                        onClick={() => handleDeleteCandidate(cand.id)}
                        title="Delete Candidate"
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded border border-slate-100 hover:border-red-200 bg-slate-50 hover:bg-red-50 transition ml-1"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Candidate History Drawer */}
      {historyPanel && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 z-50" onClick={() => setHistoryPanel(null)}>
          <div className="bg-white w-full max-w-lg rounded-xl border border-slate-200 shadow-xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50">
              <div>
                <h3 className="font-bold text-slate-900 flex items-center gap-2"><Clock className="size-4 text-blue-500" /> Outsource History</h3>
                <p className="text-xs text-slate-400 mt-0.5">{historyPanel.cand.name}</p>
              </div>
              <button onClick={() => setHistoryPanel(null)} className="text-slate-400 hover:text-slate-700 text-xl font-bold">✕</button>
            </div>
            <div className="p-5 max-h-96 overflow-y-auto">
              {isLoadingHistory ? (
                <div className="flex justify-center py-8"><Loader2 className="size-6 animate-spin text-slate-400" /></div>
              ) : historyPanel.events.length === 0 ? (
                <p className="text-sm text-slate-400 italic text-center py-8">No outsource history found for this candidate.</p>
              ) : (
                <ol className="relative border-l-2 border-slate-200 ml-3 space-y-5">
                  {historyPanel.events.map((ev) => {
                    const statusColor =
                      ev.status === 'ACCEPTED' ? 'bg-green-500' :
                      ev.status === 'REJECTED' ? 'bg-red-500' :
                      ev.status === 'WITHDRAWN' ? 'bg-slate-400' :
                      'bg-blue-500';
                    const statusLabel =
                      ev.status === 'ACCEPTED' ? 'Accepted' :
                      ev.status === 'REJECTED' ? 'Rejected' :
                      ev.status === 'WITHDRAWN' ? 'Withdrawn' :
                      'Outsourced to Client';
                    return (
                      <li key={ev.id} className="ml-5">
                        <span className={`absolute -left-[9px] size-4 rounded-full border-2 border-white ${statusColor}`} />
                        <p className="text-xs font-bold text-slate-700">{statusLabel}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Job: <span className="font-semibold text-slate-700">{ev.job_title}</span>
                        </p>
                        <p className="text-xs text-slate-500">
                          Client: <span className="font-semibold text-slate-700">{ev.client_name || ev.client_email}</span>
                        </p>
                        {ev.notes && <p className="text-xs text-slate-400 italic mt-0.5">{ev.notes}</p>}
                        <p className="text-[10px] text-slate-400 mt-1">{new Date(ev.event_at).toLocaleString()}</p>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Hired Details Modal */}
      {hiredModalCand && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white max-w-md w-full p-6 rounded-xl border border-slate-200 shadow-xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="size-9 bg-green-50 text-green-600 rounded-lg flex items-center justify-center border border-green-200">
                <CheckCircle className="size-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Lock Candidate Profile</h3>
                <p className="text-xs text-slate-400">Locking {hiredModalCand.name} as HIRED</p>
              </div>
            </div>

            <form onSubmit={handleHiredSubmit} className="space-y-4">
              <div className="space-y-3 text-sm">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Hiring Company</label>
                  <input
                    type="text"
                    required
                    value={hiredCompany}
                    onChange={(e) => setHiredCompany(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
                    placeholder="e.g. Google India"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Employment Start Date</label>
                    <input
                      type="date"
                      required
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Tenure Commitment (months)</label>
                    <input
                      type="number"
                      required
                      min="1"
                      value={tenureMonths}
                      onChange={(e) => setTenureMonths(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
                      placeholder="e.g. 12"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setHiredModalCand(null)}
                  className="px-4 py-2 border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingHired}
                  className="flex items-center gap-1.5 px-5 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 transition disabled:opacity-50"
                >
                  {isSubmittingHired ? <Loader2 className="size-4 animate-spin" /> : null}
                  Confirm & Lock Profile
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
