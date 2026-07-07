import React, { useState } from 'react';
import { Mail, Inbox, Plus, RefreshCw, CheckCircle, Send } from 'lucide-react';
import { toast, Toaster } from 'react-hot-toast';

export default function MailIntegration() {
  const [isRegistered, setIsRegistered] = useState(false);
  const [emailToRegister, setEmailToRegister] = useState('');
  
  const [emailAuth, setEmailAuth] = useState('');
  const [appPassword, setAppPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);

  // Empty inbox by default (no sample data)
  const [emails, setEmails] = useState<{id: string, sender: string, subject: string, content: string, date: string, imported: boolean}[]>([]);

  React.useEffect(() => {
    const saved = sessionStorage.getItem('mailIntegrationAuth');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Date.now() - parsed.timestamp < 15 * 60 * 1000) {
          setEmailAuth(parsed.emailAuth);
          setAppPassword(parsed.appPassword);
          setIsRegistered(true);
          fetchEmailsOnLoad(parsed.emailAuth, parsed.appPassword);
        } else {
          sessionStorage.removeItem('mailIntegrationAuth');
        }
      } catch (e) {
        sessionStorage.removeItem('mailIntegrationAuth');
      }
    }
  }, []);

  const fetchEmailsOnLoad = async (email: string, password: string) => {
    setFetching(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/mail-integration/fetch-emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ email, password })
      });

      if (response.ok) {
        const data = await response.json();
        setEmails(data.emails || []);
      } else {
        setIsRegistered(false);
        sessionStorage.removeItem('mailIntegrationAuth');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setFetching(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/mail-integration/fetch-emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ email: emailAuth, password: appPassword })
      });

      if (response.ok) {
        const data = await response.json();
        setEmails(data.emails || []);
        setIsRegistered(true);
        sessionStorage.setItem('mailIntegrationAuth', JSON.stringify({ emailAuth, appPassword, timestamp: Date.now() }));
        toast.success('Successfully connected to Inbox!');
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to authenticate');
      }
    } catch (err) {
      console.error(err);
      toast.error('An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setFetching(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/mail-integration/fetch-emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ email: emailAuth, password: appPassword })
      });

      if (response.ok) {
        const data = await response.json();
        setEmails(data.emails || []);
        toast.success('Inbox Synced!');
      } else {
        toast.error('Failed to sync inbox');
      }
    } catch (err) {
      console.error(err);
      toast.error('An error occurred during sync');
    } finally {
      setFetching(false);
    }
  };

  const handleImport = async (emailId: string) => {
    const email = emails.find(e => e.id === emailId);
    if (!email) return;

    // Toast loading
    const toastId = toast.loading('Extracting Job Requirements via AI...');
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/mail-integration/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          sender_email: emailAuth, // Must be the registered email
          email_content: `Subject: ${email.subject}\n\n${email.content}`
        })
      });
      
      const data = await response.json();
      if (response.ok) {
        toast.success(`Successfully imported: ${data.job.title}`, { id: toastId });
        setEmails(emails.map(e => e.id === emailId ? { ...e, imported: true } : e));
      } else {
        toast.error(data.error || 'Failed to import job', { id: toastId });
      }
    } catch (err) {
      toast.error('Network error during import', { id: toastId });
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto font-sans">
      <Toaster position="top-right" />
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <Mail className="w-8 h-8 text-blue-600" />
            Mail Integration
          </h1>
          <p className="text-gray-500 mt-2">Import job requirements directly from client emails.</p>
        </div>
      </div>

      {!isRegistered ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 max-w-2xl mx-auto mt-12 text-center">
          <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <Send className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Connect Your Inbox</h1>
          <p className="text-gray-500 mb-8 max-w-md mx-auto">
            Authenticate your email (e.g. Gmail) to directly fetch and import job requirements from clients.
            For security, please use an App Password rather than your primary password.
          </p>
          
          <form onSubmit={handleLogin} className="max-w-md mx-auto space-y-4">
            <div>
              <input 
                type="email" 
                value={emailAuth}
                onChange={e => setEmailAuth(e.target.value)}
                placeholder="name@company.com" 
                required
                className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all shadow-sm"
              />
            </div>
            <div>
              <input 
                type="password" 
                value={appPassword}
                onChange={e => setAppPassword(e.target.value)}
                placeholder="16-character App Password" 
                required
                className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all shadow-sm"
              />
            </div>
            <button 
              type="submit" 
              disabled={loading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-sm transition-colors flex items-center justify-center gap-2"
            >
              {loading ? <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></span> : <><Send className="w-5 h-5" /> Connect via IMAP</>}
            </button>
          </form>
          <div className="mt-6 text-sm text-gray-400">
            Note: Your session will be kept active for 15 minutes.
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex h-[600px]">
          {/* Sidebar */}
          <div className="w-64 border-r border-gray-100 bg-gray-50/50 p-4">
            <div className="flex items-center gap-2 text-gray-700 font-medium mb-6 px-2">
              <Inbox className="w-5 h-5" />
              Inbox ({emails.length})
            </div>
            <div className="space-y-1">
              <div className="bg-blue-50 text-blue-700 px-3 py-2 rounded-md font-medium cursor-pointer">
                Primary
              </div>
              <div className="text-gray-600 hover:bg-gray-100 px-3 py-2 rounded-md cursor-pointer transition-colors">
                Archived
              </div>
            </div>
          </div>
          
          {/* Main Inbox */}
          <div className="flex-1 flex flex-col">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-white">
              <h2 className="font-semibold text-gray-800">Recent Client Emails</h2>
              <div className="flex gap-3">
                <button onClick={handleSync} disabled={fetching} className="text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1 bg-gray-100 px-3 py-1.5 rounded-lg font-medium">
                  <RefreshCw className={`w-4 h-4 ${fetching ? 'animate-spin' : ''}`} /> {fetching ? 'Syncing...' : 'Sync'}
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto bg-gray-50/30 p-6 space-y-4">
              {emails.length === 0 ? (
                <div className="text-center py-20 text-gray-500">
                  <Inbox className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                  <p>Your inbox is empty or no unread emails found.</p>
                </div>
              ) : (
                emails.map(email => (
                <div key={email.id} className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow group relative">
                  
                  {/* Action Button */}
                  <div className="absolute top-5 right-5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {email.imported ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-green-50 text-green-700 border border-green-200">
                        <CheckCircle className="w-4 h-4" /> Imported
                      </span>
                    ) : (
                      <button
                        onClick={() => handleImport(email.id)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-colors"
                      >
                        <Plus className="w-4 h-4" /> Import to Staffing
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-100 to-indigo-50 flex items-center justify-center text-blue-700 font-bold border border-blue-100">
                      {email.sender.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900 text-sm">{email.sender}</div>
                      <div className="text-xs text-gray-500">{new Date(email.date).toLocaleString()}</div>
                    </div>
                  </div>
                  
                  <h3 className="font-semibold text-gray-800 mb-2">{email.subject}</h3>
                  <p className="text-gray-600 text-sm leading-relaxed max-w-2xl overflow-hidden line-clamp-4">
                    {email.content}
                  </p>
                </div>
              )))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
