import React, { useEffect, useState } from "react";
import { Users, Plus, Award, AlertCircle, Loader2, Mail, Percent, Zap, TrendingUp, Trash2 } from "lucide-react";

export function VendorsManager() {
  const [vendors, setVendors] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  // Filter State
  const [selectedSpec, setSelectedSpec] = useState("All");

  // Form State
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [specializations, setSpecializations] = useState("");

  const fetchVendors = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch("http://localhost:5000/api/vendors", {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (!response.ok) throw new Error("Failed to fetch vendors list");
      const data = await response.json();
      setVendors(data);
    } catch (err) {
      console.error(err);
      setError("Failed to load vendors.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchVendors();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError("");

    try {
      const token = localStorage.getItem("token");
      const specArray = specializations
        .split(",")
        .map(s => s.trim())
        .filter(s => s.length > 0);

      const response = await fetch("http://localhost:5000/api/vendors", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ name, email, specializations: specArray })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Failed to create vendor");
      }

      await fetchVendors();
      
      // Reset form
      setName("");
      setEmail("");
      setSpecializations("");
      setShowAddForm(false);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to create vendor profile.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteVendor = async (id: number) => {
    if (!window.confirm("Are you sure you want to delete this vendor? This will remove the vendor and all their submissions.")) return;
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`http://localhost:5000/api/vendors/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (!response.ok) throw new Error("Failed to delete vendor");
      await fetchVendors();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to delete vendor.");
    }
  };

  const allSpecs = Array.from(new Set(vendors.flatMap(v => v.specializations || []))).sort();
  const filteredVendors = selectedSpec === "All"
    ? vendors
    : vendors.filter(v => v.specializations?.includes(selectedSpec));

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Vendors & Recruitment Partners</h1>
          <p className="text-slate-500 mt-1">Manage staffing agencies, monitor candidate quality metrics, and review performance ranks.</p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/95 transition font-medium text-sm shadow-sm"
        >
          <Plus className="size-4" />
          Register New Vendor
        </button>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg flex items-center gap-3 border border-red-100">
          <AlertCircle className="size-5 shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {showAddForm && (
        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4 max-w-xl">
          <h3 className="text-lg font-bold text-slate-900">Register Staffing Agency</h3>
          
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 uppercase">Agency Name</label>
              <input
                type="text"
                placeholder="e.g. Apex Recruitment Partners"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>
            
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 uppercase">Contact Email</label>
              <input
                type="email"
                placeholder="e.g. candidates@apexrecruits.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 uppercase">Specialization focus (comma separated)</label>
              <input
                type="text"
                placeholder="e.g. React, Node.js, Frontend, DevOps"
                value={specializations}
                onChange={(e) => setSpecializations(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 text-sm font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-5 py-2 bg-primary text-white rounded-lg hover:bg-primary/95 transition text-sm font-medium shadow-sm disabled:opacity-50"
            >
              {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
              Register Vendor
            </button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center p-12 text-slate-500 gap-2">
          <Loader2 className="size-6 animate-spin text-primary" />
          <span>Loading vendors...</span>
        </div>
      ) : vendors.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-500 shadow-sm">
          <Users className="size-12 text-slate-300 mx-auto mb-3" />
          <h3 className="font-semibold text-slate-800 text-lg">No Vendors Registered</h3>
          <p className="text-sm mt-1 max-w-md mx-auto">Add your partner staffing agencies. When outreach demands are triggered, the system ranks them by overall submission speed and score.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="text-sm font-semibold text-slate-700">
              Showing <span className="text-primary">{filteredVendors.length}</span> of {vendors.length} partner agencies
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Filter Specialty:</span>
              <select
                value={selectedSpec}
                onChange={(e) => setSelectedSpec(e.target.value)}
                className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer text-slate-700 hover:border-slate-300 transition"
              >
                <option value="All">All Specialties</option>
                {allSpecs.map(spec => (
                  <option key={spec} value={spec}>{spec}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                <th className="p-4 pl-6">Vendor / Contacts</th>
                <th className="p-4">Specialties</th>
                <th className="p-4 text-center">Requests Sent</th>
                <th className="p-4 text-center">Resumes Sent</th>
                <th className="p-4 text-center">Hired</th>
                <th className="p-4 text-right">Performance Rank</th>
                <th className="p-4 pr-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
              {filteredVendors.map((vendor) => (
                <tr key={vendor.id} className="hover:bg-slate-50/50 transition">
                  <td className="p-4 pl-6">
                    <div className="font-bold text-slate-900">{vendor.name}</div>
                    <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                      <Mail className="size-3.5" />
                      {vendor.email}
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex flex-wrap gap-1">
                      {vendor.specializations && vendor.specializations.length > 0 ? (
                        vendor.specializations.map((spec: string, index: number) => (
                          <span key={index} className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs font-medium border border-slate-200">
                            {spec}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-slate-400 italic">General</span>
                      )}
                    </div>
                  </td>
                  <td className="p-4 text-center font-semibold text-slate-600">{vendor.total_outreach}</td>
                  <td className="p-4 text-center font-semibold text-slate-600">{vendor.total_submissions}</td>
                  <td className="p-4 text-center font-semibold text-green-600">{vendor.total_hires}</td>
                  <td className="p-4 text-right">
                    <span className={`inline-flex items-center gap-1 font-bold px-2 py-1 rounded text-xs ${
                      vendor.overall_score >= 80 ? "bg-green-50 text-green-700 border border-green-200" :
                      vendor.overall_score >= 60 ? "bg-amber-50 text-amber-700 border border-amber-200" :
                      "bg-slate-100 text-slate-700 border border-slate-200"
                    }`}>
                      <Award className="size-3.5 shrink-0" />
                      {Math.round(vendor.overall_score)}% Rank
                    </span>
                  </td>
                  <td className="p-4 pr-6 text-right">
                    <button
                      onClick={() => handleDeleteVendor(vendor.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-650 hover:bg-red-50 transition-all duration-200 inline-flex items-center justify-center animate-fade-in"
                      title="Delete Vendor"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}
    </div>
  );
}
