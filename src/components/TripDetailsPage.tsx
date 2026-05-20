import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { collection, query, where, getDocs, getDoc, onSnapshot, doc, setDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { MapPin, Calendar, Clock, DollarSign, ArrowLeft, AlertCircle, Share2, Sparkles, Plane, LogOut, Sun, Cloud, CloudRain, Snowflake, Wind, Thermometer, Shirt, Briefcase } from "lucide-react";

export default function TripDetailsPage() {
  const { shareToken } = useParams();
  const navigate = useNavigate();
  const [trip, setTrip] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [voterId, setVoterId] = useState<string>("");
  const [votes, setVotes] = useState<any[]>([]);
  const [weatherData, setWeatherData] = useState<any>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);

  // Generate or retrieve anonymous voter ID on mount
  useEffect(() => {
    let id = localStorage.getItem("travlly_voter_id");
    if (!id) {
      id = "voter_" + Math.random().toString(36).substring(2, 11) + "_" + Date.now().toString(36);
      localStorage.setItem("travlly_voter_id", id);
    }
    setVoterId(id);
  }, []);

  useEffect(() => {
    async function fetchTrip() {
      if (!shareToken) return;
      try {
        // Try direct document lookup (GET rule is open to anyone with the exact shareToken doc id)
        const docRef = doc(db, "trips", shareToken);
        const docSnap = await getDoc(docRef).catch(() => null);

        if (docSnap && docSnap.exists()) {
          setTrip({ id: docSnap.id, ...docSnap.data() });
        } else {
          // Fallback for any older legacy documents that have randomized ids
          const q = query(collection(db, "trips"), where("shareToken", "==", shareToken));
          const querySnapshot = await getDocs(q).catch(err => {
            handleFirestoreError(err, OperationType.LIST, "trips (by shareToken fallback)");
            throw err;
          });

          if (!querySnapshot.empty) {
            const docSnapFallback = querySnapshot.docs[0];
            setTrip({ id: docSnapFallback.id, ...docSnapFallback.data() });
          } else {
            setError("Trip not found. Check the link and try again.");
          }
        }
      } catch (err: any) {
        console.error("Error fetching trip:", err);
        setError("Something went wrong. Please try again in a moment.");
      } finally {
        setLoading(false);
      }
    }
    fetchTrip();
  }, [shareToken]);

  // Listen to real-time votes on this trip
  useEffect(() => {
    if (!trip?.id) return;

    const votesQ = query(
      collection(db, "activity_votes"),
      where("trip_id", "==", trip.id)
    );

    const unsubscribe = onSnapshot(votesQ, (snapshot) => {
      const votesList: any[] = [];
      snapshot.forEach((doc) => {
        votesList.push({ id: doc.id, ...doc.data() });
      });
      setVotes(votesList);
    }, (err) => {
      console.error("Error listening to votes:", err);
      handleFirestoreError(err, OperationType.GET, "activity_votes listener");
    });

    return () => unsubscribe();
  }, [trip?.id]);

  // Fetch seasonal weather prep info dynamically based on destination & start date
  useEffect(() => {
    if (!trip?.itinerary?.trip_metadata) return;
    async function fetchWeather() {
      setWeatherLoading(true);
      try {
        const metadata = trip.itinerary.trip_metadata;
        const dest = metadata.destination_resolved || trip.destination || "";
        const start = metadata.trip_start_date || trip.startDate || "";
        const res = await fetch(`/api/weather-info?destination=${encodeURIComponent(dest)}&date=${encodeURIComponent(start)}`);
        if (res.ok) {
          const data = await res.json();
          setWeatherData(data);
        }
      } catch (e) {
        console.error("Failed to fetch weather details:", e);
      } finally {
        setWeatherLoading(false);
      }
    }
    fetchWeather();
  }, [trip]);

  const handleVote = async (activityId: string, voteType: "like" | "dislike") => {
    if (!trip?.id || !voterId) return;

    const voteDocId = `${voterId}_${activityId}`;
    const voteRef = doc(db, "activity_votes", voteDocId);

    // Find if we already have a vote for this activity
    const existingVote = votes.find(v => v.activity_id === activityId && v.voter_id === voterId);

    try {
      if (existingVote && existingVote.vote_type === voteType) {
        // Toggle off: if clicked the same option again, delete the vote document
        await deleteDoc(voteRef);
      } else {
        // Save or update vote to the chosen type
        await setDoc(voteRef, {
          activity_id: activityId,
          trip_id: trip.id,
          voter_id: voterId,
          vote_type: voteType,
          created_at: serverTimestamp(),
        });
      }
    } catch (err: any) {
      console.error("Error saving vote:", err);
      handleFirestoreError(err, OperationType.WRITE, `activity_votes/${voteDocId}`);
    }
  };

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-sand">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
          className="w-12 h-12 border-t-2 border-brand-coral rounded-full" 
        />
      </div>
    );
  }

  if (error || !trip || !trip.itinerary) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-brand-sand p-6 text-center space-y-8">
        <div className="p-6 bg-white rounded-full border border-brand-teal/5 shadow-xl">
          <AlertCircle className="w-16 h-16 text-brand-coral" />
        </div>
        <div className="space-y-4">
          <h2 className="text-4xl font-serif italic text-brand-teal">{error || "Itinerary Not Found"}</h2>
          <p className="text-brand-teal/40 italic font-light">We couldn't find the trip details or it's still being crafted by your ally.</p>
        </div>
        <button onClick={() => navigate("/")} className="px-10 py-4 bg-brand-teal text-white rounded-2xl font-bold transition-all hover:bg-brand-coral shadow-xl shadow-brand-teal/20">Return Home</button>
      </div>
    );
  }

  const { trip_metadata, days } = trip.itinerary;

  return (
    <div className="min-h-screen bg-brand-sand pb-32 selection:bg-brand-coral/20">
      {/* Sticky Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-brand-sand/80 backdrop-blur-md border-b border-brand-teal/5 py-4 px-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <motion.button 
            whileHover={{ x: -4 }}
            onClick={() => navigate("/")} 
            className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-brand-teal/40 hover:text-brand-coral transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Dashboard
          </motion.button>
          
          <div className="flex flex-col items-center">
            <h1 className="text-xl md:text-2xl font-serif italic text-brand-teal leading-none">{trip_metadata.destination_resolved}</h1>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleShare}
              className="flex items-center gap-2 px-5 py-2.5 bg-brand-teal text-white rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-brand-teal/90 shadow-lg shadow-brand-teal/10 transition-all"
            >
              <Share2 className="w-3.5 h-3.5" /> {copied ? "Copied!" : "Share Link"}
            </button>
          </div>
        </div>
      </header>

      <main className="pt-32 px-6 max-w-4xl mx-auto space-y-24">
        {/* Intro */}
        <motion.section 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-8"
        >
          <div className="inline-flex items-center gap-3 px-5 py-2 bg-brand-accent/10 rounded-full border border-brand-accent/20">
            <Sparkles className="w-4 h-4 text-brand-coral" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-teal/60">Curated Journey</span>
          </div>
          
          <div className="space-y-4">
            <h2 className="text-6xl md:text-8xl font-serif italic text-brand-teal tracking-tighter">
              {trip_metadata.destination_resolved}
            </h2>
            <p className="text-xl md:text-2xl font-light text-brand-teal/40 italic max-w-lg mx-auto leading-relaxed underline decoration-brand-coral/10 underline-offset-8 decoration-2 text-wrap">
              {trip.notes || "A bespoke escape designed for discovery and wonder."}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-10 pt-4">
            <div className="flex flex-col items-center">
              <span className="text-[10px] font-black uppercase tracking-widest text-brand-teal/20 mb-1">Duration</span>
              <span className="text-sm font-bold text-brand-teal">{trip_metadata.total_days} Days</span>
            </div>
            <div className="w-1 h-1 rounded-full bg-brand-teal/10" />
            <div className="flex flex-col items-center">
              <span className="text-[10px] font-black uppercase tracking-widest text-brand-teal/20 mb-1">Group</span>
              <span className="text-sm font-bold text-brand-teal">{trip.groupSize} People</span>
            </div>
            <div className="w-1 h-1 rounded-full bg-brand-teal/10" />
            <div className="flex flex-col items-center">
              <span className="text-[10px] font-black uppercase tracking-widest text-brand-teal/20 mb-1">Est. Cost</span>
              <span className="text-sm font-bold text-brand-accent">${trip_metadata.total_estimated_cost_usd}</span>
            </div>
          </div>
        </motion.section>

        {/* Weather & Seasonal Intel */}
        {(weatherLoading || weatherData) && (
          <motion.section 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white/50 backdrop-blur-md rounded-3xl p-6 md:p-8 border border-brand-teal/5 shadow-xl shadow-brand-teal/[0.01]"
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-brand-teal/5">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-brand-coral/10 flex items-center justify-center text-brand-coral shrink-0">
                  {weatherLoading ? (
                    <div className="w-5 h-5 border-2 border-brand-coral border-t-transparent rounded-full animate-spin" />
                  ) : (
                    getWeatherIcon(weatherData?.weather_icon)
                  )}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-brand-teal">Seasonal Climate & Packing advice</h3>
                </div>
              </div>
              {weatherData && (
                <div className="flex flex-wrap items-center gap-2 bg-brand-teal/[0.03] border border-brand-teal/5 px-4 py-2 rounded-2xl">
                  <span className="text-xs font-bold text-brand-teal">{weatherData.month}</span>
                  <span className="w-1 h-1 rounded-full bg-brand-teal/20" />
                  <span className="text-xs font-black uppercase tracking-wider text-brand-coral">{weatherData.season}</span>
                  <span className="w-1 h-1 rounded-full bg-brand-teal/20" />
                  <span className="text-xs font-bold text-brand-teal tabular-nums">{weatherData.average_temp}</span>
                </div>
              )}
            </div>

            {weatherLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 animate-pulse">
                <div className="space-y-2">
                  <div className="h-4 bg-brand-teal/10 rounded w-1/3"></div>
                  <div className="h-8 bg-brand-teal/5 rounded"></div>
                </div>
                <div className="space-y-2">
                  <div className="h-4 bg-brand-teal/10 rounded w-1/3"></div>
                  <div className="h-8 bg-brand-teal/5 rounded"></div>
                </div>
              </div>
            ) : (
              weatherData && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-6">
                  {/* Climate Overview */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-brand-teal/30">
                      <Thermometer className="w-3.5 h-3.5 text-brand-coral shrink-0" /> Usual Conditions
                    </div>
                    <p className="text-sm text-brand-teal/70 leading-relaxed font-light">
                      {weatherData.weather_conditions}
                    </p>
                  </div>

                  {/* Packing & Preparation */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-brand-teal/30">
                      <Shirt className="w-3.5 h-3.5 text-brand-coral shrink-0" /> Packing & items to prepare
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs text-brand-teal/70 leading-relaxed">
                        <strong className="text-[10px] uppercase tracking-wider text-brand-teal inline-block mr-1">Apparel:</strong> {weatherData.apparel_prep}
                      </p>
                      {weatherData.gear_prep && (
                        <p className="text-xs text-brand-teal/70 leading-relaxed">
                          <strong className="text-[10px] uppercase tracking-wider text-brand-teal inline-block mr-1">Gear & Essentials:</strong> {weatherData.gear_prep}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )
            )}
          </motion.section>
        )}

        {/* Itinerary Body */}
        <section className="space-y-32">
          {days.map((day: any, idx: number) => (
            <motion.div
              layout
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              key={idx}
              className="space-y-12"
            >
              {/* Day Header - Non-floating, paired elegantly at the top */}
              <div className="flex items-center gap-6 pb-4 border-b border-brand-teal/5">
                <div className="w-16 h-16 shrink-0 rounded-full bg-brand-teal flex items-center justify-center text-white font-serif italic text-2xl shadow-xl shadow-brand-teal/15">
                  {day.day_number}
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-[0.3em] text-brand-coral">Day {day.day_number}</span>
                  <h3 className="text-3xl md:text-4xl font-serif italic text-brand-teal leading-tight">{formatDate(day.date, trip_metadata.trip_start_date)}</h3>
                </div>
              </div>

              {/* Day Contents */}
              <div className="space-y-12 pl-0 sm:pl-8">
                <div className="space-y-4">
                  <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.2em] text-brand-coral">
                    <Sparkles className="w-3.5 h-3.5" /> The Daily Theme
                  </div>
                  <p className="text-xl text-brand-teal/70 font-light leading-relaxed italic border-l-4 border-brand-accent/30 pl-6 py-1">
                    {day.day_notes}
                  </p>
                </div>

                <div className="space-y-8">
                  {day.activities.map((activity: any, aIdx: number) => {
                    const activityId = `${day.day_number}_${aIdx}`;
                    const likesCount = votes.filter(v => v.activity_id === activityId && v.vote_type === "like").length;
                    const dislikesCount = votes.filter(v => v.activity_id === activityId && v.vote_type === "dislike").length;
                    const userVote = votes.find(v => v.activity_id === activityId && v.voter_id === voterId);
                    const currentVoteType = userVote?.vote_type; // "like", "dislike", or undefined

                    return (
                      <motion.div 
                        key={aIdx}
                        whileHover={{ x: 6 }}
                        className="group relative pl-8 pb-12 border-l border-brand-teal/5 last:border-0"
                      >
                        <div className="absolute left-[-5px] top-1.5 w-2.5 h-2.5 rounded-full bg-brand-sand border-2 border-brand-accent group-hover:bg-brand-coral group-hover:border-brand-coral transition-colors" />
                        
                        <div className="space-y-4">
                          <div className="flex flex-wrap items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-black text-brand-teal/20 tabular-nums">{activity.start_time}</span>
                              <h4 className="text-2xl font-bold text-brand-teal group-hover:text-brand-coral transition-all leading-tight">
                                {activity.venue_name ? (
                                  <a
                                    href={getGoogleMapsLink(activity.venue_name, activity.neighborhood, trip_metadata.destination_resolved)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title="Open in Google Maps"
                                    className="inline-flex items-center gap-1.5 hover:underline decoration-brand-coral/30 hover:text-brand-coral decoration-2 underline-offset-4 transition-all"
                                  >
                                    <MapPin className="w-5 h-5 text-brand-coral/80 shrink-0" />
                                    <span>{activity.venue_name}</span>
                                  </a>
                                ) : (
                                  activity.name
                                )}
                              </h4>
                              <span className="px-3 py-1 bg-brand-accent/10 text-brand-teal text-[8px] font-black rounded-full uppercase tracking-widest border border-brand-accent/20">
                                {activity.category}
                              </span>
                            </div>
                            <a 
                              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${activity.venue_name} ${activity.neighborhood} ${trip_metadata.destination_resolved}`)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 px-4 py-1.5 bg-brand-teal/5 hover:bg-brand-teal/10 rounded-full text-[9px] font-bold uppercase tracking-widest text-brand-teal/60 transition-all opacity-0 group-hover:opacity-100"
                            >
                              <MapPin className="w-3 h-3" /> View on Maps
                            </a>
                          </div>
                          
                          <p className="text-brand-teal/50 text-base font-light font-sans max-w-2xl leading-relaxed">
                            {activity.description}
                          </p>

                          {/* Voting Row */}
                          <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-1">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleVote(activityId, "like")}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold tracking-wide transition-all active:scale-95 cursor-pointer shadow-sm ${
                                  currentVoteType === "like"
                                    ? "bg-brand-coral text-white border border-transparent shadow-brand-coral/25"
                                    : "bg-white hover:bg-brand-teal/5 text-brand-teal border border-brand-teal/10 hover:border-brand-coral/20"
                                }`}
                              >
                                <span>👍</span>
                                <span>Like {likesCount}</span>
                              </button>
                              
                              <button
                                onClick={() => handleVote(activityId, "dislike")}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold tracking-wide transition-all active:scale-95 cursor-pointer shadow-sm ${
                                  currentVoteType === "dislike"
                                    ? "bg-brand-teal text-white border border-transparent shadow-brand-teal/20"
                                    : "bg-white hover:bg-brand-teal/5 text-brand-teal border border-brand-teal/10 hover:border-brand-coral/20"
                                }`}
                              >
                                <span>👎</span>
                                <span>Dislike {dislikesCount}</span>
                              </button>
                            </div>
                            {currentVoteType && (
                              <span className="text-[10px] font-black uppercase tracking-[0.1em] text-brand-coral/80 flex items-center gap-1">
                                ✓ You voted {currentVoteType}
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-4 pt-2">
                            <span className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-brand-teal/30 bg-brand-teal/[0.02] px-3 py-1 rounded-md border border-brand-teal/[0.05]">
                              <Clock className="w-3 h-3 text-brand-accent" /> {activity.duration_minutes}m
                            </span>
                            <span className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-brand-teal/30 bg-brand-teal/[0.02] px-3 py-1 rounded-md border border-brand-teal/[0.05]">
                              <DollarSign className="w-3 h-3 text-brand-coral" /> ${activity.estimated_cost_usd}
                            </span>
                            <span className="text-[9px] font-medium text-brand-teal/30 italic flex flex-wrap items-center gap-1">
                              <span>{activity.neighborhood}</span>
                              {activity.name && activity.name !== activity.venue_name && (
                                <>
                                  <span className="opacity-60">—</span>
                                  <span className="font-semibold text-brand-teal/40">{activity.name}</span>
                                </>
                              )}
                            </span>
                          </div>

                          {activity.transit_notes && (
                            <div className="p-4 bg-brand-sand/50 rounded-xl border border-brand-teal/[0.03] text-sm italic font-light text-brand-teal/60">
                              {activity.transit_notes}
                            </div>
                          )}
                          
                          {activity.verify_hours && (
                            <div className="flex items-center gap-2 text-amber-600/60 text-[9px] font-bold uppercase tracking-widest">
                              <AlertCircle className="w-3.5 h-3.5" /> Security Check: Verify operating hours ahead of time
                            </div>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          ))}
        </section>

        {/* Footer Note */}
        <footer className="pt-20 border-t border-brand-teal/5 text-center space-y-8">
          <Plane className="w-10 h-10 text-brand-coral/20 mx-auto" />
          <p className="text-sm font-light italic text-brand-teal/30 leading-relaxed max-w-md mx-auto">
            This itinerary was thoughtfully prepared by <span className="font-bold text-brand-teal/40">travlly</span> AI specifically for your group's unique vibe. Safe travels.
          </p>
        </footer>
      </main>

      {/* Mobile Share Action */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] md:hidden">
        <button
          onClick={handleShare}
          className="flex items-center gap-3 px-8 py-4 bg-brand-coral text-white rounded-full font-bold shadow-2xl shadow-brand-coral/30 hover:scale-105 active:scale-95 transition-all text-sm"
        >
          <Share2 className="w-4 h-4" /> {copied ? "Link Copied" : "Share Itinerary"}
        </button>
      </div>

      <AnimatePresence>
        {copied && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-brand-teal text-white px-8 py-3 rounded-2xl shadow-2xl font-bold text-xs tracking-widest uppercase z-[110]"
          >
            URL Saved to Clipboard
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function getGoogleMapsLink(venueName: string, neighborhood: string, destination: string) {
  const combined = `${venueName || ""} ${neighborhood || ""} ${destination || ""}`.trim();
  return `https://www.google.com/maps/search/${encodeURIComponent(combined).replace(/%20/g, "+")}`;
}

function formatDate(dateStr?: string, tripStartYear?: string): string {
  if (!dateStr) return "";
  
  const s = dateStr.trim();
  
  // 1. Match YYYY-MM-DD
  const yyyymmdd = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (yyyymmdd) {
    const [_, year, month, day] = yyyymmdd;
    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];
    const monthIndex = parseInt(month, 10) - 1;
    const dayNum = parseInt(day, 10);
    return `${monthNames[monthIndex]} ${dayNum}, ${year}`;
  }
  
  // 2. Remove week names like Tuesday, etc. if present
  let cleaned = s.replace(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s*/i, "");
  
  // 3. Append missing year if needed
  if (!/\b(19|20)\d{2}\b/.test(cleaned)) {
    const yearMatch = tripStartYear ? tripStartYear.match(/^(\d{4})/) : null;
    const year = yearMatch ? yearMatch[1] : new Date().getFullYear().toString();
    if (cleaned) {
      cleaned = `${cleaned}, ${year}`;
    }
  }
  
  return cleaned;
}

function getWeatherIcon(iconName: string) {
  switch (iconName?.toLowerCase()) {
    case "sunny":
    case "hot":
      return <Sun className="w-8 h-8 text-amber-500 animate-[spin_5s_linear_infinite]" />;
    case "cloudy":
      return <Cloud className="w-8 h-8 text-sky-450" />;
    case "rainy":
      return <CloudRain className="w-8 h-8 text-blue-450 animate-bounce" />;
    case "snowy":
    case "cold":
      return <Snowflake className="w-8 h-8 text-teal-350 animate-pulse" />;
    case "windy":
      return <Wind className="w-8 h-8 text-teal-600" />;
    default:
      return <Sun className="w-8 h-8 text-amber-500 animate-[spin_5s_linear_infinite]" />;
  }
}

