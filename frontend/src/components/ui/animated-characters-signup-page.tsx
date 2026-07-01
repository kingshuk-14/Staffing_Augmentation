"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Search, Briefcase, Shield, ChevronDown } from "lucide-react";
import { useNavigate, Link } from "react-router-dom";
import { cn } from "@/lib/utils";


interface PupilProps {
  size?: number;
  maxDistance?: number;
  pupilColor?: string;
  forceLookX?: number;
  forceLookY?: number;
}

const Pupil = ({ size = 12, maxDistance = 5, pupilColor = "black", forceLookX, forceLookY }: PupilProps) => {
  const [mouseX, setMouseX] = useState<number>(0);
  const [mouseY, setMouseY] = useState<number>(0);
  const pupilRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => { setMouseX(e.clientX); setMouseY(e.clientY); };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  const calculatePupilPosition = () => {
    if (!pupilRef.current) return { x: 0, y: 0 };
    if (forceLookX !== undefined && forceLookY !== undefined) return { x: forceLookX, y: forceLookY };
    const pupil = pupilRef.current.getBoundingClientRect();
    const deltaX = mouseX - (pupil.left + pupil.width / 2);
    const deltaY = mouseY - (pupil.top + pupil.height / 2);
    const distance = Math.min(Math.sqrt(deltaX ** 2 + deltaY ** 2), maxDistance);
    const angle = Math.atan2(deltaY, deltaX);
    return { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance };
  };

  const pos = calculatePupilPosition();

  return (
    <div
      ref={pupilRef}
      className="rounded-full"
      style={{
        width: `${size}px`, height: `${size}px`, backgroundColor: pupilColor,
        transform: `translate(${pos.x}px, ${pos.y}px)`, transition: 'transform 0.1s ease-out',
      }}
    />
  );
};

interface EyeBallProps {
  size?: number;
  pupilSize?: number;
  maxDistance?: number;
  eyeColor?: string;
  pupilColor?: string;
  isBlinking?: boolean;
  forceLookX?: number;
  forceLookY?: number;
}

const EyeBall = ({ size = 48, pupilSize = 16, maxDistance = 10, eyeColor = "white", pupilColor = "black", isBlinking = false, forceLookX, forceLookY }: EyeBallProps) => {
  const [mouseX, setMouseX] = useState<number>(0);
  const [mouseY, setMouseY] = useState<number>(0);
  const eyeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => { setMouseX(e.clientX); setMouseY(e.clientY); };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  const calculatePupilPosition = () => {
    if (!eyeRef.current) return { x: 0, y: 0 };
    if (forceLookX !== undefined && forceLookY !== undefined) return { x: forceLookX, y: forceLookY };
    const eye = eyeRef.current.getBoundingClientRect();
    const deltaX = mouseX - (eye.left + eye.width / 2);
    const deltaY = mouseY - (eye.top + eye.height / 2);
    const distance = Math.min(Math.sqrt(deltaX ** 2 + deltaY ** 2), maxDistance);
    const angle = Math.atan2(deltaY, deltaX);
    return { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance };
  };

  const pos = calculatePupilPosition();

  return (
    <div
      ref={eyeRef}
      className="rounded-full flex items-center justify-center transition-all duration-150"
      style={{ width: `${size}px`, height: isBlinking ? '2px' : `${size}px`, backgroundColor: eyeColor, overflow: 'hidden' }}
    >
      {!isBlinking && (
        <div className="rounded-full" style={{ width: `${pupilSize}px`, height: `${pupilSize}px`, backgroundColor: pupilColor, transform: `translate(${pos.x}px, ${pos.y}px)`, transition: 'transform 0.1s ease-out' }} />
      )}
    </div>
  );
};

