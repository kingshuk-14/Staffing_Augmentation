import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Upload, FileText, CheckCircle, AlertCircle, Loader2, IndianRupee } from "lucide-react";

export function VendorSubmit() {
  const [searchParams] = useSearchParams();
  const jobId = searchParams.get("jobId");
  const vendorId = searchParams.get("vendorId");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [expectedSalary, setExpectedSalary] = useState("");
  const [file, setFile] = useState<File | null>(null);
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  if (!jobId || !vendorId) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white p-6 rounded-xl border border-red-200 shadow-sm max-w-md text-center space-y-3">
          <AlertCircle className="size-12 text-red-500 mx-auto" />
          <h2 className="text-lg font-bold text-slate-800">Invalid Link</h2>
          <p className="text-sm text-slate-500">This submission link is invalid or expired. Please check the email request sent by the Alphaxine recruitment team.</p>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError("Please attach the candidate's resume file.");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("jobId", jobId);
      formData.append("vendorId", vendorId);
      formData.append("resume", file);
      if (name) formData.append("name", name);
      if (email) formData.append("email", email);
      if (phone) formData.append("phone", phone);
      if (expectedSalary) formData.append("expectedSalary", expectedSalary);

      const response = await fetch("http://localhost:5000/api/vendors/submit-resume", {
        method: "POST",
        body: formData
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Failed to submit candidate");
      }

      setSuccess(true);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An error occurred while uploading. Please check files and try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white max-w-lg w-full rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Banner */}
        <div className="bg-slate-900 text-white p-6 text-center space-y-2">
          <h1 className="text-xl font-bold">Staffing Partner Submission Portal</h1>
          <p className="text-xs text-slate-400">Alphaxine Recruitment Operations Network</p>
        </div>

        <div className="p-6">
          {success ? (
            <div className="text-center py-8 space-y-4">
              <CheckCircle className="size-16 text-green-500 mx-auto animate-bounce" />
              <h2 className="text-xl font-bold text-slate-800">Resume Submitted Successfully!</h2>
              <p className="text-sm text-slate-500 max-w-sm mx-auto">
                Candidate file has been ingested and mapped against the requested job description requirements. Thank you for your submission.
              </p>
              <button
                onClick={() => {
                  setName("");
                  setEmail("");
                  setPhone("");
                  setExpectedSalary("");
                  setFile(null);
                  setSuccess(false);
                }}
                className="mt-4 px-4 py-2 border border-slate-200 text-slate-700 text-sm font-semibold rounded hover:bg-slate-50 transition"
              >
                Submit Another Resume
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-xs text-slate-500 text-center leading-relaxed">
                Please attach the candidate resume (PDF or DOCX). Optional metadata provided below will serve as fallbacks if parsing extraction is incomplete.
              </p>

              {error && (
                <div className="bg-red-50 text-red-600 p-3 rounded-lg flex items-center gap-2 border border-red-100 text-xs">
                  <AlertCircle className="size-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Form Inputs */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Candidate Name</label>
                  <input
                    type="text"
                    placeholder="Optional fallback"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Candidate Email</label>
                  <input
                    type="email"
                    placeholder="Optional fallback"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Candidate Phone</label>
                  <input
                    type="text"
                    placeholder="Optional fallback"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Expected Salary (INR Annual)</label>
                  <div className="relative">
                    <IndianRupee className="size-3.5 text-slate-400 absolute left-2 top-2.5" />
                    <input
                      type="number"
                      placeholder="e.g. 1200000"
                      value={expectedSalary}
                      onChange={(e) => setExpectedSalary(e.target.value)}
                      className="w-full pl-7 pr-3 py-2 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* File Attachment */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Resume Document File</label>
                <div className="border border-dashed border-slate-300 rounded-lg p-6 bg-slate-50 text-center relative hover:bg-slate-100/50 transition cursor-pointer">
                  <input
                    type="file"
                    accept=".pdf,.docx,.txt"
                    onChange={(e) => e.target.files && setFile(e.target.files[0])}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    required
                  />
                  <Upload className="size-8 text-slate-400 mx-auto mb-1.5" />
                  <span className="text-xs font-semibold text-slate-700 block">
                    {file ? file.name : "Attach Candidate PDF or Word Document"}
                  </span>
                  <span className="text-[10px] text-slate-400 mt-0.5">Supports PDF or DOCX (max 10MB)</span>
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded font-semibold text-sm transition disabled:opacity-50"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Uploading & Parsing Candidate...
                    </>
                  ) : (
                    "Submit Resume & Score Candidate"
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
