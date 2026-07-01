import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Briefcase, Plus, Calendar, IndianRupee, Users, AlertCircle, FileText, Upload, Sparkles, Loader2, Trash2 } from "lucide-react";

export function JobsDirectory() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Form State
  const [title, setTitle] = useState("");
  const [rawText, setRawText] = useState("");
  const [positionsNeeded, setPositionsNeeded] = useState(1);
  const [budget, setBudget] = useState("");
  const [experienceYears, setExperienceYears] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  // Clients state
  const [clients, setClients] = useState<any[]>([]);
  const [selectedClientId, setSelectedClientId] = useState("");

  const fetchClients = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch("/api/clients", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setClients(data);
      }
    } catch (err) {
      console.error("Error fetching clients list:", err);
    }
  };

  const fetchJobs = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch("/api/jobs", {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (!response.ok) throw new Error("Failed to fetch jobs");
      const data = await response.json();
      setJobs(data);
    } catch (err) {
      console.error(err);
      setError("Failed to load jobs list.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteJob = async (e: React.MouseEvent, jobId: number) => {
    e.preventDefault();
    e.stopPropagation();

    if (!window.confirm("Are you sure you want to delete this job description? This will remove the job description and all associated candidate matches.")) return;

    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`/api/jobs/${jobId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!response.ok) throw new Error("Failed to delete job description");

      await fetchJobs();
    } catch (err) {
      console.error(err);
      alert("Failed to delete job description.");
    }
  };

  useEffect(() => {
    fetchJobs();
    fetchClients();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError("");

    try {
      const token = localStorage.getItem("token");
      const formData = new FormData();
      formData.append("title", title);
      formData.append("positions_needed", positionsNeeded.toString());
      if (budget) formData.append("budget", budget);
      if (experienceYears) formData.append("experience_years", experienceYears);
      if (selectedClientId) formData.append("clientId", selectedClientId);
      if (file) {
        formData.append("jdFile", file);
      } else {
        formData.append("rawText", rawText);
      }

      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: formData
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Failed to create job");
      }

      await fetchJobs();
      
      // Reset form
      setTitle("");
      setRawText("");
      setPositionsNeeded(1);
      setBudget("");
      setExperienceYears("");
      setSelectedClientId("");
      setFile(null);
      setShowAddForm(false);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to parse and upload job description.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-200/80 pb-6 gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
            Job Descriptions Directory
          </h1>
          <p className="text-slate-500 mt-1 text-sm">
            Manage client job descriptions, extract skill requirements via AI, and audit candidate pools in real-time.
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#F55036] to-[#c9381f] text-white rounded-xl hover:shadow-lg hover:shadow-orange-600/20 active:scale-95 transition-all duration-200 font-bold text-sm shrink-0"
        >
          <Plus className="size-4" />
          Add Job Description
        </button>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-xl flex items-center gap-3 border border-red-100/80 shadow-sm animate-pulse">
          <AlertCircle className="size-5 shrink-0 text-red-500" />
          <p className="text-sm font-semibold">{error}</p>
        </div>
      )}

      {showAddForm && (
        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-lg space-y-6 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#F55036] to-[#c9381f]" />
          
          <div className="flex items-center gap-2.5 text-lg font-bold text-slate-800 pb-2 border-b border-slate-100">
            <Sparkles className="size-5 text-[#F55036] animate-pulse" />
            <h3>Create & AI-Parse Job Description</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Job Title (Optional if parsed)</label>
              <input
                type="text"
                placeholder="e.g. Senior Frontend Engineer"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#F55036] focus:border-transparent transition-all duration-200 placeholder-slate-400"
              />
            </div>
            
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Positions Needed</label>
              <input
                type="number"
                min="1"
                value={positionsNeeded}
                onChange={(e) => setPositionsNeeded(parseInt(e.target.value) || 1)}
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#F55036] focus:border-transparent transition-all duration-200"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Budget (INR Max Annual, e.g. 1200000)</label>
              <input
                type="number"
                placeholder="e.g. 1500000"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#F55036] focus:border-transparent transition-all duration-200 placeholder-slate-400"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Min Experience Years</label>
              <input
                type="number"
                placeholder="e.g. 5"
                value={experienceYears}
                onChange={(e) => setExperienceYears(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#F55036] focus:border-transparent transition-all duration-200 placeholder-slate-400"
              />
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Associate Corporate Client</label>
              <select
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#F55036] focus:border-transparent transition-all duration-200 bg-white cursor-pointer"
              >
                <option value="">-- Select Client (Optional) --</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.company_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Requirements Source</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border border-dashed border-slate-300 hover:border-[#F55036]/50 rounded-2xl p-6 flex flex-col items-center justify-center bg-slate-50 hover:bg-orange-50/5 cursor-pointer transition-all duration-200 relative group">
                <input
                  type="file"
                  accept=".pdf,.docx,.txt"
                  onChange={handleFileChange}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                <div className="size-11 bg-white border border-slate-200 rounded-xl flex items-center justify-center text-slate-400 group-hover:text-[#F55036] group-hover:border-[#F55036]/30 transition-all duration-250 shadow-sm mb-3">
                  <Upload className="size-5" />
                </div>
                <span className="text-sm font-semibold text-slate-700 text-center px-2">
                  {file ? file.name : "Upload PDF or DOCX file"}
                </span>
                <span className="text-xs text-slate-400 mt-1">Maximum file size 10MB</span>
              </div>

              <div className="space-y-1.5">
                <textarea
                  placeholder="Or paste the raw job description details here..."
                  rows={4}
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  disabled={!!file}
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-[#F55036] focus:border-transparent transition-all duration-200 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed resize-none min-h-[128px]"
                ></textarea>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition text-sm font-bold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#F55036] to-[#c9381f] text-white rounded-xl hover:shadow-lg hover:shadow-orange-600/25 active:scale-95 transition-all duration-200 text-sm font-bold disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Parsing Job Description...
                </>
              ) : (
                "Save & Parse"
              )}
            </button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="flex flex-col items-center justify-center p-20 text-slate-400 gap-3 bg-white rounded-2xl border border-slate-150 shadow-sm">
          <Loader2 className="size-8 animate-spin text-[#F55036]" />
          <span className="text-sm font-semibold tracking-wide">Loading job listings...</span>
        </div>
      ) : jobs.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center text-slate-500 shadow-sm space-y-4">
          <div className="size-16 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300 border border-slate-100 mx-auto">
            <Briefcase className="size-8" />
          </div>
          <div>
            <h3 className="font-bold text-slate-800 text-lg">No Job Descriptions Added</h3>
            <p className="text-sm text-slate-400 mt-1 max-w-sm mx-auto">
              Get started by uploading a client's job description. The AI will extract core skill parameters and score candidates automatically.
            </p>
          </div>
          <button
            onClick={() => setShowAddForm(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#F55036] to-[#c9381f] text-white rounded-xl hover:shadow-lg transition font-bold text-sm"
          >
            <Plus className="size-4" />
            Add First Job
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {jobs.map((job) => (
            <Link
              key={job.id}
              to={`/alphaxine/jobs/${job.id}`}
              className="group bg-white p-6 rounded-2xl border border-slate-200/90 hover:border-[#F55036] hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 shadow-sm flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className={`text-[10px] font-extrabold tracking-wider uppercase px-2.5 py-1 rounded-lg border ${
                    job.status === "OPEN" ? "bg-green-50 text-green-700 border-green-200/60" :
                    job.status === "PAUSED" ? "bg-amber-50 text-amber-700 border-amber-200/60" :
                    "bg-slate-50 text-slate-500 border-slate-200/60"
                  }`}>
                    {job.status}
                  </span>
                  <div className="flex items-center gap-2.5">
                    <div className="flex items-center gap-1 text-slate-400 text-xs">
                      <Calendar className="size-3.5 text-slate-400/80" />
                      <span className="font-medium">{new Date(job.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    </div>
                    <button
                      onClick={(e) => handleDeleteJob(e, job.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition"
                      title="Delete Job Description"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>

                <h3 className="text-xl font-bold text-slate-800 group-hover:text-[#F55036] transition duration-200 truncate">
                  {job.title}
                </h3>
                {job.client_name && (
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mt-1">
                    Client: <span className="text-[#F55036]">{job.client_name}</span>
                  </p>
                )}
                
                <div className="grid grid-cols-3 gap-3 mt-5">
                  <div className="bg-slate-50 rounded-xl p-2.5 flex flex-col justify-center border border-slate-100">
                    <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      <Users className="size-3.5 text-slate-400/85" />
                      <span>Positions</span>
                    </div>
                    <strong className="text-slate-800 text-sm">{job.positions_filled}/{job.positions_needed}</strong>
                  </div>

                  <div className="bg-slate-50 rounded-xl p-2.5 flex flex-col justify-center border border-slate-100">
                    <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      <IndianRupee className="size-3.5 text-slate-400/85" />
                      <span>Max Budget</span>
                    </div>
                    <strong className="text-slate-800 text-sm truncate">{job.budget ? `₹${(parseInt(job.budget) / 100000).toFixed(1)}L` : "Open"}</strong>
                  </div>

                  <div className="bg-orange-50/20 rounded-xl p-2.5 flex flex-col justify-center border border-orange-100/30">
                    <div className="flex items-center gap-1 text-[10px] font-bold text-[#F55036] uppercase tracking-wider mb-1">
                      <Sparkles className="size-3.5 text-[#F55036]/85" />
                      <span>Matches</span>
                    </div>
                    <strong className="text-[#F55036] text-sm">{job.matched_count ?? 0} Profiles</strong>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-4 mt-5 flex items-center justify-between text-xs text-slate-400">
                <span className="font-semibold">Experience Required: <strong className="text-slate-700">{job.experience_years ? `${job.experience_years}+ years` : "Open"}</strong></span>
                <span className="text-[#F55036] font-bold group-hover:translate-x-1.5 transition duration-200 flex items-center gap-1">
                  View Matching Candidates &rarr;
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
