import { motion } from "motion/react";
import { ArrowLeft, Shield, Lock, Trash2, Mail } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Footer from "./Footer";

export default function PrivacyPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#FAF7F2] pb-12 selection:bg-brand-coral/20 flex flex-col">
      {/* Sticky Navigation Header */}
      <header className="sticky top-0 left-0 right-0 z-50 bg-[#FAF7F2]/80 backdrop-blur-md border-b border-brand-teal/5 py-4 px-6 mb-8">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <motion.button 
            whileHover={{ x: -4 }}
            onClick={() => navigate("/")} 
            className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-[#1A6B7A] hover:text-[#E87E5C] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Home
          </motion.button>
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[#1A6B7A]/40">Legal & Security</span>
            <span className="text-xs font-serif italic text-[#1A6B7A]">Privacy Commitment</span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-grow w-full max-w-[800px] mx-auto px-6 md:px-8">
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl p-8 md:p-12 border border-brand-teal/5 shadow-xl shadow-brand-teal/[0.01] space-y-12"
        >
          {/* Page Title & Subtitle */}
          <div className="space-y-3 border-b border-brand-teal/5 pb-8">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🛡️</span>
              <span className="text-[10px] font-black uppercase tracking-[0.25em] text-[#E87E5C]">Safety & Respect</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-serif italic text-[#1A6B7A]">
              Privacy Policy
            </h1>
            <p className="text-[#6B7785] text-xs font-semibold uppercase tracking-wider">
              Last updated: June 1, 2026
            </p>
          </div>

          {/* Privacy content body */}
          <div className="text-black text-sm md:text-base leading-relaxed space-y-8 font-light">
            <p className="italic text-[#1A6B7A]/80 font-medium">
              Travlly (&ldquo;we&rdquo; or &ldquo;us&rdquo;) respects your privacy. This Privacy Policy explains how we collect, use, and protect your information.
            </p>

            {/* WHAT WE COLLECT */}
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-[#1A6B7A]" />
                <h2 className="text-lg md:text-xl font-bold tracking-tight text-[#1A6B7A] uppercase">
                  What We Collect
                </h2>
              </div>
              <p>
                When you use Travlly, we collect:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Trip information you submit (destination, dates, group size, budget, vibe tags, notes)</li>
                <li>Generated itineraries stored in our database</li>
                <li>Your IP address and browser information (automatically via Firebase)</li>
                <li>Votes and comments you leave on shared trips</li>
              </ul>
              <div className="bg-[#FAF7F2] p-4 rounded-2xl border border-brand-teal/[0.03] space-y-1 mt-4">
                <p className="text-xs font-black uppercase tracking-wider text-[#E87E5C]">We do NOT collect:</p>
                <ul className="list-disc pl-6 text-xs text-black/70 space-y-1">
                  <li>Personal identifiable information (names, email addresses) unless you voluntarily provide them</li>
                  <li>Payment information (we don&apos;t process payments)</li>
                  <li>Location data (we only use destination names you provide)</li>
                  <li>Cookies or tracking pixels</li>
                </ul>
              </div>
            </section>

            {/* HOW WE USE YOUR DATA */}
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <Lock className="w-5 h-5 text-[#1A6B7A]" />
                <h2 className="text-lg md:text-xl font-bold tracking-tight text-[#1A6B7A] uppercase">
                  How We Use Your Data
                </h2>
              </div>
              <p>
                We use your data to:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Generate your personalized itinerary using AI</li>
                <li>Display your trip so you can share it with your group</li>
                <li>Allow group members to vote and comment</li>
                <li>Improve the service (anonymized analytics only)</li>
              </ul>
            </section>

            {/* DATA STORAGE & SHARING */}
            <section className="space-y-4">
              <h2 className="text-lg md:text-xl font-bold tracking-tight text-[#1A6B7A] uppercase">
                Data Storage
              </h2>
              <p>
                Your trip data is stored in Google Firebase (Firestore). Google&apos;s privacy policy applies to the underlying infrastructure. Data is encrypted in transit and at rest.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-lg md:text-xl font-bold tracking-tight text-[#1A6B7A] uppercase">
                Sharing Your Data
              </h2>
              <p>
                We do <strong>NOT</strong> share, sell, or transfer your trip data to anyone. Your trip is private unless you choose to share the link with others.
              </p>
              <p className="bg-[#FAF7F2] p-4 rounded-2xl border border-brand-teal/[0.03] text-xs text-black/70 italic">
                If you share a trip link with group members, they can view activities, vote, and comment. This is intentional and necessary for the product to work.
              </p>
            </section>

            {/* YOUR RIGHTS */}
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-[#1A6B7A]" />
                <h2 className="text-lg md:text-xl font-bold tracking-tight text-[#1A6B7A] uppercase">
                  Your Rights
                </h2>
              </div>
              <p>
                You can delete your trip at any time. Once deleted, we cannot recover it. Trip deletion is permanent.
              </p>
              <p>
                You can request all your data by emailing us. We will provide it within 7 days.
              </p>
            </section>

            {/* THIRD-PARTY SERVICES */}
            <section className="space-y-4">
              <h2 className="text-lg md:text-xl font-bold tracking-tight text-[#1A6B7A] uppercase">
                Third-Party Services
              </h2>
              <p>
                We use:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>
                  Google Firebase for hosting and database (
                  <a href="https://firebase.google.com/support/privacy" target="_blank" rel="noopener noreferrer" className="text-[#1A6B7A] underline hover:text-[#E87E5C] transition-colors">
                    https://firebase.google.com/support/privacy
                  </a>
                  )
                </li>
                <li>
                  Google Gemini API for AI itinerary generation (
                  <a href="https://ai.google.dev/privacy" target="_blank" rel="noopener noreferrer" className="text-[#1A6B7A] underline hover:text-[#E87E5C] transition-colors">
                    https://ai.google.dev/privacy
                  </a>
                  )
                </li>
                <li>
                  Open-Meteo for weather data (
                  <a href="https://open-meteo.com/en/privacy" target="_blank" rel="noopener noreferrer" className="text-[#1A6B7A] underline hover:text-[#E87E5C] transition-colors">
                    https://open-meteo.com/en/privacy
                  </a>
                  )
                </li>
                <li>
                  Google Maps (outbound links only; we don&apos;t embed their API)
                </li>
              </ul>
            </section>

            {/* CONTACT */}
            <section className="space-y-4 pt-4 border-t border-brand-teal/5">
              <div className="flex items-center gap-2">
                <Mail className="w-5 h-5 text-[#1A6B7A]" />
                <h2 className="text-lg md:text-xl font-bold tracking-tight text-[#1A6B7A] uppercase">
                  Contact
                </h2>
              </div>
              <p>
                If you have questions about this privacy policy, email:{" "}
                <a href="mailto:tifano.sebastian@gmail.com" className="text-[#E87E5C] font-semibold underline hover:text-[#1A6B7A] transition-colors">
                  tifano.sebastian@gmail.com
                </a>
              </p>
            </section>
          </div>
        </motion.div>
      </main>

      <Footer />
    </div>
  );
}