export function SignupPage() {
  const navigate = useNavigate();

  // Verification state
  const [isVerified, setIsVerified] = useState(false);
  const [verificationToken, setVerificationToken] = useState("");
  const [verificationSent, setVerificationSent] = useState(false);

  // Form state
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("recruiter");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Derived validation
  const passwordMismatch = confirmPassword.length > 0 && password !== confirmPassword;
  
  // Calculate password strength and rules check
  const { checks: pwdChecks, score: pwdScore } = (() => {
    const pwd = password;
    const checks = {
      length: pwd.length >= 8,
      uppercase: /[A-Z]/.test(pwd),
      lowercase: /[a-z]/.test(pwd),
      number: /[0-9]/.test(pwd),
      special: /[^A-Za-z0-9]/.test(pwd),
    };
    const score = Object.values(checks).filter(Boolean).length;
    return { checks, score };
  })();

  const isPasswordValid = pwdChecks.length && pwdChecks.uppercase && pwdChecks.lowercase && pwdChecks.number && pwdChecks.special;

  // Animation states
  const [mouseX, setMouseX] = useState<number>(0);
  const [mouseY, setMouseY] = useState<number>(0);
  const [isPurpleBlinking, setIsPurpleBlinking] = useState(false);
  const [isBlackBlinking, setIsBlackBlinking] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [isLookingAtEachOther, setIsLookingAtEachOther] = useState(false);
  const [isPurplePeeking, setIsPurplePeeking] = useState(false);
  const purpleRef = useRef<HTMLDivElement>(null);
  const blackRef = useRef<HTMLDivElement>(null);
  const yellowRef = useRef<HTMLDivElement>(null);
  const orangeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => { setMouseX(e.clientX); setMouseY(e.clientY); };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  // Handle email verification polling
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval>;

    if (verificationSent && !isVerified) {
      intervalId = setInterval(async () => {
        try {
          const response = await fetch(`/api/auth/verification-status?email=${encodeURIComponent(email)}`);
          if (response.ok) {
            const data = await response.json();
            if (data.status === 'verified') {
              setIsVerified(true);
              setVerificationToken(data.token);
              clearInterval(intervalId);
            } else if (data.status === 'rejected') {
              setError("Email verification was rejected from the device. Please try again.");
              setVerificationSent(false);
              clearInterval(intervalId);
            }
          }
        } catch (error) {
          console.error("Polling error:", error);
        }
      }, 3000);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [verificationSent, isVerified, email]);

  useEffect(() => {
    const scheduleBlink = () => {
      const timeout = setTimeout(() => {
        setIsPurpleBlinking(true);
        setTimeout(() => { setIsPurpleBlinking(false); scheduleBlink(); }, 150);
      }, Math.random() * 4000 + 3000);
      return timeout;
    };
    const t = scheduleBlink();
    return () => clearTimeout(t);
  }, []);


  useEffect(() => {
    const scheduleBlink = () => {
      const timeout = setTimeout(() => {
        setIsBlackBlinking(true);
        setTimeout(() => { setIsBlackBlinking(false); scheduleBlink(); }, 150);
      }, Math.random() * 4000 + 3000);
      return timeout;
    };
    const t = scheduleBlink();
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (isTyping) {
      setIsLookingAtEachOther(true);
      const timer = setTimeout(() => setIsLookingAtEachOther(false), 800);
      return () => clearTimeout(timer);
    } else {
      setIsLookingAtEachOther(false);
    }
  }, [isTyping]);

  useEffect(() => {
    if (password.length > 0 && showPassword) {
      const schedulePeek = () => {
        const peekInterval = setTimeout(() => {
          setIsPurplePeeking(true);
          setTimeout(() => setIsPurplePeeking(false), 800);
        }, Math.random() * 3000 + 2000);
        return peekInterval;
      };
      const firstPeek = schedulePeek();
      return () => clearTimeout(firstPeek);
    } else {
      setIsPurplePeeking(false);
    }
  }, [password, showPassword, isPurplePeeking]);

  const calculatePosition = (ref: React.RefObject<HTMLDivElement | null>) => {
    if (!ref.current) return { faceX: 0, faceY: 0, bodySkew: 0 };
    const rect = ref.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 3;
    const deltaX = mouseX - centerX;
    const deltaY = mouseY - centerY;
    const faceX = Math.max(-15, Math.min(15, deltaX / 20));
    const faceY = Math.max(-10, Math.min(10, deltaY / 30));
    const bodySkew = Math.max(-6, Math.min(6, -deltaX / 120));
    return { faceX, faceY, bodySkew };
  };

  const purplePos = calculatePosition(purpleRef);
  const blackPos = calculatePosition(blackRef);
  const yellowPos = calculatePosition(yellowRef);
  const orangePos = calculatePosition(orangeRef);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    if (!isVerified) {
      // Step 1: Send verification email
      setIsLoading(true);
      try {
        const response = await fetch("/api/auth/send-verification", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const data = await response.json();
        
        if (response.ok) {
          setVerificationSent(true);
          // Save form state to localStorage
          localStorage.setItem("signupData", JSON.stringify({
            firstName, lastName, email, phone, gender, dateOfBirth, company, role, password, confirmPassword
          }));
        } else {
          setError(data.error || "Failed to send verification email.");
        }
      } catch (err) {
        console.error("Network error:", err);
        setError("Network error. Is the backend running?");
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // Step 2: Proceed with account creation if verified
    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          email,
          phone: phone || undefined,
          gender: gender || undefined,
          date_of_birth: dateOfBirth || undefined,
          company,
          role,
          password,
          confirm_password: confirmPassword,
          verificationToken,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        // Auto-login after signup
        const loginResponse = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const loginData = await loginResponse.json();

        if (loginResponse.ok) {
          localStorage.setItem("token", loginData.token);
          localStorage.setItem("user", JSON.stringify(loginData.user));
          localStorage.removeItem("signupData"); // clear saved state
          if (role === 'recruiter') navigate('/recruiter');
          else if (role === 'client') navigate('/client');
          else if (role === 'alphaxine') navigate('/alphaxine');
          else navigate('/recruiter');
        } else {
          navigate('/login');
        }
      } else {
        setError(data.error || "Failed to sign up.");
        // If token failed, maybe reset verified status
        if (data.error && data.error.includes("token")) {
          setIsVerified(false);
        }
      }
    } catch (err) {
      console.error("Network error:", err);
      setError("Network error. Is the backend running?");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left Content Section â€” animated characters */}
      <div className="relative hidden lg:flex flex-col justify-between bg-gradient-to-br from-primary/90 via-primary to-primary/80 p-12 text-primary-foreground overflow-hidden">
        <div className="relative z-20">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <div className="size-8 rounded-lg bg-primary-foreground/10 backdrop-blur-sm flex items-center justify-center overflow-hidden">
              <img src="/alphaxine_logo" alt="Alphaxine Logo" className="w-full h-full object-contain" />
            </div>
            <span>Alphaxine</span>
          </div>
        </div>

        <div className="relative z-20 flex items-end justify-center h-[500px]">
          <div className="relative" style={{ width: '550px', height: '400px' }}>
            <div ref={purpleRef} className="absolute bottom-0 transition-all duration-700 ease-in-out" style={{ left: '70px', width: '180px', height: (isTyping || (password.length > 0 && !showPassword)) ? '440px' : '400px', backgroundColor: '#6C3FF5', borderRadius: '10px 10px 0 0', zIndex: 1, transform: (password.length > 0 && showPassword) ? `skewX(0deg)` : (isTyping || (password.length > 0 && !showPassword)) ? `skewX(${(purplePos.bodySkew || 0) - 12}deg) translateX(40px)` : `skewX(${purplePos.bodySkew || 0}deg)`, transformOrigin: 'bottom center' }}>
              <div className="absolute flex gap-8 transition-all duration-700 ease-in-out" style={{ left: (password.length > 0 && showPassword) ? `20px` : isLookingAtEachOther ? `55px` : `${45 + purplePos.faceX}px`, top: (password.length > 0 && showPassword) ? `35px` : isLookingAtEachOther ? `65px` : `${40 + purplePos.faceY}px` }}>
                <EyeBall size={18} pupilSize={7} maxDistance={5} isBlinking={isPurpleBlinking} forceLookX={(password.length > 0 && showPassword) ? (isPurplePeeking ? 4 : -4) : isLookingAtEachOther ? 3 : undefined} forceLookY={(password.length > 0 && showPassword) ? (isPurplePeeking ? 5 : -4) : isLookingAtEachOther ? 4 : undefined} />
                <EyeBall size={18} pupilSize={7} maxDistance={5} isBlinking={isPurpleBlinking} forceLookX={(password.length > 0 && showPassword) ? (isPurplePeeking ? 4 : -4) : isLookingAtEachOther ? 3 : undefined} forceLookY={(password.length > 0 && showPassword) ? (isPurplePeeking ? 5 : -4) : isLookingAtEachOther ? 4 : undefined} />
              </div>
            </div>
            <div ref={blackRef} className="absolute bottom-0 transition-all duration-700 ease-in-out" style={{ left: '240px', width: '120px', height: '310px', backgroundColor: '#2D2D2D', borderRadius: '8px 8px 0 0', zIndex: 2, transform: (password.length > 0 && showPassword) ? `skewX(0deg)` : isLookingAtEachOther ? `skewX(${(blackPos.bodySkew || 0) * 1.5 + 10}deg) translateX(20px)` : (isTyping || (password.length > 0 && !showPassword)) ? `skewX(${(blackPos.bodySkew || 0) * 1.5}deg)` : `skewX(${blackPos.bodySkew || 0}deg)`, transformOrigin: 'bottom center' }}>
              <div className="absolute flex gap-6 transition-all duration-700 ease-in-out" style={{ left: (password.length > 0 && showPassword) ? `10px` : isLookingAtEachOther ? `32px` : `${26 + blackPos.faceX}px`, top: (password.length > 0 && showPassword) ? `28px` : isLookingAtEachOther ? `12px` : `${32 + blackPos.faceY}px` }}>
                <EyeBall size={16} pupilSize={6} maxDistance={4} isBlinking={isBlackBlinking} forceLookX={(password.length > 0 && showPassword) ? -4 : isLookingAtEachOther ? 0 : undefined} forceLookY={(password.length > 0 && showPassword) ? -4 : isLookingAtEachOther ? -4 : undefined} />
                <EyeBall size={16} pupilSize={6} maxDistance={4} isBlinking={isBlackBlinking} forceLookX={(password.length > 0 && showPassword) ? -4 : isLookingAtEachOther ? 0 : undefined} forceLookY={(password.length > 0 && showPassword) ? -4 : isLookingAtEachOther ? -4 : undefined} />
              </div>
            </div>
            <div ref={orangeRef} className="absolute bottom-0 transition-all duration-700 ease-in-out" style={{ left: '0px', width: '240px', height: '200px', zIndex: 3, backgroundColor: '#FF9B6B', borderRadius: '120px 120px 0 0', transform: (password.length > 0 && showPassword) ? `skewX(0deg)` : `skewX(${orangePos.bodySkew || 0}deg)`, transformOrigin: 'bottom center' }}>
              <div className="absolute flex gap-8 transition-all duration-200 ease-out" style={{ left: (password.length > 0 && showPassword) ? `50px` : `${82 + (orangePos.faceX || 0)}px`, top: (password.length > 0 && showPassword) ? `85px` : `${90 + (orangePos.faceY || 0)}px` }}>
                <Pupil size={12} maxDistance={5} pupilColor="#2D2D2D" forceLookX={(password.length > 0 && showPassword) ? -5 : undefined} forceLookY={(password.length > 0 && showPassword) ? -4 : undefined} />
                <Pupil size={12} maxDistance={5} pupilColor="#2D2D2D" forceLookX={(password.length > 0 && showPassword) ? -5 : undefined} forceLookY={(password.length > 0 && showPassword) ? -4 : undefined} />
              </div>
            </div>
            <div ref={yellowRef} className="absolute bottom-0 transition-all duration-700 ease-in-out" style={{ left: '310px', width: '140px', height: '230px', backgroundColor: '#E8D754', borderRadius: '70px 70px 0 0', zIndex: 4, transform: (password.length > 0 && showPassword) ? `skewX(0deg)` : `skewX(${yellowPos.bodySkew || 0}deg)`, transformOrigin: 'bottom center' }}>
              <div className="absolute flex gap-6 transition-all duration-200 ease-out" style={{ left: (password.length > 0 && showPassword) ? `20px` : `${52 + (yellowPos.faceX || 0)}px`, top: (password.length > 0 && showPassword) ? `35px` : `${40 + (yellowPos.faceY || 0)}px` }}>
                <Pupil size={12} maxDistance={5} pupilColor="#2D2D2D" forceLookX={(password.length > 0 && showPassword) ? -5 : undefined} forceLookY={(password.length > 0 && showPassword) ? -4 : undefined} />
                <Pupil size={12} maxDistance={5} pupilColor="#2D2D2D" forceLookX={(password.length > 0 && showPassword) ? -5 : undefined} forceLookY={(password.length > 0 && showPassword) ? -4 : undefined} />
              </div>
              <div className="absolute w-20 h-[4px] bg-[#2D2D2D] rounded-full transition-all duration-200 ease-out" style={{ left: (password.length > 0 && showPassword) ? `10px` : `${40 + (yellowPos.faceX || 0)}px`, top: (password.length > 0 && showPassword) ? `88px` : `${88 + (yellowPos.faceY || 0)}px` }} />
            </div>
          </div>
        </div>

        <div className="relative z-20 flex items-center gap-8 text-sm text-primary-foreground/60">
          <a href="#" className="hover:text-primary-foreground transition-colors">Privacy Policy</a>
          <a href="#" className="hover:text-primary-foreground transition-colors">Terms of Service</a>
          <a href="#" className="hover:text-primary-foreground transition-colors">Contact</a>
        </div>
        <div className="absolute inset-0 bg-grid-white/[0.05] bg-[size:20px_20px]" />
        <div className="absolute top-1/4 right-1/4 size-64 bg-primary-foreground/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 left-1/4 size-96 bg-primary-foreground/5 rounded-full blur-3xl" />
      </div>

      {/* Right Signup Section */}
      <div className="flex items-start justify-center p-8 bg-background overflow-y-auto">
        <div className="w-full max-w-[480px] py-10">
          <div className="lg:hidden flex items-center justify-center gap-2 text-lg font-semibold mb-8">
            <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center overflow-hidden">
              <img src="/alphaxine_logo" alt="Alphaxine Logo" className="w-full h-full object-contain" />
            </div>
            <span>Alphaxine</span>
          </div>

          <div className="mb-7">
            <h1 className="text-3xl font-bold tracking-tight mb-2 text-[#1a202c]">Create your account</h1>
            <p className="text-muted-foreground text-sm">
              Already have an account?{" "}
              <Link to="/login" className="text-primary hover:underline font-medium">
                Sign in
              </Link>
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* â”€â”€ Personal Info â”€â”€ */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Personal Information</p>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="firstName" className="text-sm font-medium">First name <span className="text-red-500">*</span></Label>
                    <Input id="firstName" placeholder="Alex" value={firstName} onChange={e => setFirstName(e.target.value)} required className="h-11 bg-slate-50 border-slate-200" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="lastName" className="text-sm font-medium">Last name <span className="text-red-500">*</span></Label>
                    <Input id="lastName" placeholder="Morgan" value={lastName} onChange={e => setLastName(e.target.value)} required className="h-11 bg-slate-50 border-slate-200" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="phone" className="text-sm font-medium">Phone number</Label>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="+91 98765 43210"
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      className="h-11 bg-slate-50 border-slate-200"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="dateOfBirth" className="text-sm font-medium">Date of birth</Label>
                    <Input
                      id="dateOfBirth"
                      type="date"
                      value={dateOfBirth}
                      onChange={e => setDateOfBirth(e.target.value)}
                      className="h-11 bg-slate-50 border-slate-200"
                    />
                  </div>
                </div>

                {/* Gender selector */}
                <div className="space-y-1.5">
                  <Label htmlFor="gender" className="text-sm font-medium">Gender</Label>
                  <div className="relative">
                    <select
                      id="gender"
                      value={gender}
                      onChange={e => setGender(e.target.value)}
                      className="w-full h-11 px-3 pr-9 rounded-md border border-slate-200 bg-slate-50 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    >
                      <option value="">Prefer not to say</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="non_binary">Non-binary</option>
                      <option value="prefer_not_to_say">Rather not specify</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-slate-400 pointer-events-none" />
                  </div>
                </div>
              </div>
            </div>

            {/* â”€â”€ Work Info â”€â”€ */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Work Details</p>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-sm font-medium">Work email <span className="text-red-500">*</span></Label>
                  <Input id="email" type="email" placeholder="you@company.com" value={email} onChange={e => setEmail(e.target.value)} required className="h-11 bg-slate-50 border-slate-200" />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="company" className="text-sm font-medium">Company name <span className="text-red-500">*</span></Label>
                  <Input id="company" placeholder="Acme Technologies" value={company} onChange={e => setCompany(e.target.value)} required className="h-11 bg-slate-50 border-slate-200" />
                </div>

                {/* Role selector */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">I am a <span className="text-red-500">*</span></Label>
                  <div className="grid grid-cols-3 gap-2">
                    <div
                      onClick={() => setRole("recruiter")}
                      className={cn("cursor-pointer border rounded-xl p-3 transition-all text-center", role === "recruiter" ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-slate-200 bg-slate-50 hover:bg-slate-100")}
                    >
                      <Search className={cn("size-4 mb-1.5 mx-auto", role === "recruiter" ? "text-primary" : "text-slate-500")} />
                      <div className="font-semibold text-xs mb-0.5">Recruiter</div>
                      <div className="text-[10px] text-slate-500 leading-tight">Sourcing candidates</div>
                    </div>
                    <div
                      onClick={() => setRole("client")}
                      className={cn("cursor-pointer border rounded-xl p-3 transition-all text-center", role === "client" ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-slate-200 bg-slate-50 hover:bg-slate-100")}
                    >
                      <Briefcase className={cn("size-4 mb-1.5 mx-auto", role === "client" ? "text-primary" : "text-slate-500")} />
                      <div className="font-semibold text-xs mb-0.5">Client</div>
                      <div className="text-[10px] text-slate-500 leading-tight">Hiring for my org</div>
                    </div>
                    <div
                      onClick={() => setRole("alphaxine")}
                      className={cn("cursor-pointer border rounded-xl p-3 transition-all text-center", role === "alphaxine" ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-slate-200 bg-slate-50 hover:bg-slate-100")}
                    >
                      <Shield className={cn("size-4 mb-1.5 mx-auto", role === "alphaxine" ? "text-primary" : "text-slate-500")} />
                      <div className="font-semibold text-xs mb-0.5">Alphaxine</div>
                      <div className="text-[10px] text-slate-500 leading-tight">Platform ops</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Security ── */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Security</p>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-sm font-medium">Password <span className="text-red-500">*</span></Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Min. 8 characters with rules"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      onFocus={() => setIsTyping(true)}
                      onBlur={() => setIsTyping(false)}
                      required
                      className={cn(
                        "h-11 pr-10 bg-slate-50 border-slate-200",
                        password.length > 0 && !isPasswordValid && "border-orange-300 focus-visible:ring-orange-200"
                      )}
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                  
                  {/* Password Strength Indicator */}
                  {password.length > 0 && (
                    <div className="space-y-2 mt-2 bg-slate-50/50 p-3 rounded-xl border border-slate-100">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500 font-medium">Password Strength:</span>
                        <span className={cn(
                          "font-bold",
                          pwdScore <= 1 && "text-red-500",
                          pwdScore === 2 && "text-orange-500",
                          pwdScore === 3 && "text-yellow-600",
                          pwdScore === 4 && "text-blue-500",
                          pwdScore === 5 && "text-green-600"
                        )}>
                          {pwdScore <= 1 && "Very Weak"}
                          {pwdScore === 2 && "Weak"}
                          {pwdScore === 3 && "Medium"}
                          {pwdScore === 4 && "Strong"}
                          {pwdScore === 5 && "Very Strong"}
                        </span>
                      </div>
                      <div className="flex gap-1 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        {[1, 2, 3, 4, 5].map((segment) => (
                          <div
                            key={segment}
                            className={cn(
                              "h-full flex-1 transition-all duration-300",
                              segment <= pwdScore
                                ? pwdScore <= 1 ? "bg-red-500"
                                  : pwdScore === 2 ? "bg-orange-500"
                                  : pwdScore === 3 ? "bg-yellow-500"
                                  : pwdScore === 4 ? "bg-blue-500"
                                  : "bg-green-500"
                                : "bg-transparent"
                            )}
                          />
                        ))}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 pt-1.5 text-[11px] leading-tight">
                        <div className="flex items-center gap-1.5 text-slate-500">
                          <div className={cn("size-1.5 rounded-full shrink-0", pwdChecks.length ? "bg-green-500" : "bg-slate-300")} />
                          <span className={cn(pwdChecks.length && "text-green-600 font-medium")}>Min. 8 characters</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-slate-500">
                          <div className={cn("size-1.5 rounded-full shrink-0", pwdChecks.uppercase ? "bg-green-500" : "bg-slate-300")} />
                          <span className={cn(pwdChecks.uppercase && "text-green-600 font-medium")}>One uppercase letter</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-slate-500">
                          <div className={cn("size-1.5 rounded-full shrink-0", pwdChecks.lowercase ? "bg-green-500" : "bg-slate-300")} />
                          <span className={cn(pwdChecks.lowercase && "text-green-600 font-medium")}>One lowercase letter</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-slate-500">
                          <div className={cn("size-1.5 rounded-full shrink-0", pwdChecks.number ? "bg-green-500" : "bg-slate-300")} />
                          <span className={cn(pwdChecks.number && "text-green-600 font-medium")}>One number (0-9)</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-slate-500 sm:col-span-2">
                          <div className={cn("size-1.5 rounded-full shrink-0", pwdChecks.special ? "bg-green-500" : "bg-slate-300")} />
                          <span className={cn(pwdChecks.special && "text-green-600 font-medium")}>One special character (e.g. !@#$%)</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confirmPassword" className="text-sm font-medium">Confirm password <span className="text-red-500">*</span></Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      placeholder="Repeat your password"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      required
                      className={cn("h-11 pr-10 bg-slate-50 border-slate-200", passwordMismatch && "border-red-300 focus-visible:ring-red-200")}
                    />
                    <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showConfirmPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                  {passwordMismatch && (
                    <p className="text-xs text-red-500">Passwords do not match.</p>
                  )}
                </div>
              </div>
            </div>



            {verificationSent && !isVerified && (
              <div className="p-3 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg">
                Verification email sent! Please check your inbox and click the link to continue.
              </div>
            )}

            {error && (
              <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg">
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="w-full h-11 text-base font-semibold bg-[#E84E20] hover:bg-[#D44218] text-white shadow-sm"
              disabled={isLoading || passwordMismatch || !isPasswordValid}
            >
              {isLoading 
                ? (isVerified ? "Creating account…" : "Sending verification…") 
                : (isVerified ? "Create account" : (verificationSent ? "Resend Verification Email" : "Verify Email"))}
            </Button>

            <p className="text-center text-xs text-slate-400">
              By creating an account you agree to our{" "}
              <a href="#" className="underline hover:text-slate-600">Terms of Service</a>{" "}
              and{" "}
              <a href="#" className="underline hover:text-slate-600">Privacy Policy</a>.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}

export const Component = SignupPage;
