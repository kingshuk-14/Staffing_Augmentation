import { useEffect, useState } from "react";
import { FileText, Calendar, User, Database, AlertCircle, Eye, X, Sparkles, Loader2, Trash2, CopyX, ShieldCheck, Filter, FlagOff, RefreshCw } from "lucide-react";

function renderNestedObject(obj: any): React.ReactNode {
  if (typeof obj !== 'object' || obj === null) return String(obj);
  
  // Custom renderer for work experience objects
  if (obj.company || obj.position || obj.role || obj.roles || obj.description) {
    const title = obj.position || obj.role || "Consultant";
    const company = obj.company || "Company";
    const dates = obj.duration || obj.dates || (obj.duration_months ? `${obj.duration_months} months` : "");
    const rolesList = Array.isArray(obj.roles) ? obj.roles : Array.isArray(obj.description) ? obj.description : obj.roles ? [obj.roles] : [];
    
    return (
      <div className="space-y-2 text-slate-700 text-sm">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-baseline font-bold text-slate-900 border-b border-slate-100 pb-1 gap-1">
          <span>{title} <span className="text-slate-500 font-normal">at</span> {company}</span>
          {dates && <span className="text-[10px] font-normal text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full shrink-0">{dates}</span>}
        </div>
        {obj.client && <div className="text-xs"><span className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">Client:</span> {obj.client}</div>}
        {obj.project && <div className="text-xs"><span className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">Project:</span> {obj.project}</div>}
        {rolesList.length > 0 && (
          <ul className="list-disc pl-4 space-y-1 text-xs text-slate-600">
            {rolesList.map((role: string, idx: number) => (
              <li key={idx}>{role}</li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  // Custom renderer for education objects
  if (obj.school || obj.degree || obj.university || obj.education || obj.college) {
    const degree = obj.degree || obj.course || "Degree";
    const institution = obj.school || obj.university || obj.college || "Institution";
    const year = obj.year || obj.passing_year || "";
    return (
      <div className="text-sm text-slate-700">
        <div className="font-bold text-slate-900">{degree}</div>
        <div className="text-xs text-slate-500">{institution} {year ? `(${year})` : ""}</div>
      </div>
    );
  }

  // Generic object renderer as key-value pairs
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-700">
      {Object.entries(obj).map(([k, v]) => (
        <div key={k} className="flex gap-2">
          <span className="font-bold uppercase text-slate-400 tracking-wider text-[10px] shrink-0">{k.replace(/([A-Z])/g, ' $1').trim()}:</span>
          <span>{Array.isArray(v) ? v.join(", ") : String(v)}</span>
        </div>
      ))}
    </div>
  );
}

function renderSummaryValue(value: any): React.ReactNode {
  // If it's a primitive
  if (typeof value !== 'object' || value === null) {
    return <p className="text-[15px] leading-relaxed text-slate-800 font-medium">{String(value)}</p>;
  }

  // If it's an array of objects
  if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
    return (
      <div className="space-y-3 mt-2 w-full">
        {value.map((item, i) => (
          <div key={i} className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm hover:border-[#F55036]/30 transition-colors">
            {renderNestedObject(item)}
          </div>
        ))}
      </div>
    );
  }

  // If it's an array of primitives
  if (Array.isArray(value)) {
    return (
      <div className="flex flex-wrap gap-2 mt-1">
        {value.map((v: any, i: number) => (
          <span key={i} className="px-3 py-1.5 bg-white border border-slate-200 shadow-sm rounded-lg text-xs font-semibold text-slate-700 hover:border-[#F55036]/40 hover:text-[#F55036] transition-colors cursor-default">
            {String(v)}
          </span>
        ))}
      </div>
    );
  }

  // If it's a single object
  return (
    <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm mt-2 w-full">
      {renderNestedObject(value)}
    </div>
  );
}

export function ParsedResumesList() {
  const [resumes, setResumes] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedResume, setSelectedResume] = useState<any | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [duplicateFilter, setDuplicateFilter] = useState<"all" | "flagged" | "clean">("all");


  const [selectedFields, setSelectedFields] = useState<string[]>(["experience"]);
  const availableFields = ["skill set", "experience", "education", "location", "certifications", "projects"];

  // Reason labels for duplicate badges
  const REASON_META: Record<string, { label: string; color: string; dotColor: string }> = {
    EXACT_FILENAME:    { label: "Exact Copy",      color: "bg-red-50 text-red-700 border-red-200",       dotColor: "bg-red-500" },
    EMAIL_MATCH:       { label: "Same Person",     color: "bg-orange-50 text-orange-700 border-orange-200", dotColor: "bg-orange-500" },
    NAME_SKILL_OVERLAP:{ label: "Likely Same",     color: "bg-amber-50 text-amber-700 border-amber-200",   dotColor: "bg-amber-500" },
    NAME_EXP_OVERLAP:  { label: "Likely Same",     color: "bg-amber-50 text-amber-700 border-amber-200",   dotColor: "bg-amber-500" },
    SKILL_OVERLAP:     { label: "Possible Match",  color: "bg-yellow-50 text-yellow-700 border-yellow-200", dotColor: "bg-yellow-500" },
    SUMMARY_MATCH:     { label: "Profile Match",   color: "bg-violet-50 text-violet-700 border-violet-200", dotColor: "bg-violet-500" },
  };

  const fetchResumes = async () => {
      try {
        const token = localStorage.getItem("token");
        const response = await fetch("/api/resumes", {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        
        if (!response.ok) {
          throw new Error("Failed to fetch resumes");
        }
        
        const data = await response.json();
        setResumes(data);
      } catch (err) {
        console.error(err);
        setError("Could not load parsed resumes.");
      } finally {
        setIsLoading(false);
      }
    };

  useEffect(() => {
    fetchResumes();
  }, []);

  const handleReparse = async (resumeId: number) => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`/api/resumes/${resumeId}/reparse`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (!response.ok) throw new Error("Failed to trigger reparse");
      // Set status to INGESTED in local state immediately
      setResumes(prev =>
        prev.map(r => r.id === resumeId ? { ...r, processing_status: 'INGESTED', error_message: null } : r)
      );
      // Wait a moment then fetch fresh data
      setTimeout(fetchResumes, 1000);
    } catch (err) {
      console.error(err);
      alert("Failed to trigger resume reparsing.");
    }
  };

  const handleDelete = async (resumeId: number) => {
    if (!window.confirm("Are you sure you want to delete this resume? This will also remove the candidate profile and all associated matching records.")) return;
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`/api/resumes/${resumeId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (!response.ok) throw new Error("Failed to delete resume");

      // Re-fetch so any cleared duplicate flags are reflected immediately
      fetchResumes();
    } catch (err) {
      console.error(err);
      alert("Failed to delete resume.");
    }
  };

  const handleClearDuplicate = async (resumeId: number) => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`/api/resumes/${resumeId}/clear-duplicate`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (!response.ok) throw new Error("Failed to clear flag");
      // Optimistically update local state for instant UI feedback
      setResumes(prev =>
        prev.map(r =>
          r.id === resumeId
            ? { ...r, is_duplicate: false, duplicate_of: null, duplicate_score: null, duplicate_reason: null, duplicate_of_file_name: null }
            : r
        )
      );
    } catch (err) {
      console.error(err);
      alert("Failed to clear duplicate flag.");
    }
  };

  const handleSummarize = async (resumeId: number) => {
    setIsSummarizing(true);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`/api/resumes/${resumeId}/summarize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ fields: selectedFields })
      });
      
      if (!response.ok) throw new Error("Failed to summarize");
      
      const data = await response.json();
      
      // Update selected resume with new summary
      setSelectedResume((prev: any) => ({ ...prev, summarised: data.summary }));
      
      // Re-fetch all to keep list fresh
      fetchResumes();
    } catch (err) {
      console.error(err);
      alert("Failed to summarize resume with Groq.");
    } finally {
      setIsSummarizing(false);
    }
  };

  const toggleField = (field: string) => {
    if (field === "experience") return; // mandatory
    setSelectedFields(prev => 
      prev.includes(field) 
        ? prev.filter(f => f !== field)
        : [...prev, field]
    );
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-24 text-slate-400 gap-3 bg-white rounded-2xl border border-slate-100 shadow-sm">
        <Loader2 className="size-8 animate-spin text-[#F55036]" />
        <span className="text-sm font-semibold tracking-wide">Loading parsed resumes...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-50 text-red-700 p-4 rounded-xl flex items-center gap-3 border border-red-100/80 shadow-sm">
          <AlertCircle className="size-5 shrink-0 text-red-500" />
          <p className="text-sm font-semibold">{error}</p>
        </div>
      </div>
    );
  }

  // Filtered list based on duplicateFilter
  const filteredResumes = resumes.filter(r => {
    if (duplicateFilter === "flagged") return !!r.is_duplicate;
    if (duplicateFilter === "clean")   return !r.is_duplicate;
    return true;
  });

  const duplicateCount = resumes.filter(r => r.is_duplicate).length;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-200/80 pb-6 gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Parsed Resumes</h1>
          <p className="text-slate-500 mt-1 text-sm">View and manage all resumes that have been processed and parsed by the AI system.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total:</span>
          <span className="text-sm font-extrabold text-slate-800 bg-slate-100 px-3 py-1 rounded-lg border border-slate-200">{resumes.length} Resumes</span>
        </div>
      </div>

      {/* Duplicate filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
          <Filter className="size-3.5" />
          <span>Filter:</span>
        </div>
        <div className="flex gap-1 bg-slate-100/80 p-1 rounded-xl border border-slate-200/60">
          {(["all", "flagged", "clean"] as const).map(opt => (
            <button
              key={opt}
              onClick={() => setDuplicateFilter(opt)}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 ${
                duplicateFilter === opt
                  ? opt === "flagged"
                    ? "bg-amber-500 text-white shadow-sm"
                    : opt === "clean"
                    ? "bg-green-600 text-white shadow-sm"
                    : "bg-gradient-to-r from-[#F55036] to-[#c9381f] text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-800 hover:bg-white"
              }`}
            >
              {opt === "all" && `All (${resumes.length})`}
              {opt === "flagged" && `⚠ Flagged (${duplicateCount})`}
              {opt === "clean" && `✓ Unique (${resumes.length - duplicateCount})`}
            </button>
          ))}
        </div>
      </div>

      {filteredResumes.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center shadow-sm space-y-4">
          <div className="size-16 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300 border border-slate-100 mx-auto">
            <Database className="size-8" />
          </div>
          <div>
            <h3 className="font-bold text-slate-800 text-lg">
              {duplicateFilter === "flagged" ? "No duplicates found" : duplicateFilter === "clean" ? "No unique resumes" : "No resumes found"}
            </h3>
            <p className="text-sm text-slate-400 mt-1 max-w-sm mx-auto">
              {duplicateFilter === "all" ? "Upload resumes to have them parsed and analyzed by the AI system." : "Try changing the filter above."}
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/80">
                  <th className="px-6 py-4 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Candidate / File</th>
                  <th className="px-6 py-4 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Duplicate Status</th>
                  <th className="px-6 py-4 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Uploaded By</th>
                  <th className="px-6 py-4 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Engine</th>
                  <th className="px-6 py-4 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Size</th>
                  <th className="px-6 py-4 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-4 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredResumes.map((resume) => {
                  const metadata = resume.parsed_metadata ? (typeof resume.parsed_metadata === 'string' ? JSON.parse(resume.parsed_metadata) : resume.parsed_metadata) : {};
                  const sizeMB = metadata.fileSize ? (metadata.fileSize / 1024 / 1024).toFixed(2) + " MB" : "Unknown";
                  const engine = metadata.parsedEngine || "Unknown";
                  const isDup = !!resume.is_duplicate;
                  const reasonMeta = isDup && resume.duplicate_reason ? REASON_META[resume.duplicate_reason] : null;

                  return (
                    <tr
                      key={resume.id}
                      className={`hover:bg-slate-50/80 transition-all duration-150 ${
                        isDup ? "bg-amber-50/20 border-l-2 border-l-amber-400" : ""
                      }`}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`size-9 rounded-xl flex items-center justify-center flex-shrink-0 border ${
                            isDup ? "bg-amber-50 border-amber-200" : "bg-[#F55036]/5 border-[#F55036]/15"
                          }`}>
                            {isDup
                              ? <CopyX className="size-4 text-amber-600" />
                              : <FileText className="size-4 text-[#F55036]" />}
                          </div>
                          <div>
                            <span className="text-sm font-bold text-slate-800 truncate max-w-[180px] block" title={resume.file_name}>
                              {resume.file_name}
                            </span>
                            <span className="text-xs text-slate-400 font-medium">{resume.file_type?.toUpperCase()}</span>
                          </div>
                        </div>
                      </td>

                      {/* Duplicate badge cell */}
                      <td className="px-6 py-4">
                        {isDup && reasonMeta ? (
                          <div className="flex flex-col gap-1.5">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-extrabold border uppercase tracking-wide ${reasonMeta.color}`}>
                              <span className={`size-1.5 rounded-full flex-shrink-0 ${reasonMeta.dotColor}`} />
                              {reasonMeta.label}
                            </span>
                            <span className="text-[11px] text-slate-400 font-medium">
                              Confidence: {resume.duplicate_score}/100
                            </span>
                            {resume.duplicate_of_file_name && (
                              <span className="text-[11px] text-slate-400 truncate max-w-[140px]" title={resume.duplicate_of_file_name}>
                                cf. {resume.duplicate_of_file_name}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-extrabold border uppercase tracking-wide bg-green-50 text-green-700 border-green-200/60">
                            <ShieldCheck className="size-3" />
                            Unique
                          </span>
                        )}
                      </td>

                      {/* Processing status cell */}
                      <td className="px-6 py-4">
                        {resume.processing_status === 'COMPLETED' ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-extrabold border uppercase tracking-wide bg-green-50 text-green-700 border-green-200/60">
                            Success
                          </span>
                        ) : resume.processing_status === 'FAILED' ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-extrabold border uppercase tracking-wide bg-red-50 text-red-700 border-red-200/60 cursor-help" title={resume.error_message || 'Unknown parsing error'}>
                            Failed
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-extrabold border uppercase tracking-wide bg-blue-50 text-blue-700 border-blue-200/60 animate-pulse">
                            Parsing...
                          </span>
                        )}
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2.5">
                          <div className="size-8 rounded-full bg-gradient-to-br from-slate-600 to-slate-800 text-white flex items-center justify-center font-bold text-xs shrink-0">
                            {`${resume.first_name?.[0] ?? ''}${resume.last_name?.[0] ?? ''}`.toUpperCase()}
                          </div>
                          <span className="text-sm font-semibold text-slate-700">{resume.first_name} {resume.last_name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase tracking-wide bg-slate-100 text-slate-600 border border-slate-200/60">
                          {engine}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500 font-medium">
                        {sizeMB}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-sm text-slate-500">
                          <Calendar className="size-4" />
                          {new Date(resume.created_at).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setSelectedResume(resume)}
                            className="flex items-center gap-1.5 text-xs font-bold text-[#F55036] hover:text-[#c9381f] transition-all duration-200 bg-[#F55036]/5 hover:bg-[#F55036]/10 border border-[#F55036]/20 px-3 py-1.5 rounded-lg"
                          >
                            <Eye className="size-3.5" />
                            View
                          </button>
                          <button
                            onClick={() => handleDelete(resume.id)}
                            className="flex items-center gap-1.5 text-xs font-bold text-red-600 hover:text-red-700 transition-all duration-200 bg-red-50 hover:bg-red-100 border border-red-200/60 px-3 py-1.5 rounded-lg"
                          >
                            <Trash2 className="size-3.5" />
                            Delete
                          </button>
                          {resume.processing_status === 'FAILED' && (
                            <button
                              onClick={() => handleReparse(resume.id)}
                              title="Retry parsing this resume"
                              className="flex items-center gap-1.5 text-xs font-bold text-blue-700 hover:text-blue-900 transition-all duration-200 bg-blue-50 hover:bg-blue-100 border border-blue-200/60 px-2.5 py-1.5 rounded-lg animate-bounce"
                            >
                              <RefreshCw className="size-3.5 animate-spin" style={{ animationDuration: '3s' }} />
                              Reparse
                            </button>
                          )}
                          {isDup && (
                            <button
                              onClick={() => handleClearDuplicate(resume.id)}
                              title="Manually clear this duplicate flag"
                              className="flex items-center gap-1.5 text-xs font-bold text-amber-700 hover:text-amber-900 transition-all duration-200 bg-amber-50 hover:bg-amber-100 border border-amber-200/60 px-2.5 py-1.5 rounded-lg"
                            >
                              <FlagOff className="size-3.5" />
                              Clear Flag
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Artistic View Modal */}
      {selectedResume && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          {/* Animated Backdrop */}
          <div 
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-300"
            onClick={() => setSelectedResume(null)}
          />
          
          {/* Modal Container */}
          <div className="relative bg-white/95 backdrop-blur-xl border border-white/20 rounded-2xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)] w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-[0.98] slide-in-from-bottom-4 duration-500 ease-out">
            
            {/* Header - Glassmorphic Gradient */}
            <div className="relative flex items-center justify-between p-6 sm:px-8 sm:py-6 border-b border-slate-100 overflow-hidden bg-gradient-to-r from-slate-50/80 to-white/80">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-orange-400 to-[#F55036]" />
              <div className="flex items-center gap-4 z-10">
                <div className="size-12 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/10 flex items-center justify-center shadow-inner">
                  <FileText className="size-6 text-primary" />
                </div>
                <div>
                  <h2 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight truncate max-w-[300px] sm:max-w-[500px]" title={selectedResume.file_name}>
                    {selectedResume.file_name}
                  </h2>
                  <p className="text-sm font-medium text-slate-500 flex items-center gap-1.5 mt-0.5">
                    <User className="size-3.5" /> 
                    Uploaded by <span className="text-slate-700">{selectedResume.first_name} {selectedResume.last_name}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedResume(null)}
                className="p-2.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100/80 rounded-full transition-all hover:rotate-90 z-10"
              >
                <X className="size-5" />
              </button>
            </div>
            
            {/* Scrollable Content Body */}
            <div className="flex-1 overflow-y-auto p-6 sm:p-8 bg-slate-50/30 custom-scrollbar">
              
              {/* Top Row: Metadata Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
                {[
                  { label: "File Type", value: selectedResume.file_type, icon: Database },
                  { label: "Parser Engine", value: selectedResume.parsed_metadata ? (typeof selectedResume.parsed_metadata === 'string' ? JSON.parse(selectedResume.parsed_metadata).parsedEngine : selectedResume.parsed_metadata.parsedEngine) : 'Unknown', icon: FileText },
                  { label: "File Size", value: `${selectedResume.parsed_metadata ? ((typeof selectedResume.parsed_metadata === 'string' ? JSON.parse(selectedResume.parsed_metadata).fileSize : selectedResume.parsed_metadata.fileSize) / 1024 / 1024).toFixed(2) : '0'} MB`, icon: AlertCircle },
                  { label: "Upload Date", value: new Date(selectedResume.created_at).toLocaleDateString(), icon: Calendar }
                ].map((stat, idx) => (
                  <div key={idx} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow group animate-in slide-in-from-bottom-4 fade-in duration-500" style={{ animationDelay: `${idx * 100}ms` }}>
                    <div className="flex items-center gap-2 mb-2 text-slate-400 group-hover:text-primary transition-colors">
                      <stat.icon className="size-4" />
                      <h3 className="text-xs font-bold uppercase tracking-wider">{stat.label}</h3>
                    </div>
                    <p className="text-sm font-semibold text-slate-800 truncate" title={stat.value}>{stat.value}</p>
                  </div>
                ))}
              </div>
              
              {/* AI Summary Section (Glowing artistic design) */}
              <div className="relative bg-white rounded-2xl border border-[#F55036]/20 shadow-[0_8px_30px_rgb(245,80,54,0.06)] overflow-hidden flex flex-col mb-8 animate-in slide-in-from-bottom-6 fade-in duration-700 delay-200">
                {/* Subtle gradient background effect */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-[#F55036]/10 to-transparent blur-3xl rounded-full pointer-events-none" />
                
                <div className="relative px-5 py-4 border-b border-slate-100 flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-white/50 backdrop-blur-sm">
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2 flex-shrink-0">
                    <div className="size-8 rounded-lg bg-gradient-to-br from-[#F55036] to-orange-400 flex items-center justify-center shadow-md">
                      <Sparkles className="size-4 text-white" />
                    </div>
                    Groq AI Intelligence
                  </h3>
                  
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full xl:w-auto justify-end">
                    <div className="flex flex-wrap items-center gap-2">
                      {availableFields.map(f => (
                        <label key={f} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold cursor-pointer transition-all duration-200 ${selectedFields.includes(f) ? 'bg-[#F55036]/10 border-[#F55036]/30 text-[#F55036] shadow-inner shadow-[#F55036]/5' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:border-slate-300'}`}>
                          <input 
                            type="checkbox" 
                            className="sr-only"
                            checked={selectedFields.includes(f)}
                            onChange={() => toggleField(f)}
                            disabled={f === "experience"}
                          />
                          {selectedFields.includes(f) && <div className="size-1.5 bg-[#F55036] rounded-full animate-in zoom-in" />}
                          <span className="capitalize tracking-wide">{f}</span>
                        </label>
                      ))}
                    </div>
                    <button
                      onClick={() => handleSummarize(selectedResume.id)}
                      disabled={isSummarizing}
                      className="group relative flex items-center justify-center gap-2 text-xs font-bold bg-gradient-to-r from-[#F55036] to-orange-500 hover:to-[#F55036] text-white px-5 py-2.5 rounded-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-[0_0_20px_rgba(245,80,54,0.4)] hover:-translate-y-0.5 flex-shrink-0 w-full sm:w-auto overflow-hidden"
                    >
                      <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />
                      {isSummarizing ? <Loader2 className="size-4 animate-spin relative z-10" /> : <Sparkles className="size-4 relative z-10" />}
                      <span className="relative z-10 uppercase tracking-wider">
                        {isSummarizing ? "Analyzing..." : selectedResume.summarised ? "Update AI Summary" : "Generate AI Summary"}
                      </span>
                    </button>
                  </div>
                </div>
                
                <div className="relative p-6 sm:p-8 bg-white/80 backdrop-blur-md">
                  {(() => {
                    const summary = selectedResume.summarised ? (typeof selectedResume.summarised === 'string' ? JSON.parse(selectedResume.summarised) : selectedResume.summarised) : null;
                    if (summary && Object.keys(summary).length > 0) {
                      return (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 animate-in fade-in duration-500">
                          {Object.entries(summary).map(([key, value], idx) => (
                            <div key={key} className={`${Array.isArray(value) || (typeof value === 'string' && value.length > 80) ? 'col-span-1 md:col-span-2' : 'col-span-1'} bg-slate-50/50 rounded-xl p-5 border border-slate-100 hover:border-slate-200 transition-colors`}>
                              <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-[#F55036]/60" />
                                {key.replace(/([A-Z])/g, ' $1').trim()}
                              </h4>
                              {renderSummaryValue(value)}
                            </div>
                          ))}
                        </div>
                      );
                    }
                    return (
                      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                        <div className="size-16 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mb-4">
                          <Sparkles className="size-8 text-slate-300" />
                        </div>
                        <h4 className="text-lg font-bold text-slate-700 mb-2">No AI Insights Yet</h4>
                        <p className="text-sm text-slate-500 max-w-sm">Select your desired fields above and click the generate button to unlock an intelligent Groq summary of this candidate's profile.</p>
                      </div>
                    );
                  })()}
                </div>
              </div>
              
              {/* Raw Extracted Text Section */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col animate-in slide-in-from-bottom-8 fade-in duration-700 delay-300">
                <div className="px-5 py-4 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <FileText className="size-4 text-slate-400" />
                    Raw Extracted Document Text
                  </h3>
                </div>
                <div className="p-1 bg-slate-100/50">
                  <pre className="text-[13px] text-slate-600 whitespace-pre-wrap font-mono leading-relaxed h-[250px] overflow-y-auto p-5 custom-scrollbar bg-white rounded-xl shadow-inner mx-1 mb-1 border border-slate-100">
                    {selectedResume.extracted_text || "No text could be extracted from this document."}
                  </pre>
                </div>
              </div>
            </div>
            
            {/* Footer */}
            <div className="p-4 sm:p-6 border-t border-slate-100 bg-slate-50/50 flex justify-end">
              <button
                onClick={() => setSelectedResume(null)}
                className="px-6 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 text-slate-700 text-sm font-bold rounded-xl transition-all shadow-sm hover:shadow active:scale-95"
              >
                Close View
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
