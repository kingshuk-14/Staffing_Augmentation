import React from "react";
import { Link } from "react-router-dom";
import { Boxes } from "@/components/ui/background-boxes";
import { cn } from "@/lib/utils";
import { ArrowRight, Building2 } from "lucide-react";

export function LandingPage() {
  return (
    <div className="min-h-screen relative w-full overflow-hidden bg-red-50 flex flex-col items-center justify-center">
      <div className="absolute inset-0 w-full h-full bg-red-50 z-20 [mask-image:radial-gradient(transparent,white)] pointer-events-none" />

      <Boxes />
      
      <div className="relative z-20 flex flex-col items-center justify-center text-center px-4">
        <div className="mb-6 p-4 bg-red-100 rounded-full shadow-sm ring-1 ring-red-200">
          <Building2 className="w-12 h-12 text-red-600" />
        </div>
        
        <h1 className={cn("md:text-6xl text-4xl font-extrabold text-slate-900 tracking-tight")}>
          Welcome to <span className="text-red-600">Alphaxine</span>
        </h1>
        
        <p className="text-center mt-6 text-xl text-slate-700 max-w-2xl font-medium">
          The next-generation staffing and recruitment platform. Connecting top talent with the best opportunities through intelligent automation.
        </p>
        
        <div className="mt-10">
          <Link 
            to="/login"
            className="inline-flex items-center justify-center px-8 py-4 text-base font-bold text-white transition-all duration-200 bg-red-600 border border-transparent rounded-full shadow-lg hover:bg-red-700 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-600 group"
          >
            Continue to Portal
            <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      </div>
    </div>
  );
}
