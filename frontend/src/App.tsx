import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { LandingPage } from "@/pages/LandingPage";
import { Component as LoginPage } from "@/components/ui/animated-characters-login-page";
import { Component as SignupPage } from "@/components/ui/animated-characters-signup-page";
import { SidebarLayout } from "@/components/Alphaxine/SidebarLayout";
import { ResumeUpload } from "@/components/Alphaxine/ResumeUpload";
import { ParsedResumesList } from "@/components/Alphaxine/ParsedResumesList";
import { JobsDirectory } from "@/components/Alphaxine/JobsDirectory";
import { JobDetailsView } from "@/components/Alphaxine/JobDetailsView";
import { VendorsManager } from "@/components/Alphaxine/VendorsManager";
import { CandidatesManager } from "@/components/Alphaxine/CandidatesManager";
import { ClientsManager } from "@/components/Alphaxine/ClientsManager";
import { DashboardOverview } from "@/components/Alphaxine/DashboardOverview";
import { ProfileSettings } from "@/components/Alphaxine/ProfileSettings";
import MailIntegration from "@/components/Alphaxine/MailIntegration";
import { VendorSubmit } from "@/components/VendorPortal/VendorSubmit";

function RecruiterDashboard() {
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold text-primary">Recruiter Dashboard</h1>
      <p className="mt-4 text-muted-foreground">Welcome to the Recruiter view.</p>
    </div>
  );
}

function ClientDashboard() {
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold text-primary">Client Dashboard</h1>
      <p className="mt-4 text-muted-foreground">Welcome to the Client view.</p>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem("token");
  if (!token) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

function AuthRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem("token");
  if (token) {
    const userStr = localStorage.getItem("user");
    const user = userStr ? JSON.parse(userStr) : null;
    if (user?.role === 'recruiter') return <Navigate to="/recruiter" replace />;
    if (user?.role === 'client') return <Navigate to="/client" replace />;
    return <Navigate to="/alphaxine" replace />;
  }
  return <>{children}</>;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<AuthRoute><LoginPage /></AuthRoute>} />
        <Route path="/signup" element={<AuthRoute><SignupPage /></AuthRoute>} />
        
        <Route path="/recruiter" element={<ProtectedRoute><RecruiterDashboard /></ProtectedRoute>} />
        <Route path="/client" element={<ProtectedRoute><ClientDashboard /></ProtectedRoute>} />
        <Route path="/vendor-submit" element={<ProtectedRoute><VendorSubmit /></ProtectedRoute>} />
        
        <Route path="/alphaxine" element={<ProtectedRoute><SidebarLayout /></ProtectedRoute>}>
          <Route index element={<DashboardOverview />} />
          <Route path="upload" element={<ResumeUpload />} />
          <Route path="resumes" element={<ParsedResumesList />} />
          <Route path="jobs" element={<JobsDirectory />} />
          <Route path="jobs/:id" element={<JobDetailsView />} />
          <Route path="vendors" element={<VendorsManager />} />
          <Route path="candidates" element={<CandidatesManager />} />
          <Route path="clients" element={<ClientsManager />} />
          <Route path="mail-integration" element={<MailIntegration />} />
          <Route path="profile" element={<ProfileSettings />} />
        </Route>
        
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
