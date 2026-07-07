import React, { useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { Home, Upload, FileText, LogOut, Briefcase, Users, UserCheck, Building2, Loader2, Settings, Mail, X, MessageSquare, Sparkles, Send, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function SidebarLayout() {
  const location = useLocation();

  // Retrieve signed in user information
  const userStr = localStorage.getItem("user");
  const user = userStr ? JSON.parse(userStr) : null;
  const userName = user ? `${user.first_name} ${user.last_name}` : "System Admin";
  const userRole = user ? user.role : "recruiter";



  const navItems = [
    { name: "Dashboard", href: "/alphaxine", icon: Home },
    { name: "Mail Integration", href: "/alphaxine/mail-integration", icon: Mail },
    { name: "Jobs Directory", href: "/alphaxine/jobs", icon: Briefcase },
    { name: "Clients Directory", href: "/alphaxine/clients", icon: Building2 },
    { name: "Candidates Manager", href: "/alphaxine/candidates", icon: UserCheck },
    { name: "Parsed Resumes", href: "/alphaxine/resumes", icon: FileText },
    { name: "Vendors Manager", href: "/alphaxine/vendors", icon: Users },
    { name: "Resume Upload", href: "/alphaxine/upload", icon: Upload },
  ];

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Sidebar - Hover Collapsible design */}
      <aside className="w-[72px] hover:w-64 bg-gradient-to-b from-[#F55036] to-[#c9381f] flex flex-col shadow-xl transition-all duration-300 ease-in-out group/sidebar overflow-hidden shrink-0 z-20">
        <div className="h-20 flex items-center px-4 border-b border-white/15 overflow-hidden">
          <div className="flex items-center gap-3 text-white min-w-0">
            <div className="size-10 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center overflow-hidden border border-white/10 shrink-0">
              <img src="/alphaxine_logo.png" alt="Alphaxine Logo" className="w-full h-full object-contain" />
            </div>
            <div className="flex flex-col min-w-0 opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-300 ease-in-out">
              <span className="text-sm font-bold truncate leading-tight">{userName}</span>
              <span className="text-[10px] text-white/60 font-semibold uppercase tracking-wider mt-0.5">{userRole}</span>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3.5 py-5 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 overflow-hidden",
                  isActive
                    ? "bg-white/20 text-white shadow-sm backdrop-blur-sm"
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                )}
              >
                <item.icon className={cn("size-5 shrink-0", isActive ? "text-white" : "text-white/60")} />
                <span className="opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-300 ease-in-out truncate font-semibold">
                  {item.name}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="p-3.5 border-t border-white/15 overflow-hidden flex flex-col space-y-1">
          <Link
            to="/alphaxine/profile"
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 overflow-hidden",
              location.pathname === "/alphaxine/profile"
                ? "bg-white/20 text-white shadow-sm backdrop-blur-sm"
                : "text-white/70 hover:bg-white/10 hover:text-white"
            )}
          >
            <Settings className={cn("size-5 shrink-0", location.pathname === "/alphaxine/profile" ? "text-white" : "text-white/60")} />
            <span className="opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-300 ease-in-out truncate font-semibold">
              Profile Settings
            </span>
          </Link>
          <Link
            to="/"
            onClick={() => {
              localStorage.removeItem("token");
              localStorage.removeItem("user");
            }}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white transition-all duration-200"
          >
            <LogOut className="size-5 text-white/50 shrink-0" />
            <span className="opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-300 ease-in-out truncate font-semibold">
              Log out
            </span>
          </Link>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-8">
          <Outlet />
        </div>
      </main>

      {/* Floating Draggable AI Assistant Chatbot */}
      <AIAssistantChatbot />
    </div>
  );
}

const isJdLikeText = (text: string): boolean => {
  if (!text) return false;
  const lower = text.toLowerCase();
  return (
    lower.includes("responsibilities") ||
    lower.includes("requirements") ||
    lower.includes("job description") ||
    lower.includes("skills required") ||
    lower.includes("preferred skills") ||
    text.trim().startsWith("#")
  );
};

function AIAssistantChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Mode: "QA" or "PSEUDO"
  const [mode, setMode] = useState<"QA" | "PSEUDO">("QA");
  const [isLoading, setIsLoading] = useState(false);
  const [chatInputText, setChatInputText] = useState("");
  const [clients, setClients] = useState<any[]>([]);

  // Q&A Conversation State
  const [qaMessages, setQaMessages] = useState<any[]>([
    { sender: "bot", text: "Welcome to the **Alphaxine Staffing Bot**! I can answer general recruiting/staffing questions or analyze any screen you are on (click **Analyze Screen** below)." }
  ]);

  // Pseudo JD Form & Chatbot State
  const [pseudoStep, setPseudoStep] = useState(0); // 0: primary skill, 1: experience, 2: optional fields, 3: loading
  const [pseudoMessages, setPseudoMessages] = useState<any[]>([
    { sender: "bot", text: "Welcome to the **Alphaxine Staffing Bot**! To generate a Pseudo Job Description, what is the **Primary Skill** required? (e.g. SAP PP/QM, React Developer)" }
  ]);
  const [pseudoPrimarySkill, setPseudoPrimarySkill] = useState("");
  const [pseudoExperience, setPseudoExperience] = useState("");
  const [pseudoSecondarySkills, setPseudoSecondarySkills] = useState("");
  const [pseudoLocation, setPseudoLocation] = useState("");
  const [pseudoIndustry, setPseudoIndustry] = useState("");
  const [pseudoClientName, setPseudoClientName] = useState("");
  const [pseudoEmploymentType, setPseudoEmploymentType] = useState("");
  const [pseudoAdditionalNotes, setPseudoAdditionalNotes] = useState("");
  const [pseudoClientId, setPseudoClientId] = useState("");

  useEffect(() => {
    setPosition({ x: window.innerWidth - 85, y: window.innerHeight - 85 });
    // Fetch clients list for the Pseudo JD dropdown
    const fetchClients = async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await fetch("/api/clients", {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setClients(data);
        }
      } catch (err) {
        console.error("Error fetching clients list:", err);
      }
    };
    fetchClients();

    // Adjust position on window resize
    const handleResize = () => {
      setPosition({ x: window.innerWidth - 85, y: window.innerHeight - 85 });
    };
    window.addEventListener('resize', handleResize);

    const handleOpenAssistant = (e: any) => {
      setIsOpen(true);
      if (e.detail?.mode) {
        setMode(e.detail.mode);
      }
    };
    window.addEventListener('open-ai-assistant', handleOpenAssistant);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('open-ai-assistant', handleOpenAssistant);
    };
  }, []);

  // Draggable physics
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    const currentX = position ? position.x : (window.innerWidth - 85);
    const currentY = position ? position.y : (window.innerHeight - 85);
    setDragOffset({
      x: e.clientX - currentX,
      y: e.clientY - currentY
    });
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    const newX = Math.max(10, Math.min(window.innerWidth - 70, e.clientX - dragOffset.x));
    const newY = Math.max(10, Math.min(window.innerHeight - 70, e.clientY - dragOffset.y));
    setPosition({ x: newX, y: newY });
  };

  const handleMouseUp = (e: MouseEvent) => {
    setIsDragging(false);
    const dist = Math.sqrt(Math.pow(e.clientX - dragStart.x, 2) + Math.pow(e.clientY - dragStart.y, 2));
    if (dist < 5) {
      setIsOpen(!isOpen);
    }
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  // Scrape text context from main area
  const getPageContext = () => {
    const mainEl = document.querySelector('main');
    if (!mainEl) return document.body.innerText.replace(/\s+/g, ' ').slice(0, 8000);
    return mainEl.innerText.replace(/\s+/g, ' ').slice(0, 8000);
  };

  // Submit Q&A query
  const handleQaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInputText.trim() || isLoading) return;

    const query = chatInputText.trim();
    setQaMessages(prev => [...prev, { sender: "user", text: query }]);
    setChatInputText("");
    setIsLoading(true);

    try {
      const pageContext = getPageContext();
      const token = localStorage.getItem("token");
      
      const res = await fetch("/api/jobs/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          message: query,
          chatHistory: qaMessages,
          pageContext: pageContext
        })
      });

      if (!res.ok) throw new Error("Failed to get chat response");
      const data = await res.json();
      const botText = typeof data.response === 'object' ? JSON.stringify(data.response, null, 2) : String(data.response || "");
      setQaMessages(prev => [...prev, { sender: "bot", text: botText }]);
    } catch (err: any) {
      console.error(err);
      setQaMessages(prev => [...prev, { sender: "bot", text: "❌ Error: Failed to contact AI assistant. Please try again." }]);
    } finally {
      setIsLoading(false);
    }
  };

  // Trigger quick context analysis
  const handleAnalyzePage = async () => {
    if (isLoading) return;
    setQaMessages(prev => [...prev, { sender: "user", text: "Analyze this active screen" }]);
    setIsLoading(true);

    try {
      const pageContext = getPageContext();
      const token = localStorage.getItem("token");

      const res = await fetch("/api/jobs/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          message: "Please give a quick summary and analysis of what is currently shown on my screen.",
          chatHistory: qaMessages,
          pageContext: pageContext
        })
      });

      if (!res.ok) throw new Error("Failed to analyze screen");
      const data = await res.json();
      const botText = typeof data.response === 'object' ? JSON.stringify(data.response, null, 2) : String(data.response || "");
      setQaMessages(prev => [...prev, { sender: "bot", text: botText }]);
    } catch (err: any) {
      console.error(err);
      setQaMessages(prev => [...prev, { sender: "bot", text: "❌ Error: Failed to analyze this page." }]);
    } finally {
      setIsLoading(false);
    }
  };

  // Submit Pseudo JD step
  const handlePseudoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInputText.trim()) return;

    const val = chatInputText.trim();
    setPseudoMessages(prev => [...prev, { sender: "user", text: val }]);
    setChatInputText("");

    if (pseudoStep === 0) {
      setPseudoPrimarySkill(val);
      setPseudoStep(1);
      setPseudoMessages(prev => [...prev, { sender: "bot", text: `Got it: "${val}". Next, how many years of experience are required? (e.g., 5+, 8)` }]);
    } else if (pseudoStep === 1) {
      setPseudoExperience(val);
      setPseudoStep(2);
      setPseudoMessages(prev => [
        ...prev,
        { sender: "bot", text: `Experience set to: "${val}".` },
        { sender: "bot", text: "Now, let's configure any optional details. Fill in the options below, then click generate." }
      ]);
    }
  };

  // Call Pseudo JD pipeline
  const handleGeneratePseudo = async () => {
    setIsLoading(true);
    setPseudoStep(3);
    setPseudoMessages(prev => [...prev, { sender: "bot", text: "Standardizing job role, retrieving history, aggregating parameters and inferring attributes..." }]);

    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/jobs/generate-pseudo", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          primarySkill: pseudoPrimarySkill,
          experience: pseudoExperience,
          secondarySkills: pseudoSecondarySkills ? pseudoSecondarySkills.split(',').map((s: string) => s.trim()) : [],
          location: pseudoLocation,
          industry: pseudoIndustry,
          clientName: pseudoClientName,
          employmentType: pseudoEmploymentType,
          additionalNotes: pseudoAdditionalNotes,
          clientId: pseudoClientId || null
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to generate Pseudo JD");
      }

      const data = await res.json();
      setPseudoMessages(prev => [...prev, { sender: "bot", text: "🎉 Success! The Pseudo JD was generated successfully and matching candidate profiles have been scored." }]);
      
      setTimeout(() => {
        setIsOpen(false);
        // Reset states
        setPseudoStep(0);
        setPseudoPrimarySkill("");
        setPseudoExperience("");
        setPseudoSecondarySkills("");
        setPseudoLocation("");
        setPseudoIndustry("");
        setPseudoClientName("");
        setPseudoEmploymentType("");
        setPseudoAdditionalNotes("");
        setPseudoClientId("");
        setPseudoMessages([
          { sender: "bot", text: "Welcome to the **Alphaxine Staffing Bot**! To generate a Pseudo Job Description, what is the **Primary Skill** required? (e.g. SAP PP/QM, React Developer)" }
        ]);
        setMode("QA");
        // Redirect to new job details
        window.location.href = `/alphaxine/jobs/${data.jobId}`;
      }, 1500);
    } catch (err: any) {
      console.error(err);
      setPseudoMessages(prev => [...prev, { sender: "bot", text: `❌ Error: ${err.message || "Failed to generate."}` }]);
      setPseudoStep(2);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddInferredJd = async (jd: { title: string; rawText: string }) => {
    setIsLoading(true);
    setQaMessages(prev => [...prev, { sender: "bot", text: "⚙ Ingesting Job Description and triggering candidate matching..." }]);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          title: jd.title,
          rawText: jd.rawText,
          clientId: null
        })
      });

      if (!res.ok) {
        throw new Error("Failed to save inferred job description");
      }

      const data = await res.json();
      setQaMessages(prev => [...prev, { sender: "bot", text: "🎉 Success! The Job Description has been ingested. Redirecting you to the matches page..." }]);
      
      setTimeout(() => {
        setIsOpen(false);
        window.location.href = `/alphaxine/jobs/${data.id || data.jobId}`;
      }, 1500);
    } catch (err: any) {
      console.error(err);
      setQaMessages(prev => [...prev, { sender: "bot", text: `❌ Error saving Job Description: ${err.message || "Unknown error"}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Draggable Chat Bubble Icon */}
      <div 
        onMouseDown={handleMouseDown}
        style={position && position.x > 0 && position.y > 0 ? { left: `${position.x}px`, top: `${position.y}px` } : { right: '24px', bottom: '24px' }}
        className={`fixed z-50 size-14 rounded-full flex items-center justify-center cursor-pointer text-white shadow-2xl transition-transform active:scale-95 ${
          isOpen ? 'bg-[#c9381f]' : 'bg-gradient-to-r from-[#8b5cf6] to-[#6d28d9]'
        }`}
        title="Alphaxine AI Assistant"
      >
        {isOpen ? <X className="size-6 pointer-events-none" /> : <MessageSquare className="size-6 pointer-events-none animate-bounce" />}
      </div>

      {/* Floating Chat Panel */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 w-96 h-[520px] bg-white rounded-2xl shadow-2xl border border-slate-200 z-40 overflow-hidden flex flex-col animate-scale-in">
          {/* Header */}
          <div className="bg-gradient-to-r from-[#8b5cf6] to-[#6d28d9] p-4 text-white flex items-center justify-between shadow-md shrink-0">
            <div className="flex items-center gap-2">
              <Sparkles className="size-5 animate-pulse" />
              <div>
                <h4 className="font-bold text-sm leading-tight">
                  {mode === "QA" ? "Alphaxine Staffing Bot" : "Pseudo JD Generator"}
                </h4>
                <span className="text-[10px] text-purple-100 font-semibold uppercase tracking-wider">INR Supported</span>
              </div>
            </div>
            {mode === "PSEUDO" && pseudoStep < 2 && (
              <button 
                onClick={() => {
                  setMode("QA");
                  setPseudoStep(0);
                  setPseudoPrimarySkill("");
                  setPseudoExperience("");
                  setPseudoSecondarySkills("");
                  setPseudoLocation("");
                  setPseudoIndustry("");
                  setPseudoClientName("");
                  setPseudoEmploymentType("");
                  setPseudoAdditionalNotes("");
                  setPseudoClientId("");
                  setPseudoMessages([
                    { sender: "bot", text: "Welcome to the **Alphaxine Staffing Bot**! To generate a Pseudo Job Description, what is the **Primary Skill** required? (e.g. SAP PP/QM, React Developer)" }
                  ]);
                }}
                className="px-2 py-1 bg-white/20 hover:bg-white/30 text-white rounded text-[10px] font-bold transition shrink-0"
              >
                Cancel
              </button>
            )}
          </div>

          {/* Quick Actions for QA Mode */}
          {mode === "QA" && qaMessages.length === 1 && (
            <div className="p-3 bg-slate-50 border-b border-slate-100 flex gap-2 shrink-0 overflow-x-auto whitespace-nowrap">
              <button 
                onClick={handleAnalyzePage}
                disabled={isLoading}
                className="px-3 py-1.5 bg-white border border-purple-100 rounded-xl text-xs font-bold text-purple-700 hover:bg-purple-50 transition shadow-sm flex-1 text-center"
              >
                🔍 Analyze Current Screen Context
              </button>
            </div>
          )}

          {/* Chat Stream Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-slate-50/50">
            {mode === "QA" ? (
              qaMessages.map((msg, index) => (
                <div key={index} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'} items-start gap-2`}>
                  {msg.sender === 'bot' && (
                    <div className="size-6 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center font-bold text-[10px] shrink-0 border border-purple-200">AI</div>
                  )}
                  <div className={`p-3 rounded-2xl text-xs shadow-sm max-w-[85%] border whitespace-pre-wrap leading-relaxed ${
                    msg.sender === 'user' 
                      ? 'bg-purple-600 text-white rounded-tr-none border-purple-500' 
                      : 'bg-white text-slate-800 rounded-tl-none border-slate-200/80'
                  }`}>
                    {msg.text}
                    {msg.sender === 'bot' && (msg.inferredJd || isJdLikeText(msg.text)) && (
                      <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex justify-end">
                        <button
                          onClick={() => handleAddInferredJd(msg.inferredJd || { title: "", rawText: msg.text })}
                          disabled={isLoading}
                          className="px-3 py-1.5 bg-gradient-to-r from-[#8b5cf6] to-[#6d28d9] hover:from-[#7c3aed] hover:to-[#5b21b6] text-white text-[10px] font-bold rounded-lg transition-all shadow-sm flex items-center gap-1 active:scale-95 disabled:opacity-50"
                        >
                          <svg className="size-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                          </svg>
                          Add as Job Description
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))
            ) : (
              // Pseudo JD Builder Chat
              <div className="space-y-3.5">
                {pseudoMessages.map((msg, index) => (
                  <div key={index} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'} items-start gap-2`}>
                    {msg.sender === 'bot' && (
                      <div className="size-6 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center font-bold text-[10px] shrink-0 border border-purple-200">AI</div>
                    )}
                    <div className={`p-3 rounded-2xl text-xs shadow-sm max-w-[85%] border whitespace-pre-wrap leading-relaxed ${
                      msg.sender === 'user' 
                        ? 'bg-purple-600 text-white rounded-tr-none border-purple-500' 
                        : 'bg-white text-slate-800 rounded-tl-none border-slate-200/80'
                    }`}>
                      {msg.text}
                    </div>
                  </div>
                ))}

                {pseudoStep === 2 && (
                  <div className="bg-white border border-purple-100 rounded-2xl p-4 shadow-md space-y-3 animate-scale-in relative overflow-hidden text-xs">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#8b5cf6] to-[#6d28d9]" />
                    <div className="grid grid-cols-1 gap-2.5">
                      <div>
                        <label className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider block mb-0.5">Secondary Skills</label>
                        <input 
                          type="text" 
                          placeholder="e.g. ABAP, MM (comma separated)"
                          value={pseudoSecondarySkills}
                          onChange={(e) => setPseudoSecondarySkills(e.target.value)}
                          className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider block mb-0.5">Location</label>
                        <input 
                          type="text" 
                          placeholder="e.g. Bangalore, India"
                          value={pseudoLocation}
                          onChange={(e) => setPseudoLocation(e.target.value)}
                          className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider block mb-0.5">Target Industry</label>
                        <input 
                          type="text" 
                          placeholder="e.g. Manufacturing, Retail"
                          value={pseudoIndustry}
                          onChange={(e) => setPseudoIndustry(e.target.value)}
                          className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider block mb-0.5">Client Name (Confidential)</label>
                        <input 
                          type="text" 
                          placeholder="e.g. Acme Corp"
                          value={pseudoClientName}
                          onChange={(e) => setPseudoClientName(e.target.value)}
                          className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider block mb-0.5">Employment Type</label>
                        <select 
                          value={pseudoEmploymentType}
                          onChange={(e) => setPseudoEmploymentType(e.target.value)}
                          className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs outline-none bg-white transition cursor-pointer"
                        >
                          <option value="">-- Select type (Optional) --</option>
                          <option value="Full-time">Full-time</option>
                          <option value="Contract">Contract</option>
                          <option value="Freelance">Freelance</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider block mb-0.5">Associate Corporate Client</label>
                        <select
                          value={pseudoClientId}
                          onChange={(e) => setPseudoClientId(e.target.value)}
                          className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs outline-none bg-white transition cursor-pointer"
                        >
                          <option value="">-- Select Client --</option>
                          {clients.map((client) => (
                            <option key={client.id} value={client.id}>
                              {client.company_name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider block mb-0.5">Notes</label>
                        <textarea
                          placeholder="Add extra constraints..."
                          rows={2}
                          value={pseudoAdditionalNotes}
                          onChange={(e) => setPseudoAdditionalNotes(e.target.value)}
                          className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition resize-none"
                        />
                      </div>
                    </div>

                    <button
                      onClick={handleGeneratePseudo}
                      disabled={isLoading}
                      className="w-full mt-3 py-2 bg-gradient-to-r from-[#8b5cf6] to-[#6d28d9] text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="size-3.5 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Sparkles className="size-3.5" />
                          Generate Pseudo JD & Match
                        </>
                      )}
                    </button>
                  </div>
                )}

                {pseudoStep === 3 && (
                  <div className="flex flex-col items-center justify-center p-6 bg-white border border-purple-100 rounded-2xl shadow-sm text-purple-600 gap-2.5 animate-pulse">
                    <Loader2 className="size-6 animate-spin text-[#8b5cf6]" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Building Jd reference...</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Form Input Footer */}
          {((mode === "QA" && !isLoading) || (mode === "PSEUDO" && pseudoStep < 2)) && (
            <form onSubmit={mode === "QA" ? handleQaSubmit : handlePseudoSubmit} className="p-3 bg-white border-t border-slate-100 flex gap-2 items-center shrink-0">
              <input
                type="text"
                placeholder={
                  mode === "QA" 
                    ? "Ask a question about this page..." 
                    : (pseudoStep === 0 ? "Type Primary Skill (e.g. SAP PP/QM)..." : "Type Experience (e.g. 5+)...")
                }
                value={chatInputText}
                onChange={(e) => setChatInputText(e.target.value)}
                className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-purple-500 transition"
                required
              />
              <button
                type="submit"
                className="p-2 bg-purple-600 text-white rounded-xl hover:bg-purple-700 active:scale-95 transition flex items-center justify-center shadow-md shadow-purple-600/10"
              >
                <Send className="size-3.5" />
              </button>
            </form>
          )}

          {/* Loader Overlay for QA mode */}
          {mode === "QA" && isLoading && (
            <div className="p-3 bg-white border-t border-slate-100 flex items-center justify-center gap-2 text-purple-600 text-xs shrink-0">
              <Loader2 className="size-3.5 animate-spin" />
              <span>Thinking...</span>
            </div>
          )}
        </div>
      )}
    </>
  );
}
