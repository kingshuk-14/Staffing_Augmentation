import React, { useEffect, useState } from "react";
import { Building2, Plus, AlertCircle, Loader2, Mail, Phone, MapPin, User, Trash2, Edit3 } from "lucide-react";

export function ClientsManager() {
  const [clients, setClients] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingClient, setEditingClient] = useState<any | null>(null);

  // Form State
  const [companyName, setCompanyName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  const fetchClients = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch("/api/clients", {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (!response.ok) throw new Error("Failed to fetch clients list");
      const data = await response.json();
      setClients(data);
    } catch (err) {
      console.error(err);
      setError("Failed to load clients.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, []);

  const openAddForm = () => {
    setEditingClient(null);
    setCompanyName("");
    setContactPerson("");
    setEmail("");
    setPhone("");
    setAddress("");
    setError("");
    setShowForm(true);
  };

  const openEditForm = (client: any) => {
    setEditingClient(client);
    setCompanyName(client.company_name);
    setContactPerson(client.contact_person || "");
    setEmail(client.email || "");
    setPhone(client.phone || "");
    setAddress(client.address || "");
    setError("");
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError("");

    try {
      const token = localStorage.getItem("token");
      const url = editingClient
        ? `/api/clients/${editingClient.id}`
        : "/api/clients";
      const method = editingClient ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          company_name: companyName,
          contact_person: contactPerson,
          email,
          phone,
          address
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Failed to save client details");
      }

      await fetchClients();
      setShowForm(false);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to save client details.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("Are you sure you want to delete this client? Job descriptions associated with this client will be unlinked.")) return;
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`/api/clients/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (!response.ok) throw new Error("Failed to delete client");
      await fetchClients();
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Failed to delete client.");
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-200/80 pb-6 gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Clients Manager</h1>
          <p className="text-slate-500 mt-1 text-sm">Register corporate client accounts, manage focal points, and allocate staffing requirements.</p>
        </div>
        <button
          onClick={openAddForm}
          className="flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#F55036] to-[#c9381f] text-white rounded-xl hover:shadow-lg hover:shadow-orange-600/20 active:scale-95 transition-all duration-200 font-bold text-sm shrink-0"
        >
          <Plus className="size-4" />
          Add Corporate Client
        </button>
      </div>

      {error && !showForm && (
        <div className="bg-red-50 text-red-700 p-4 rounded-xl flex items-center gap-3 border border-red-100/80 shadow-sm">
          <AlertCircle className="size-5 shrink-0 text-red-500" />
          <p className="text-sm font-semibold">{error}</p>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-lg space-y-6 relative overflow-hidden max-w-2xl">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#F55036] to-[#c9381f]" />
          
          <div className="flex items-center gap-2.5 text-lg font-bold text-slate-800 pb-2 border-b border-slate-100">
            <Building2 className="size-5 text-[#F55036]" />
            <h3>{editingClient ? "Edit Client Details" : "Register Corporate Client"}</h3>
          </div>

          {error && (
            <div className="bg-red-50 text-red-700 p-4 rounded-xl flex items-center gap-3 border border-red-100/80">
              <AlertCircle className="size-5 shrink-0 text-red-500" />
              <p className="text-sm font-semibold">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Company Name</label>
              <input
                type="text"
                placeholder="e.g. Acme Corporation"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#F55036] focus:border-transparent transition-all duration-200 placeholder-slate-400"
                required
              />
            </div>
            
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Contact Person</label>
              <input
                type="text"
                placeholder="e.g. John Doe"
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#F55036] focus:border-transparent transition-all duration-200 placeholder-slate-400"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Contact Email</label>
              <input
                type="email"
                placeholder="e.g. contacts@acme.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#F55036] focus:border-transparent transition-all duration-200 placeholder-slate-400"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Phone Number</label>
              <input
                type="text"
                placeholder="e.g. +91 98765 43210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#F55036] focus:border-transparent transition-all duration-200 placeholder-slate-400"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Physical Address</label>
            <textarea
              placeholder="e.g. Tech Park, Block C, Bangalore, India"
              rows={3}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#F55036] focus:border-transparent transition-all duration-200 placeholder-slate-400 resize-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition text-sm font-bold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#F55036] to-[#c9381f] text-white rounded-xl hover:shadow-lg hover:shadow-orange-600/25 active:scale-95 transition-all duration-200 text-sm font-bold disabled:opacity-50"
            >
              {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
              {editingClient ? "Save Changes" : "Register Client"}
            </button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="flex flex-col items-center justify-center p-20 text-slate-400 gap-3 bg-white rounded-2xl border border-slate-150 shadow-sm">
          <Loader2 className="size-8 animate-spin text-[#F55036]" />
          <span className="text-sm font-semibold tracking-wide">Loading client profiles...</span>
        </div>
      ) : clients.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center text-slate-500 shadow-sm space-y-4">
          <div className="size-16 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300 border border-slate-100 mx-auto">
            <Building2 className="size-8" />
          </div>
          <div>
            <h3 className="font-bold text-slate-800 text-lg">No Clients Registered</h3>
            <p className="text-sm text-slate-400 mt-1 max-w-sm mx-auto">
              Get started by registering corporate clients. Job descriptions can then be mapped directly to specific clients.
            </p>
          </div>
          <button
            onClick={openAddForm}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#F55036] to-[#c9381f] text-white rounded-xl hover:shadow-lg transition font-bold text-sm"
          >
            <Plus className="size-4" />
            Register First Client
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {clients.map((client) => (
            <div
              key={client.id}
              className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="size-10 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-[#F55036] shrink-0 shadow-sm">
                      <Building2 className="size-5" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-900 leading-tight">{client.company_name}</h3>
                      {client.contact_person && (
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mt-0.5 flex items-center gap-1">
                          <User className="size-3 text-slate-400" />
                          {client.contact_person}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEditForm(client)}
                      className="p-2 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition"
                      title="Edit Client"
                    >
                      <Edit3 className="size-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(client.id)}
                      className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition"
                      title="Delete Client"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>

                <div className="space-y-2.5 pt-2 border-t border-slate-100 text-sm text-slate-500">
                  {client.email && (
                    <div className="flex items-center gap-2.5">
                      <Mail className="size-4 text-slate-400 shrink-0" />
                      <span className="font-medium text-slate-700">{client.email}</span>
                    </div>
                  )}
                  {client.phone && (
                    <div className="flex items-center gap-2.5">
                      <Phone className="size-4 text-slate-400 shrink-0" />
                      <span className="font-medium text-slate-700">{client.phone}</span>
                    </div>
                  )}
                  {client.address && (
                    <div className="flex items-start gap-2.5">
                      <MapPin className="size-4 text-slate-400 shrink-0 mt-0.5" />
                      <span className="text-xs leading-relaxed text-slate-600">{client.address}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
