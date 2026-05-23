import { motion, AnimatePresence } from "motion/react";
import { ArrowRight, Plane, Users, Calendar, LogIn, LogOut, MapPin, Share2, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "firebase/auth";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { auth, db, handleFirestoreError, OperationType } from "../lib/firebase";
import Footer from "./Footer";

export default function LandingPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState(auth.currentUser);
  const [trips, setTrips] = useState<any[]>([]);
  const [sharedTrips, setSharedTrips] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        fetchUserTrips(u);
      } else {
        setTrips([]);
        setSharedTrips([]);
      }
    });
    return () => unsubscribe();
  }, []);

  const fetchUserTrips = async (u: any) => {
    setLoading(true);
    try {
      // Query owned trips
      const ownedQuery = query(
        collection(db, "trips"),
        where("ownerId", "==", u.uid)
      );
      const ownedSnap = await getDocs(ownedQuery).catch(err => {
        handleFirestoreError(err, OperationType.LIST, "trips (owned)");
        throw err;
      });
      // Sort client-side
      const ownedData = ownedSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      ownedData.sort((a: any, b: any) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
      setTrips(ownedData);

      // Query shared trips (if email is available)
      if (u.email) {
        const sharedQuery = query(
          collection(db, "trips"),
          where("sharedEmails", "array-contains", u.email)
        );
        const sharedSnap = await getDocs(sharedQuery).catch(err => {
          handleFirestoreError(err, OperationType.LIST, "trips (shared)");
          throw err;
        });
        // Sort client-side
        const sharedData = sharedSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        sharedData.sort((a: any, b: any) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
        setSharedTrips(sharedData);
      }
    } catch (err) {
      console.error("Error fetching trips:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (loggingIn) return;
    setLoggingIn(true);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      if (err.code !== 'auth/cancelled-popup-request' && err.code !== 'auth/popup-closed-by-user') {
        console.error("Login Error:", err);
      }
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Logout Error:", err);
    }
  };

  return (
    <div className="min-h-screen bg-brand-sand selection:bg-brand-coral/20">
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-brand-sand/80 backdrop-blur-md border-b border-brand-teal/5 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer group" onClick={() => navigate("/")}>
            <div className="p-2 bg-brand-teal rounded-lg transition-transform group-hover:rotate-12">
              <Plane className="w-5 h-5 text-white" />
            </div>
            <span className="text-2xl font-bold tracking-tight text-brand-teal">
              travlly<span className="text-[17px] font-bold tracking-normal text-brand-teal/60 ml-0.5 leading-[28px] text-justify bg-transparent">1.6</span>
            </span>
          </div>
          <div className="flex items-center gap-6">
            {user ? (
              <div className="flex items-center gap-4">
                <div className="hidden sm:block text-right">
                  <p className="text-xs font-bold text-brand-teal tracking-tight">{user.displayName}</p>
                  <p className="text-[10px] text-brand-teal/40 font-medium">{user.email}</p>
                </div>
                {user.photoURL ? (
                  <img src={user.photoURL} className="w-9 h-9 rounded-full border-2 border-brand-teal/10 shadow-sm" alt="Avatar" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-brand-teal/5 border border-brand-teal/10 flex items-center justify-center text-brand-teal font-bold text-xs uppercase">
                    {user.displayName?.charAt(0)}
                  </div>
                )}
                <button 
                  onClick={handleLogout} 
                  className="p-2 text-brand-teal/40 hover:text-brand-coral hover:bg-brand-coral/5 rounded-full transition-all"
                  title="Sign Out"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <button 
                onClick={handleLogin}
                disabled={loggingIn}
                className="flex items-center gap-2 px-6 py-2.5 bg-brand-teal text-white rounded-full text-xs font-bold uppercase tracking-widest hover:bg-brand-teal/90 hover:shadow-lg hover:shadow-brand-teal/20 transition-all disabled:opacity-50"
              >
                {loggingIn ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <LogIn className="w-4 h-4" />
                )}
                {loggingIn ? "Connecting..." : "Sign In"}
              </button>
            )}
          </div>
        </div>
      </nav>

      <div className="relative pt-32 pb-20 px-6 max-w-6xl mx-auto">
        {/* Soft decorative elements */}
        <div className="absolute top-20 -right-20 w-[400px] h-[400px] bg-brand-coral/5 rounded-full blur-[80px] pointer-events-none" />
        <div className="absolute top-1/2 -left-20 w-[300px] h-[300px] bg-brand-accent/10 rounded-full blur-[60px] pointer-events-none" />
        
        {user ? (
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-16"
          >
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-10">
              <div className="space-y-4">
                <h1 className="text-5xl md:text-7xl font-serif italic text-brand-teal leading-tight">
                  Bonjour, {user.displayName?.split(' ')[0]}
                </h1>
                <p className="text-brand-teal/50 font-light italic text-xl md:text-2xl max-w-lg">
                  Every journey tells a story. What's the next chapter of yours?
                </p>
              </div>
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => navigate("/trip/create")}
                className="flex items-center gap-3 px-10 py-5 bg-brand-coral text-white rounded-2xl font-bold shadow-xl shadow-brand-coral/20 hover:bg-[#ff8a6c] transition-all"
              >
                Design a New Trip <ArrowRight className="w-5 h-5" />
              </motion.button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1.2fr,0.8fr] gap-16">
              {/* My Trips */}
              <div className="space-y-8">
                <div className="flex items-center gap-4">
                  <h2 className="text-xs uppercase font-black tracking-[0.2em] text-brand-teal/40">My Collections</h2>
                  <div className="flex-1 h-px bg-brand-teal/5" />
                </div>
                
                {loading ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {[1, 2].map(i => <div key={i} className="h-64 bg-white/50 animate-pulse rounded-[2.5rem]" />)}
                  </div>
                ) : trips.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {trips.map(trip => <TripCard key={trip.id} trip={trip} onClick={() => navigate(`/trip/${trip.shareToken || trip.id}`)} />)}
                  </div>
                ) : (
                  <div className="bg-white/40 border border-brand-teal/5 rounded-[3rem] p-16 text-center space-y-6">
                    <div className="w-16 h-16 bg-brand-sand rounded-full flex items-center justify-center mx-auto border border-brand-teal/5">
                      <Plane className="w-6 h-6 text-brand-teal/20" />
                    </div>
                    <p className="text-brand-teal/40 italic font-light text-lg">Your passport is waiting for its first stamp.</p>
                    <button onClick={() => navigate("/trip/create")} className="text-brand-coral font-bold text-sm underline underline-offset-8 hover:opacity-80 transition-opacity">Start planning →</button>
                  </div>
                )}
              </div>

              {/* Shared with Me */}
              <div className="space-y-8">
                <div className="flex items-center gap-4">
                  <h2 className="text-xs uppercase font-black tracking-[0.2em] text-brand-coral/40">Shared Itineraries</h2>
                  <div className="flex-1 h-px bg-brand-coral/10" />
                </div>
                <div className="space-y-6">
                  {loading ? (
                    <div className="h-40 bg-white/50 animate-pulse rounded-[2.5rem]" />
                  ) : sharedTrips.length > 0 ? (
                    sharedTrips.map(trip => <TripCard key={trip.id} trip={trip} isShared onClick={() => navigate(`/trip/${trip.shareToken || trip.id}`)} />)
                  ) : (
                    <div className="bg-brand-coral/[0.02] border border-brand-coral/5 rounded-[2.5rem] p-10 text-center space-y-4">
                      <Share2 className="w-8 h-8 text-brand-coral/10 mx-auto" />
                      <p className="font-light italic text-brand-teal/30 text-sm leading-relaxed">
                        When someone shares a trip with you, it'll appear here for easy reference.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <div className="flex flex-col items-center justify-center text-center space-y-20 min-h-[70vh]">
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-12 max-w-3xl"
            >
              <div className="space-y-6">
                <h1 className="text-7xl md:text-[8rem] font-bold tracking-tighter leading-[0.8] text-brand-teal">
                  travlly
                </h1>
                <p className="text-2xl md:text-4xl font-serif italic text-brand-coral">
                  "your travel ally"
                </p>
              </div>

              <p className="text-xl md:text-2xl text-brand-teal/60 font-light leading-relaxed max-w-xl mx-auto">
                Transform a vibe into a voyage. AI-crafted itineraries, shared with anyone, accessible anywhere.
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-10 pt-8">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => navigate("/trip/create")}
                  className="group px-12 py-5 bg-brand-coral text-white rounded-2xl font-bold text-lg shadow-2xl shadow-brand-coral/30 hover:bg-[#ff8a6c] transition-all flex items-center gap-3"
                >
                  Plan Your Escape <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </motion.button>
                
                <div className="flex items-center gap-4">
                  <div className="flex -space-x-3">
                    {[1, 2, 3].map(i => (
                      <div key={i} className={`w-12 h-12 rounded-full border-[3px] border-brand-sand shadow-inner flex items-center justify-center text-sm font-bold text-white bg-brand-teal overflow-hidden`}>
                        <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${i+20}`} alt="User" />
                      </div>
                    ))}
                    <div className="w-12 h-12 rounded-full border-[3px] border-brand-sand bg-brand-accent flex items-center justify-center text-xs font-bold text-brand-teal shadow-inner">
                      +
                    </div>
                  </div>
                  <div className="text-left">
                    <span className="block text-sm font-bold text-brand-teal tracking-tight line-height-1">Trusted by Explorers</span>
                    <span className="block text-[10px] text-brand-teal/40 font-black uppercase tracking-widest italic">Since v1.0</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </div>

      {/* Feature Footer */}
      {!user && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.6 }}
          transition={{ delay: 0.5 }}
          className="flex flex-wrap justify-center items-center gap-10 pb-20 px-6 max-w-4xl mx-auto"
        >
          <FeaturePill icon={<Users className="w-4 h-4" />} label="Group-First Design" />
          <div className="hidden sm:block w-1.5 h-1.5 rounded-full bg-brand-teal/20" />
          <FeaturePill icon={<Calendar className="w-4 h-4" />} label="Real-time Polish" />
          <div className="hidden sm:block w-1.5 h-1.5 rounded-full bg-brand-teal/20" />
          <FeaturePill icon={<Plane className="w-4 h-4" />} label="Gemini Powered" />
        </motion.div>
      )}

      <div className="max-w-6xl mx-auto pb-10">
        <Footer />
      </div>
    </div>
  );
}

function TripCard({ trip, onClick, isShared = false }: any) {
  return (
    <motion.div 
      whileHover={{ y: -6, scale: 1.01 }}
      onClick={onClick}
      className="bg-white rounded-[2.5rem] p-10 border border-brand-teal/[0.03] shadow-sm hover:shadow-2xl hover:shadow-brand-teal/5 transition-all cursor-pointer group relative overflow-hidden"
    >
      {isShared && (
        <div className="absolute top-0 right-0 bg-brand-coral/10 text-brand-coral px-5 py-2.5 rounded-bl-[1.5rem] text-[9px] font-black uppercase tracking-[0.2em] flex items-center gap-2">
          <Share2 className="w-3 h-3" /> Shared
        </div>
      )}
      <div className="space-y-8">
        <div className="space-y-2">
          <h3 className="text-3xl md:text-4xl font-serif group-hover:text-brand-coral transition-colors italic leading-tight">{trip.destination}</h3>
          <div className="flex items-center gap-6 text-brand-teal/40 text-[10px] font-black uppercase tracking-widest">
            <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-brand-coral" /> {trip.startDate}</span>
            <span className="flex items-center gap-1.5 text-brand-accent"><MapPin className="w-3.5 h-3.5" /> {trip.pace} Pace</span>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-2 pt-2">
          {trip.vibeTags?.map((tag: string) => (
            <span key={tag} className="text-[9px] font-bold uppercase tracking-[0.15em] text-brand-teal/50 bg-brand-sand px-4 py-1.5 rounded-full border border-brand-teal/[0.05]">
              {tag}
            </span>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

function FeaturePill({ icon, label }: { icon: any, label: string }) {
  return (
    <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold text-brand-teal">
      {icon} {label}
    </div>
  );
}

