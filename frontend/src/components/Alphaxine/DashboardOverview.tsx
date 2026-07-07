import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { 
  Briefcase, Building2, Users, CheckCircle, TrendingUp, Plus, 
  Calendar, Award, FileText, Sparkles, Clock, ArrowUpRight, Loader2, AlertCircle
} from "lucide-react";

export function DashboardOverview() {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchStats = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch("/api/dashboard/stats", {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (!response.ok) throw new Error("Failed to fetch dashboard metrics");
      const resData = await response.json();
      setData(resData);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to load dashboard statistics.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const handleGenerateReport = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch("/api/dashboard/report", {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (!response.ok) throw new Error("Failed to fetch report data");
      const reportData = await response.json();

      // Define columns
      const headers = [
        "Number of Openings",
        "Client",
        "JD",
        "Position",
        "Experience",
        "Number of Candidates Outsourced",
        "Number of Candidates Hired",
        "Number of Candidates Rejected"
      ];

      // Convert rows to CSV format
      const csvRows = [];
      csvRows.push(headers.map(h => `"${h.replace(/"/g, '""')}"`).join(","));

      for (const row of reportData) {
        const values = [
          row.openings || 0,
          row.client || "N/A",
          row.jd || "",
          row.position || "N/A",
          row.experience ? `${row.experience} years` : "Open",
          row.outsourced || 0,
          row.hired || 0,
          row.rejected || 0
        ];
        csvRows.push(values.map(v => {
          const str = String(v).replace(/"/g, '""');
          return `"${str}"`;
        }).join(","));
      }

      const csvContent = "\uFEFF" + csvRows.join("\n"); // Add BOM for Excel UTF-8 support
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `Recruitment_Report_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Failed to generate report.");
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 text-slate-400 gap-3 bg-white rounded-2xl border border-slate-150 shadow-sm max-w-6xl mx-auto mt-8">
        <Loader2 className="size-8 animate-spin text-[#F55036]" />
        <span className="text-sm font-semibold tracking-wide">Synthesizing recruiter dashboard overview...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-red-50 text-red-700 p-4 rounded-xl flex items-center gap-3 border border-red-100/80 shadow-sm max-w-6xl mx-auto mt-8">
        <AlertCircle className="size-5 shrink-0 text-red-500" />
        <p className="text-sm font-semibold">{error || "Failed to load stats"}</p>
      </div>
    );
  }

  const { kpis, recentCandidates, activeJobs, topVendors } = data;

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-200/80 pb-6 gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Alphaxine Dashboard</h1>
          <p className="text-slate-500 mt-1 text-sm">Real-time candidate metrics, client fulfillment pipeline, and recruiter activities overview.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleGenerateReport}
            className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-[#10b981] to-[#0d9488] text-white text-xs font-bold rounded-xl shadow-md hover:shadow-emerald-600/10 active:scale-95 transition cursor-pointer"
          >
            <FileText className="size-3.5" />
            Generate Report
          </button>
          <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold uppercase tracking-wider bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
            <Clock className="size-3.5" />
            <span>Live updates</span>
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Card 1: Active Jobs */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between hover:shadow-md transition duration-200">
          <div className="space-y-1">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Active Open Jobs</span>
            <h3 className="text-2xl font-black text-slate-900">{kpis.activeJobsCount}</h3>
            <p className="text-[11px] font-medium text-slate-500">
              Need: <span className="font-bold text-slate-700">{kpis.positionsNeeded}</span> | Filled: <span className="font-bold text-slate-700">{kpis.positionsFilled}</span>
            </p>
          </div>
          <div className="size-11 bg-orange-50 border border-orange-100/80 rounded-xl flex items-center justify-center text-[#F55036]">
            <Briefcase className="size-5" />
          </div>
        </div>

        {/* Card 2: Corporate Clients */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between hover:shadow-md transition duration-200">
          <div className="space-y-1">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Corporate Clients</span>
            <h3 className="text-2xl font-black text-slate-900">{kpis.clientsCount}</h3>
            <p className="text-[11px] font-medium text-slate-500">Registered client hubs</p>
          </div>
          <div className="size-11 bg-blue-50 border border-blue-100/80 rounded-xl flex items-center justify-center text-blue-600">
            <Building2 className="size-5" />
          </div>
        </div>

        {/* Card 3: Ingested Candidates */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between hover:shadow-md transition duration-200">
          <div className="space-y-1">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Ingested Profiles</span>
            <h3 className="text-2xl font-black text-slate-900">{kpis.candidatesCount}</h3>
            <p className="text-[11px] font-medium text-slate-500">
              Outsourced: <span className="font-bold text-slate-700">{kpis.outsourcedCount}</span>
            </p>
          </div>
          <div className="size-11 bg-emerald-50 border border-emerald-100/80 rounded-xl flex items-center justify-center text-emerald-600">
            <Users className="size-5" />
          </div>
        </div>

        {/* Card 4: Placements */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between hover:shadow-md transition duration-200">
          <div className="space-y-1">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Hired Placements</span>
            <h3 className="text-2xl font-black text-slate-900">{kpis.hiredCount}</h3>
            <p className="text-[11px] font-medium text-slate-500">Locked hires conversions</p>
          </div>
          <div className="size-11 bg-purple-50 border border-purple-100/80 rounded-xl flex items-center justify-center text-purple-600">
            <CheckCircle className="size-5" />
          </div>
        </div>
      </div>

      {/* Double Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left/Middle Column (Jobs Tracker & Ingested Resumes) */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Active Jobs Tracking */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2 font-bold text-slate-800">
                <TrendingUp className="size-5 text-[#F55036]" />
                <h3>Open Positions Tracker</h3>
              </div>
              <Link to="/alphaxine/jobs" className="text-xs font-bold text-[#F55036] hover:underline flex items-center gap-0.5">
                View All
                <ArrowUpRight className="size-3.5" />
              </Link>
            </div>

            {activeJobs.length === 0 ? (
              <p className="text-xs text-slate-400 italic text-center py-6">No active open jobs listed.</p>
            ) : (
              <div className="space-y-4.5">
                {activeJobs.map((job: any) => {
                  const pct = Math.min(100, Math.round((job.positions_filled / job.positions_needed) * 100));
                  return (
                    <div key={job.id} className="space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <div>
                          <Link to={`/alphaxine/jobs/${job.id}`} className="font-bold text-slate-800 hover:text-[#F55036] hover:underline transition">
                            {job.title}
                          </Link>
                          {job.client_name && (
                            <span className="text-[10px] text-slate-400 ml-2 uppercase font-bold tracking-wider">
                              ({job.client_name})
                            </span>
                          )}
                        </div>
                        <span className="font-bold text-slate-600">{job.positions_filled}/{job.positions_needed} Filled</span>
                      </div>
                      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200/40">
                        <div 
                          className="h-full bg-gradient-to-r from-[#F55036] to-[#c9381f] rounded-full transition-all duration-500" 
                          style={{ width: `${pct}%` }} 
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recent Ingested Resumes */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2 font-bold text-slate-800">
                <FileText className="size-5 text-[#F55036]" />
                <h3>Recent Resumes Ingested</h3>
              </div>
              <Link to="/alphaxine/resumes" className="text-xs font-bold text-[#F55036] hover:underline flex items-center gap-0.5">
                View All
                <ArrowUpRight className="size-3.5" />
              </Link>
            </div>

            {recentCandidates.length === 0 ? (
              <p className="text-xs text-slate-400 italic text-center py-6">No resumes parsed recently.</p>
            ) : (
              <div className="space-y-4">
                {recentCandidates.map((cand: any) => (
                  <div key={cand.id} className="flex justify-between items-start gap-4 text-xs group">
                    <div className="flex items-center gap-3">
                      <div className="size-9 rounded-full bg-gradient-to-br from-[#F55036]/10 to-[#c9381f]/5 border border-[#F55036]/20 text-[#F55036] flex items-center justify-center font-extrabold tracking-tight shrink-0 shadow-sm">
                        {cand.name?.split(' ').map((n: string) => n[0]).slice(0,2).join('').toUpperCase()}
                      </div>
                      <div>
                        <Link to="/alphaxine/candidates" className="font-bold text-slate-800 hover:text-[#F55036] transition">
                          {cand.name}
                        </Link>
                        <p className="text-[11px] text-slate-400 truncate max-w-xs">{cand.email}</p>
                      </div>
                    </div>
                    <div className="text-right text-[10px] text-slate-400 font-medium shrink-0 pt-0.5">
                      <span className="block font-bold text-slate-500 uppercase tracking-wider">{cand.file_name?.slice(0, 15)}...</span>
                      <span>{new Date(cand.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column (Top Partners & Quick Actions) */}
        <div className="space-y-6">
          
          {/* Top Recruiting Partners */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2 font-bold text-slate-800">
                <Award className="size-5 text-[#F55036]" />
                <h3>Top Vendors Rank</h3>
              </div>
              <Link to="/alphaxine/vendors" className="text-xs font-bold text-[#F55036] hover:underline flex items-center gap-0.5">
                Manage
                <ArrowUpRight className="size-3.5" />
              </Link>
            </div>

            {topVendors.length === 0 ? (
              <p className="text-xs text-slate-400 italic text-center py-6">No vendors performance ranked yet.</p>
            ) : (
              <div className="space-y-3.5">
                {topVendors.map((vendor: any, idx: number) => (
                  <div key={vendor.id} className="flex justify-between items-center text-xs">
                    <div className="flex items-center gap-2.5">
                      <span className="text-[10px] font-extrabold text-[#F55036] bg-[#F55036]/10 px-2 py-0.5 rounded-md">
                        #{idx + 1}
                      </span>
                      <div>
                        <strong className="text-slate-800 block truncate max-w-[130px]">{vendor.name}</strong>
                        <span className="text-[10px] text-slate-400">Sent {vendor.total_submissions} profiles</span>
                      </div>
                    </div>
                    <span className="font-extrabold text-emerald-600 bg-emerald-50 px-2 py-1 border border-emerald-250/20 rounded-lg">
                      {Math.round(vendor.overall_score)}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick Actions Panel */}
          <div className="bg-gradient-to-br from-[#F55036] to-[#c9381f] p-6 rounded-2xl text-white shadow-lg space-y-4 relative overflow-hidden">
            <div className="absolute top-0 right-0 size-24 bg-white/5 rounded-full blur-xl translate-x-4 -translate-y-4" />
            <div className="flex items-center gap-2 font-bold text-lg border-b border-white/20 pb-2">
              <Sparkles className="size-5 animate-pulse" />
              <h3>Quick Actions</h3>
            </div>
            
            <div className="space-y-3">
              <Link 
                to="/alphaxine/upload"
                className="flex items-center justify-between p-3 bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl transition duration-200 font-bold text-xs"
              >
                <span>Bulk Resume Ingestion</span>
                <Plus className="size-4 shrink-0" />
              </Link>

              <Link 
                to="/alphaxine/jobs"
                className="flex items-center justify-between p-3 bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl transition duration-200 font-bold text-xs"
              >
                <span>Add Job Requirements</span>
                <Plus className="size-4 shrink-0" />
              </Link>

              <Link 
                to="/alphaxine/clients"
                className="flex items-center justify-between p-3 bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl transition duration-200 font-bold text-xs"
              >
                <span>Register Corporate Client</span>
                <Plus className="size-4 shrink-0" />
              </Link>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
