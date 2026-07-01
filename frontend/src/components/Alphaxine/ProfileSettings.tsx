import React, { useState, useEffect } from "react";
import { UserCircle, Shield, Save, Key, Mail } from "lucide-react";
import { cn } from "@/lib/utils";

export function ProfileSettings() {
  const [activeTab, setActiveTab] = useState<"general" | "security">("general");
  
  const [profileData, setProfileData] = useState({
    first_name: "",
    last_name: "",
    phone: "",
    gender: "",
    date_of_birth: "",
    company: "",
    email: "",
    role: ""
  });
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState({ text: "", type: "" });
  
  // Security Tab State
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isSecLoading, setIsSecLoading] = useState(false);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/profile", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setProfileData({
          first_name: data.first_name || "",
          last_name: data.last_name || "",
          phone: data.phone || "",
          gender: data.gender || "",
          date_of_birth: data.date_of_birth ? data.date_of_birth.split('T')[0] : "",
          company: data.company || "",
          email: data.email || "",
          role: data.role || ""
        });
      }
    } catch (error) {
      console.error("Failed to fetch profile", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setMessage({ text: "", type: "" });
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(profileData)
      });
      if (res.ok) {
        setMessage({ text: "Profile updated successfully!", type: "success" });
      } else {
        const err = await res.json();
        setMessage({ text: err.error || "Failed to update profile", type: "error" });
      }
    } catch (error) {
      setMessage({ text: "An error occurred", type: "error" });
    } finally {
      setIsSaving(false);
    }
  };

  const requestOTP = async () => {
    setIsSecLoading(true);
    setMessage({ text: "", type: "" });
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/profile/change-password-otp", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setOtpSent(true);
        setMessage({ text: "OTP sent to your email address.", type: "success" });
      } else {
        const err = await res.json();
        setMessage({ text: err.error || "Failed to send OTP", type: "error" });
      }
    } catch (error) {
      setMessage({ text: "An error occurred", type: "error" });
    } finally {
      setIsSecLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSecLoading(true);
    setMessage({ text: "", type: "" });
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/profile/change-password-verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ otp, newPassword })
      });
      if (res.ok) {
        setMessage({ text: "Password changed successfully!", type: "success" });
        setOtpSent(false);
        setOtp("");
        setNewPassword("");
      } else {
        const err = await res.json();
        setMessage({ text: err.error || "Failed to change password", type: "error" });
      }
    } catch (error) {
      setMessage({ text: "An error occurred", type: "error" });
    } finally {
      setIsSecLoading(false);
    }
  };

  if (isLoading) return <div className="p-8 text-center text-slate-500">Loading profile...</div>;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8 flex items-center gap-3">
        <div className="p-3 bg-red-100 text-red-600 rounded-xl">
          <UserCircle className="w-8 h-8" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Profile Settings</h1>
          <p className="text-slate-500">Manage your personal information and security preferences.</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b border-slate-200">
          <button
            onClick={() => { setActiveTab("general"); setMessage({text:"", type:""}); }}
            className={cn(
              "flex-1 py-4 px-6 text-sm font-medium transition-colors flex items-center justify-center gap-2",
              activeTab === "general" ? "bg-red-50 text-red-700 border-b-2 border-red-600" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            )}
          >
            <UserCircle className="w-5 h-5" /> General Info
          </button>
          <button
            onClick={() => { setActiveTab("security"); setMessage({text:"", type:""}); }}
            className={cn(
              "flex-1 py-4 px-6 text-sm font-medium transition-colors flex items-center justify-center gap-2",
              activeTab === "security" ? "bg-red-50 text-red-700 border-b-2 border-red-600" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            )}
          >
            <Shield className="w-5 h-5" /> Security
          </button>
        </div>

        <div className="p-8">
          {message.text && (
            <div className={cn("mb-6 p-4 rounded-lg text-sm font-medium", message.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200")}>
              {message.text}
            </div>
          )}

          {activeTab === "general" && (
            <form onSubmit={handleProfileUpdate} className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">First Name</label>
                  <input
                    type="text"
                    value={profileData.first_name}
                    onChange={(e) => setProfileData({...profileData, first_name: e.target.value})}
                    className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-all"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Last Name</label>
                  <input
                    type="text"
                    value={profileData.last_name}
                    onChange={(e) => setProfileData({...profileData, last_name: e.target.value})}
                    className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-all"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Email (Read Only)</label>
                  <input
                    type="email"
                    value={profileData.email}
                    disabled
                    className="w-full px-4 py-2 bg-slate-100 text-slate-500 border border-slate-200 rounded-xl cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Phone</label>
                  <input
                    type="text"
                    value={profileData.phone}
                    onChange={(e) => setProfileData({...profileData, phone: e.target.value})}
                    className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Date of Birth</label>
                  <input
                    type="date"
                    value={profileData.date_of_birth}
                    onChange={(e) => setProfileData({...profileData, date_of_birth: e.target.value})}
                    className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Gender</label>
                  <select
                    value={profileData.gender}
                    onChange={(e) => setProfileData({...profileData, gender: e.target.value})}
                    className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-all"
                  >
                    <option value="">Select Gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="non_binary">Non-binary</option>
                    <option value="prefer_not_to_say">Prefer not to say</option>
                  </select>
                </div>
              </div>
              <div className="pt-4 flex justify-end">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex items-center gap-2 px-6 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors shadow-sm disabled:opacity-70"
                >
                  <Save className="w-5 h-5" />
                  {isSaving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          )}

          {activeTab === "security" && (
            <div className="space-y-6">
              {!otpSent ? (
                <div className="text-center py-10 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="mx-auto w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-4">
                    <Key className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">Change Password</h3>
                  <p className="text-slate-500 max-w-md mx-auto mb-6">
                    To change your password, we'll send a secure One-Time Password (OTP) to your registered email address.
                  </p>
                  <button
                    onClick={requestOTP}
                    disabled={isSecLoading}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-slate-900 text-white font-medium rounded-xl hover:bg-slate-800 transition-all shadow-md disabled:opacity-70"
                  >
                    <Mail className="w-5 h-5" />
                    {isSecLoading ? "Sending OTP..." : "Send OTP to Email"}
                  </button>
                </div>
              ) : (
                <form onSubmit={handleChangePassword} className="max-w-md mx-auto py-4 space-y-5">
                  <div className="text-center mb-6">
                    <div className="inline-block p-3 bg-green-100 text-green-600 rounded-full mb-3">
                      <Mail className="w-6 h-6" />
                    </div>
                    <h3 className="font-bold text-lg">Check your email</h3>
                    <p className="text-sm text-slate-500">We've sent a 6-digit code to {profileData.email}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Enter OTP</label>
                    <input
                      type="text"
                      placeholder="123456"
                      maxLength={6}
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      className="w-full px-4 py-3 text-center text-2xl tracking-widest border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-all"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">New Password</label>
                    <input
                      type="password"
                      placeholder="••••••••"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-all"
                      required
                      minLength={6}
                    />
                  </div>
                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={isSecLoading}
                      className="w-full py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors shadow-sm disabled:opacity-70"
                    >
                      {isSecLoading ? "Updating Password..." : "Update Password"}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setOtpSent(false); setOtp(""); setNewPassword(""); setMessage({text:"", type:""}) }}
                      className="w-full mt-3 py-3 text-slate-500 font-medium hover:bg-slate-100 rounded-xl transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
