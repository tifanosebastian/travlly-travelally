import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Sparkles, MapPin, Calendar, Users, DollarSign, Check, Info, AlertCircle } from "lucide-react";
import { setDoc, collection, serverTimestamp, updateDoc, doc } from "firebase/firestore";
import { db, auth, handleFirestoreError, OperationType } from "../lib/firebase";
import { generateShareToken } from "../lib/utils";

const VIBE_OPTIONS = ["Foodie", "Adventure", "Culture", "Relaxation", "Nature", "Nightlife"];
const PACES = [
  { label: "Relaxed", desc: "3-5 activities per day" },
  { label: "Balanced", desc: "4-6 activities per day" },
  { label: "Packed", desc: "5-7 activities per day" },
];

const LOADING_MESSAGES = [
  "Finding the best spots...",
  "Building your day-by-day...",
  "Almost ready...",
];

export default function TripFormPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [success, setSuccess] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState({
    destination: "",
    startDate: "",
    endDate: "",
    groupSize: 4,
    budgetPerPerson: 1000,
    vibeTags: [] as string[],
    pace: "Balanced",
    notes: "",
  });

  useEffect(() => {
    let interval: any;
    if (loading) {
      interval = setInterval(() => {
        setLoadingStep((prev) => (prev + 1) % LOADING_MESSAGES.length);
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [loading]);

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.destination || formData.destination.length < 3 || formData.destination.length > 100) {
      newErrors.destination = "Destination must be between 3 and 100 characters.";
    }
    
    const start = new Date(formData.startDate);
    const end = new Date(formData.endDate);
    const now = new Date();
    const maxFuture = new Date();
    maxFuture.setFullYear(now.getFullYear() + 1);

    if (!formData.startDate) {
      newErrors.startDate = "Start date is required.";
    } else if (start <= now) {
      newErrors.startDate = "Start date must be in the future.";
    } else if (start > maxFuture) {
      newErrors.startDate = "Start date must be within 12 months.";
    }

    if (!formData.endDate) {
      newErrors.endDate = "End date is required.";
    } else if (end <= start) {
      newErrors.endDate = "End date must be after start date.";
    } else {
      const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays > 14) {
        newErrors.endDate = "Trip cannot exceed 14 days.";
      }
    }

    if (formData.groupSize < 1 || formData.groupSize > 12) {
      newErrors.groupSize = "Group size must be between 1 and 12.";
    }

    if (formData.budgetPerPerson < 200 || formData.budgetPerPerson > 10000) {
      newErrors.budgetPerPerson = "Budget must be between $200 and $10,000.";
    }

    if (formData.vibeTags.length < 1 || formData.vibeTags.length > 4) {
      newErrors.vibeTags = "Pick between 1 and 4 vibes.";
    }

    if (formData.notes && formData.notes.length > 500) {
      newErrors.notes = "Notes must be under 500 characters.";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const toggleVibe = (vibe: string) => {
    setFormData((prev) => {
      const exists = prev.vibeTags.includes(vibe);
      if (exists) return { ...prev, vibeTags: prev.vibeTags.filter((t) => t !== vibe) };
      if (prev.vibeTags.length >= 4) return prev;
      return { ...prev, vibeTags: [...prev.vibeTags, vibe] };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    const shareToken = generateShareToken();
    try {
      // 1. Save to Firestore
      const tripDocRef = doc(db, "trips", shareToken);
      try {
        await setDoc(tripDocRef, {
          ...formData,
          ownerId: auth.currentUser?.uid || "anonymous",
          shareToken,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `trips/${shareToken}`);
      }

      // 2. Call Gemini via Proxy
      const nights = Math.ceil((new Date(formData.endDate).getTime() - new Date(formData.startDate).getTime()) / (1000 * 60 * 60 * 24));
      const brief = `Trip Brief: Destination: ${formData.destination}. Dates: ${formData.startDate} to ${formData.endDate} (${nights} nights). Group size: ${formData.groupSize}. Budget per person: USD ${formData.budgetPerPerson}. Vibe tags (weighted): ${formData.vibeTags.join(", ")}. Pace: ${formData.pace}. Additional notes: ${formData.notes || 'none'}. Generate an itinerary`;

      const response = await fetch("/api/generate-itinerary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripBrief: brief }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to generate itinerary");
      }
      const itinerary = await response.json();

      // 3. Update Firestore with itinerary
      try {
        await updateDoc(tripDocRef, {
          itinerary,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `trips/${shareToken}`);
      }

      setSuccess(true);
      setTimeout(() => navigate(`/trip/${shareToken}`), 1000);
    } catch (err: any) {
      console.error("Error:", err);
      setErrors({ submit: err.message || "Something went wrong. Please try again." });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-brand-sand p-6 text-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
          className="mb-8"
        >
          <Sparkles className="w-16 h-16 text-brand-coral" />
        </motion.div>
        <AnimatePresence mode="wait">
          <motion.h2
            key={loadingStep}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="text-3xl font-serif italic text-brand-teal"
          >
            {LOADING_MESSAGES[loadingStep]}
          </motion.h2>
        </AnimatePresence>
        <p className="mt-4 text-brand-teal/40 text-sm tracking-widest uppercase font-bold">Crafting your perfect trip...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-sand pb-20 selection:bg-brand-coral/20">
      <div className="max-w-3xl mx-auto px-6 pt-12 flex items-center justify-between sticky top-0 bg-brand-sand/80 backdrop-blur-md z-[60] py-4 mb-8">
        <motion.button 
          whileHover={{ x: -4 }}
          onClick={() => navigate("/")} 
          className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-brand-teal/40 hover:text-brand-coral transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Cancel
        </motion.button>
        <div className="flex flex-col items-center">
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-brand-teal/20">Planning Mode</span>
          <span className="text-sm font-serif italic text-brand-teal">Your Next Adventure</span>
        </div>
        <div className="w-12" />
      </div>

      <main className="max-w-xl mx-auto px-6">
        <header className="mb-12 space-y-4">
          <h1 className="text-5xl md:text-6xl font-serif italic text-brand-teal leading-tight">Tell us about your trip.</h1>
          <p className="text-brand-teal/40 font-light italic text-lg decoration-brand-coral/20 underline decoration-2 underline-offset-8">
            The more we know, the better the discovery.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-16">
          {/* Destination */}
          <section className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-brand-teal/5 flex items-center justify-center text-[10px] font-black text-brand-teal">01</div>
              <label className="text-xs font-black uppercase tracking-[0.2em] text-brand-teal/40">Where to?</label>
            </div>
            <div className="relative group">
              <MapPin className="absolute left-6 top-1/2 -translate-y-1/2 w-6 h-6 text-brand-coral/40 group-focus-within:text-brand-coral transition-colors" />
              <input
                type="text"
                placeholder="e.g., Kyoto, Japan"
                className={`w-full bg-white border-2 rounded-[2rem] pl-16 pr-8 py-6 text-xl md:text-2xl font-medium focus:outline-none focus:ring-4 transition-all shadow-sm ${
                  errors.destination ? "border-red-200 focus:ring-red-50 focus:border-red-400" : "border-brand-teal/[0.03] focus:ring-brand-coral/5 focus:border-brand-coral/30"
                }`}
                value={formData.destination}
                onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
              />
              <div className="absolute right-6 top-1/2 -translate-y-1/2 opacity-0 group-focus-within:opacity-100 transition-opacity">
                <Sparkles className="w-5 h-5 text-brand-accent animate-pulse" />
              </div>
            </div>
            {errors.destination && <p className="text-red-500 text-[10px] font-black uppercase tracking-widest pl-6">{errors.destination}</p>}
          </section>

          {/* Dates */}
          <section className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-brand-teal/5 flex items-center justify-center text-[10px] font-black text-brand-teal">02</div>
              <label className="text-xs font-black uppercase tracking-[0.2em] text-brand-teal/40">When are you going?</label>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="relative group">
                <Calendar className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-brand-coral/40 group-focus-within:text-brand-coral transition-colors" />
                <input
                  type="date"
                  className={`w-full bg-white border-2 rounded-2xl pl-14 pr-6 py-5 focus:outline-none transition-all shadow-sm ${
                    errors.startDate ? "border-red-200" : "border-brand-teal/[0.03] focus:border-brand-coral/30"
                  }`}
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                />
                <span className="absolute -top-3 left-6 bg-brand-sand px-2 text-[9px] font-black uppercase tracking-widest text-brand-teal/30">Departure</span>
              </div>
              <div className="relative group">
                <Calendar className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-brand-coral/40 group-focus-within:text-brand-coral transition-colors" />
                <input
                  type="date"
                  className={`w-full bg-white border-2 rounded-2xl pl-14 pr-6 py-5 focus:outline-none transition-all shadow-sm ${
                    errors.endDate ? "border-red-200" : "border-brand-teal/[0.03] focus:border-brand-coral/30"
                  }`}
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                />
                <span className="absolute -top-3 left-6 bg-brand-sand px-2 text-[9px] font-black uppercase tracking-widest text-brand-teal/30">Return</span>
              </div>
            </div>
            {(errors.startDate || errors.endDate) && (
              <p className="text-red-500 text-[10px] font-black uppercase tracking-widest pl-6">
                {errors.startDate || errors.endDate}
              </p>
            )}
          </section>

          {/* Group & Budget */}
          <section className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-brand-teal/5 flex items-center justify-center text-[10px] font-black text-brand-teal">03</div>
              <label className="text-xs font-black uppercase tracking-[0.2em] text-brand-teal/40">Details & Resources</label>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-brand-teal/30">
                  <Users className="w-3.5 h-3.5" /> Group Size
                </label>
                <div className="flex items-center gap-4 bg-white border-2 border-brand-teal/[0.03] rounded-2xl p-2 shadow-sm">
                  <button type="button" onClick={() => setFormData(p => ({...p, groupSize: Math.max(1, p.groupSize - 1)}))} className="w-12 h-12 rounded-xl bg-brand-sand hover:bg-brand-teal/5 flex items-center justify-center transition-colors">
                    <span className="text-xl font-bold text-brand-teal">-</span>
                  </button>
                  <div className="flex-1 text-center">
                    <span className="text-2xl font-bold text-brand-teal">{formData.groupSize}</span>
                    <span className="text-[10px] block font-black uppercase tracking-tighter opacity-30 mt-[-4px]">People</span>
                  </div>
                  <button type="button" onClick={() => setFormData(p => ({...p, groupSize: Math.min(12, p.groupSize + 1)}))} className="w-12 h-12 rounded-xl bg-brand-sand hover:bg-brand-teal/5 flex items-center justify-center transition-colors">
                    <span className="text-xl font-bold text-brand-teal">+</span>
                  </button>
                </div>
              </div>
              <div className="space-y-4">
                <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-brand-teal/30">
                  <DollarSign className="w-3.5 h-3.5" /> Budget (USD)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    className="w-full bg-white border-2 border-brand-teal/[0.03] rounded-2xl p-5 text-xl font-bold text-brand-teal focus:outline-none focus:border-brand-coral/30 shadow-sm transition-all"
                    value={formData.budgetPerPerson}
                    onChange={(e) => setFormData({ ...formData, budgetPerPerson: parseInt(e.target.value) || 0 })}
                  />
                  <span className="absolute right-6 top-1/2 -translate-y-1/2 text-[10px] font-black uppercase tracking-widest text-brand-teal/20">Per Person</span>
                </div>
                {errors.budgetPerPerson && <p className="text-red-500 text-[10px] font-black uppercase tracking-widest">{errors.budgetPerPerson}</p>}
              </div>
            </div>
          </section>

          {/* Vibes */}
          <section className="space-y-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-brand-teal/5 flex items-center justify-center text-[10px] font-black text-brand-teal">04</div>
                <label className="text-xs font-black uppercase tracking-[0.2em] text-brand-teal/40">The Vibe</label>
              </div>
              <span className="text-[10px] font-black text-brand-teal/20 uppercase tracking-[0.2em]">{formData.vibeTags.length} of 4 Selected</span>
            </div>
            <div className="flex flex-wrap gap-3">
              {VIBE_OPTIONS.map((v) => {
                const isActive = formData.vibeTags.includes(v);
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => toggleVibe(v)}
                    className={`px-6 py-3.5 rounded-2xl text-sm font-bold border-2 transition-all flex items-center gap-2 ${
                      isActive
                        ? "bg-brand-teal text-white border-brand-teal shadow-lg shadow-brand-teal/20"
                        : "bg-white text-brand-teal/50 border-brand-teal/[0.03] hover:border-brand-teal/10 hover:bg-brand-sand"
                    }`}
                  >
                    {isActive && <Check className="w-3.5 h-3.5" />}
                    {v}
                  </button>
                );
              })}
            </div>
            {errors.vibeTags && <p className="text-red-500 text-[10px] font-black uppercase tracking-widest pl-2">{errors.vibeTags}</p>}
          </section>

          {/* Pace */}
          <section className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-brand-teal/5 flex items-center justify-center text-[10px] font-black text-brand-teal">05</div>
              <label className="text-xs font-black uppercase tracking-[0.2em] text-brand-teal/40">Preferred Pace</label>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {PACES.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setFormData({ ...formData, pace: p.label })}
                  className={`flex flex-col items-center justify-center p-6 rounded-[2rem] border-2 transition-all space-y-2 ${
                    formData.pace === p.label
                      ? "bg-brand-teal/[0.02] border-brand-teal text-brand-teal shadow-inner"
                      : "bg-white border-brand-teal/[0.03] text-brand-teal/40 hover:border-brand-teal/10"
                  }`}
                >
                  <p className="font-bold text-sm tracking-tight">{p.label}</p>
                  <p className="text-[9px] uppercase tracking-tighter font-black opacity-40">{p.desc.split(' ')[0]}</p>
                </button>
              ))}
            </div>
          </section>

          {/* Notes */}
          <section className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-brand-teal/5 flex items-center justify-center text-[10px] font-black text-brand-teal">06</div>
              <label className="text-xs font-black uppercase tracking-[0.2em] text-brand-teal/40">Type your trip brief</label>
            </div>
            <textarea
              placeholder="Any specific requests? 'Focus on photography spots', 'Need vegan options', 'No high-rise viewpoints'..."
              className="w-full bg-white border-2 border-brand-teal/[0.03] rounded-[2rem] p-8 min-h-[160px] focus:outline-none focus:border-brand-coral/30 shadow-sm text-lg font-light italic leading-relaxed"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            />
            {errors.notes && <p className="text-red-500 text-[10px] font-black uppercase tracking-widest">{errors.notes}</p>}
          </section>

          {errors.submit && <div className="bg-red-50 text-red-600 p-6 rounded-[2rem] text-sm font-bold border border-red-100 flex items-center gap-4 animate-pulse"><AlertCircle className="w-6 h-6 flex-shrink-0" /> {errors.submit}</div>}

          <motion.button
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
            type="submit"
            className="w-full py-6 bg-brand-coral text-white rounded-[2rem] font-bold text-xl shadow-2xl shadow-brand-coral/30 hover:bg-[#ff8a6c] transition-all flex items-center justify-center gap-4 mt-8"
          >
            Create My Itinerary
            <Sparkles className="w-6 h-6" />
          </motion.button>
        </form>
      </main>
    </div>
  );
}
