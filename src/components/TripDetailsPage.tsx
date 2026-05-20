import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { collection, query, where, getDocs, getDoc, onSnapshot, doc, setDoc, deleteDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db, handleFirestoreError, OperationType, auth } from "../lib/firebase";
import { MapPin, Calendar, Clock, DollarSign, ArrowLeft, AlertCircle, Share2, Sparkles, Plane, LogOut, Sun, Cloud, CloudRain, Snowflake, Wind, Thermometer, Shirt, Briefcase, ChevronDown, ChevronUp, ThumbsUp, ThumbsDown, RotateCw, TrendingUp, Check } from "lucide-react";

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

  // Day Regeneration states
  const [itineraryDays, setItineraryDays] = useState<any[]>([]);
  const [showRegenModal, setShowRegenModal] = useState(false);
  const [selectedRegenDay, setSelectedRegenDay] = useState<number | null>(null);
  const [regenText, setRegenText] = useState("");
  const [regenChips, setRegenChips] = useState<string[]>([]);
  const [regeneratingLoading, setRegeneratingLoading] = useState(false);
  const [rotatingMessage, setRotatingMessage] = useState("");
  const [regenError, setRegenError] = useState<string | null>(null);
  const [regenAttempts, setRegenAttempts] = useState<{ [dayNum: number]: number }>({});
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Group Feedback Summary states
  const [feedbackDaysExpanded, setFeedbackDaysExpanded] = useState(false);
  const [feedbackRefreshing, setFeedbackRefreshing] = useState(false);
  const [activityVotesExpanded, setActivityVotesExpanded] = useState<{[key: string]: boolean}>({});

  // Helper to assign a pleasant anonymous name deterministically for a voter ID
  const getVoterLabel = (vid: string) => {
    if (vid === voterId) return "You";
    const hash = vid.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const adjectives = ["Adventurous", "Chill", "Foodie", "Explorer", "Curious", "Active"];
    const nouns = ["Hiker", "Traveler", "Flyer", "Food Lover", "Voyager", "Nomad"];
    const adj = adjectives[hash % adjectives.length];
    const noun = nouns[(hash >> 2) % nouns.length];
    return `${adj} ${noun}`;
  };

  // History modal states
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedHistoryDay, setSelectedHistoryDay] = useState<any>(null);
  const [copiedActivityId, setCopiedActivityId] = useState<string | null>(null);
  const [isOrganizer, setIsOrganizer] = useState(false);

  // Rotating loading message timer
  useEffect(() => {
    if (!regeneratingLoading) {
      setRotatingMessage("");
      return;
    }
    const messages = [
      `Regenerating Day ${selectedRegenDay}...`,
      "Considering your feedback...",
      "Almost ready..."
    ];
    let idx = 0;
    setRotatingMessage(messages[0]);
    const interval = setInterval(() => {
      idx = (idx + 1) % messages.length;
      setRotatingMessage(messages[idx]);
    }, 4000);
    return () => clearInterval(interval);
  }, [regeneratingLoading, selectedRegenDay]);

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

  // Listen to itinerary day updates / regenerations
  useEffect(() => {
    if (!trip?.id) return;

    const daysQ = collection(db, "trips", trip.id, "itinerary_days");
    const unsubscribe = onSnapshot(daysQ, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      setItineraryDays(list);
    }, (err) => {
      console.error("Error listening to itinerary days subcollection:", err);
    });

    return () => unsubscribe();
  }, [trip?.id]);

  // Determine if the user is the organizer of this trip
  useEffect(() => {
    if (!trip) return;
    const isOwner = !trip.ownerId || trip.ownerId === "anonymous" || (auth.currentUser && auth.currentUser.uid === trip.ownerId);
    setIsOrganizer(!!isOwner);
  }, [trip, auth.currentUser]);

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

  const handleRegenerateDaySubmit = async () => {
    if (!selectedRegenDay || !trip) return;
    setRegeneratingLoading(true);
    setRegenError(null);

    const dayNumber = selectedRegenDay;
    const originalDay = trip.itinerary?.days?.find((d: any) => d.day_number === dayNumber);

    // Collect activities with downvotes on this day to pass as feedback
    const dayActivitiesWithDislikes = (originalDay?.activities || []).map((act: any, idx: number) => {
      const activityId = `${dayNumber}_${idx}`;
      const dislikesCount = votes.filter(v => v.activity_id === activityId && v.vote_type === "dislike").length;
      return {
        name: act.venue_name || act.name,
        dislikes: dislikesCount,
        description: act.description
      };
    }).filter((act: any) => act.dislikes > 0);

    const dislikedList = dayActivitiesWithDislikes.map((act: any) => 
      `- Activity: "${act.name}" has group negative/dislike votes. Reason user wants change: ${regenText || 'General feedback'}`
    );

    try {
      const response = await fetch(`/api/days/${dayNumber}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trip_id: trip.id,
          constraints_text: regenText,
          constraint_chips: regenChips,
          original_day: originalDay,
          destination: trip.itinerary.trip_metadata.destination_resolved || trip.destination,
          budget: trip.itinerary.trip_metadata.total_estimated_cost_usd || trip.budgetPerPerson,
          vibe_tags: trip.vibeTags || [],
          disliked_activities: dislikedList,
          start_date: trip.itinerary.trip_metadata.trip_start_date || trip.startDate,
          end_date: trip.itinerary.trip_metadata.trip_end_date || trip.endDate
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error_message || errorData.details || "Failed on the backend generation server.");
      }

      const resJson = await response.json();
      if (!resJson.success || !resJson.new_day) {
        throw new Error(resJson.error_message || "Received faulty response content from AI backend.");
      }

      const newDayData = resJson.new_day;

      // SUCCESS:
      // Track previous versions to save in subcollection
      const dayIdStr = dayNumber.toString();
      const subDocRef = doc(db, "trips", trip.id, "itinerary_days", dayIdStr);
      const existingSubDoc = itineraryDays.find(d => d.id === dayIdStr);

      let previousVersions = [];
      if (existingSubDoc) {
        previousVersions = [...(existingSubDoc.previous_versions || [])];
        previousVersions.push({
          version_number: previousVersions.length,
          activities: existingSubDoc.activities,
          day_notes: existingSubDoc.day_notes || "",
          created_at: existingSubDoc.regenerated_at || new Date().toISOString()
        });
      } else if (originalDay) {
        previousVersions.push({
          version_number: 0,
          activities: originalDay.activities,
          day_notes: originalDay.day_notes || "",
          created_at: trip.createdAt?.seconds ? new Date(trip.createdAt.seconds * 1000).toISOString() : new Date().toISOString()
        });
      }

      // Write to Firestore main subcollection: itinerary_days
      await setDoc(subDocRef, {
        day_number: dayNumber,
        date: newDayData.date || originalDay?.date || "",
        day_notes: newDayData.day_notes || "",
        activities: newDayData.activities,
        estimated_day_cost_usd: newDayData.estimated_day_cost_usd || originalDay?.estimated_day_cost_usd || 0,
        weather_dependency: newDayData.weather_dependency || originalDay?.weather_dependency || "low",
        is_current_version: true,
        regenerated_at: new Date().toISOString(),
        regeneration_reason: regenText || "Regenerated with selected preferences",
        previous_versions: previousVersions
      });

      // Write old version to "day_history" subcollection too
      try {
        const historyCollectionRef = collection(db, "trips", trip.id, "day_history");
        const historyDocRef = doc(historyCollectionRef);
        await setDoc(historyDocRef, {
          day_number: dayNumber,
          trip_id: trip.id,
          activities: originalDay?.activities || [],
          day_notes: originalDay?.day_notes || "",
          archived_at: new Date().toISOString(),
          version_number: previousVersions.length - 1
        });
      } catch (e) {
        console.error("Secondary day_history storage error (non-fatal):", e);
      }

      // Update the main trip document's days array for live readers without subqueries
      const originalDays = [...trip.itinerary.days];
      const updatedDays = originalDays.map((d: any) => {
        if (d.day_number === dayNumber) {
          return {
            ...d,
            day_notes: newDayData.day_notes || d.day_notes,
            estimated_day_cost_usd: newDayData.estimated_day_cost_usd ?? d.estimated_day_cost_usd,
            weather_dependency: newDayData.weather_dependency || d.weather_dependency,
            activities: newDayData.activities
          };
        }
        return d;
      });

      const updatedItinerary = {
        ...trip.itinerary,
        days: updatedDays
      };

      const tripDocRef = doc(db, "trips", trip.id);
      await updateDoc(tripDocRef, {
        itinerary: updatedItinerary,
        updatedAt: serverTimestamp()
      });

      // Show success toast, close modal, and scroll to day
      setSuccessToast(`Day ${dayNumber} regenerated successfully!`);
      setTimeout(() => setSuccessToast(null), 4000);
      
      setShowRegenModal(false);
      setRegenText("");
      setRegenChips([]);
      setRegenAttempts(prev => ({ ...prev, [dayNumber]: 0 }));

      // Smoothly scroll to the regenerated day
      setTimeout(() => {
        const element = document.getElementById(`day-container-${dayNumber}`);
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 500);

    } catch (e: any) {
      console.error("Regeneration error:", e);
      const currentAttempts = (regenAttempts[dayNumber] || 0) + 1;
      setRegenAttempts(prev => ({ ...prev, [dayNumber]: currentAttempts }));
      
      if (currentAttempts >= 2) {
        setRegenError("Still having trouble? The day remains unchanged. Try again later.");
      } else {
        setRegenError(`Failed to regenerate Day ${dayNumber}. Please try again.`);
      }
    } finally {
      setRegeneratingLoading(false);
    }
  };

  const handleChipToggle = (chip: string) => {
    setRegenChips(prev => 
      prev.includes(chip) ? prev.filter(c => c !== chip) : [...prev, chip]
    );
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

  const renderedDays = (days || []).map((origDay: any) => {
    const subDoc = itineraryDays.find(d => d.id === origDay.day_number.toString() || d.day_number === origDay.day_number);
    if (subDoc) {
      return {
        ...origDay,
        day_notes: subDoc.day_notes || origDay.day_notes,
        activities: subDoc.activities || origDay.activities,
        estimated_day_cost_usd: subDoc.estimated_day_cost_usd ?? origDay.estimated_day_cost_usd,
        weather_dependency: subDoc.weather_dependency || origDay.weather_dependency,
        isRegenerated: true,
        previous_versions: subDoc.previous_versions || [],
        regeneration_reason: subDoc.regeneration_reason || ""
      };
    }
    return {
      ...origDay,
      isRegenerated: false,
      previous_versions: []
    };
  });

  // Extract all activities across all days for voting computations
  const allActivities = renderedDays.flatMap((day: any) => 
    (day.activities || []).map((act: any, aIdx: number) => ({
      activity_id: `${day.day_number}_${aIdx}`,
      name: act.venue_name || act.name,
      day_number: day.day_number,
      rawActivity: act,
      date: day.date
    }))
  );

  const activityFeedbackList = allActivities.map(act => {
    const likes = votes.filter(v => v.activity_id === act.activity_id && v.vote_type === "like").length;
    const dislikes = votes.filter(v => v.activity_id === act.activity_id && v.vote_type === "dislike").length;
    return {
      ...act,
      likes,
      dislikes,
      net: likes - dislikes
    };
  });

  const totalLikes = votes.filter(v => v.vote_type === "like").length;
  const totalDislikes = votes.filter(v => v.vote_type === "dislike").length;
  const totalVotesAcrossAll = votes.length;
  const distinctVotersCount = new Set(votes.map(v => v.voter_id)).size;

  const mostLikedActivities = [...activityFeedbackList]
    .filter(act => act.likes > 0)
    .sort((a, b) => b.likes - a.likes)
    .slice(0, 3);

  const mostDislikedActivities = [...activityFeedbackList]
    .filter(act => act.dislikes > 0)
    .sort((a, b) => b.dislikes - a.dislikes)
    .slice(0, 3);

  const feedbackByDay = renderedDays.map((day: any) => {
    const dayActivities = allActivities.filter(a => a.day_number === day.day_number);
    let dayLikes = 0;
    let dayDislikes = 0;
    dayActivities.forEach(act => {
      dayLikes += votes.filter(v => v.activity_id === act.activity_id && v.vote_type === "like").length;
      dayDislikes += votes.filter(v => v.activity_id === act.activity_id && v.vote_type === "dislike").length;
    });
    return {
      day_number: day.day_number,
      date: day.date,
      likes: dayLikes,
      dislikes: dayDislikes,
      net: dayLikes - dayDislikes,
      total: dayLikes + dayDislikes
    };
  });

  // Actionable Insights Logic
  const insightsList: string[] = [];
  feedbackByDay.forEach(d => {
    if (d.net < -1) {
      insightsList.push(`Day ${d.day_number} has mixed or negative feedback (net ${d.net}). Consider regenerating with different activities.`);
    }
  });

  activityFeedbackList.forEach(act => {
    if (act.dislikes > 3) {
      insightsList.push(`"${act.name}" on Day ${act.day_number} has ${act.dislikes} dislikes. Consider regenerating Day ${act.day_number}.`);
    }
  });

  activityFeedbackList.forEach(act => {
    if (act.likes > 5) {
      insightsList.push(`Day ${act.day_number} is a hit! Keep up the good work on activity "${act.name}" which got ${act.likes} likes.`);
    }
  });

  const handleManualFeedbackRefresh = () => {
    setFeedbackRefreshing(true);
    setTimeout(() => {
      setFeedbackRefreshing(false);
    }, 600);
  };

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

        {/* Group Feedback Summary Panel (Manage View Only) */}
        {isOrganizer && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-3xl overflow-hidden border border-brand-teal/5 shadow-xl shadow-brand-teal/[0.01]"
          >
            {/* Header */}
            <div className="bg-[#1A6B7A] text-white p-6 md:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <span className="text-[9px] font-black uppercase tracking-[0.25em] text-brand-coral">Organizer Dashboard</span>
                <h3 className="text-2xl md:text-3xl font-serif italic flex items-center gap-2">
                  Group Feedback Summary
                </h3>
                <p className="text-white/80 text-xs font-light">
                  {feedbackRefreshing
                    ? "Syncing latest votes..."
                    : totalVotesAcrossAll === 0
                    ? "Waiting for group feedback... Invite members to vote on activities!"
                    : distinctVotersCount === 1
                    ? "1 member has voted. Waiting for more feedback..."
                    : `Based on ${totalVotesAcrossAll} votes from ${distinctVotersCount} group members`}
                </p>
              </div>
              <button
                onClick={handleManualFeedbackRefresh}
                disabled={feedbackRefreshing}
                className="self-start sm:self-center flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 active:scale-95 transition-all text-white rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
              >
                <RotateCw className={`w-3.5 h-3.5 ${feedbackRefreshing ? 'animate-spin' : ''}`} />
                <span>Refresh Feedback</span>
              </button>
            </div>

            {feedbackRefreshing ? (
              <div className="p-12 flex flex-col items-center justify-center space-y-4">
                <div className="w-10 h-10 border-4 border-brand-teal/10 border-t-brand-coral rounded-full animate-spin" />
                <p className="text-xs text-brand-teal/50 italic">Retrieving latest group reactions...</p>
              </div>
            ) : totalVotesAcrossAll === 0 ? (
              /* EMPTY STATE */
              <div className="p-10 text-center space-y-3 bg-brand-sand/5">
                <p className="text-sm font-semibold text-brand-teal/70">No votes cast yet</p>
                <p className="text-xs text-brand-teal/40 italic max-w-sm mx-auto">
                  Share your itinerary link with friends to let them vote (👍/👎) on scheduled activities in real time.
                </p>
              </div>
            ) : (
              /* METRICS INSIDE */
              <div className="p-6 md:p-8 space-y-8 divide-y divide-brand-teal/5">
                {/* Row 1: Overall sentiment and Top lists */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  {/* SECTION A: OVERALL TRIP SENTIMENT */}
                  <div className="space-y-4">
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#1A6B7A] block">Trip Sentiment</span>
                    <div className="bg-brand-sand/35 rounded-2xl p-5 border border-brand-teal/5 space-y-4">
                      <div className="text-xl font-bold font-serif italic text-[#1A6B7A]">
                        <span className="text-[#E87E5C]">👍 {totalLikes} likes</span> · <span className="text-brand-teal/50">👎 {totalDislikes} dislikes</span>
                      </div>
                      <p className="text-xs font-light text-brand-teal/60 leading-relaxed">
                        {totalLikes >= totalDislikes 
                          ? "Overall positive stance from your group members." 
                          : "Mixed reviews detected. Check disliked activities below."}
                      </p>
                    </div>
                  </div>

                  {/* SECTION B: MOST LIKED ACTIVITIES (Top 3) */}
                  <div className="space-y-4">
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#E87E5C] flex items-center gap-1.5">
                      <ThumbsUp className="w-3.5 h-3.5" /> Most Liked Activities
                    </span>
                    <div className="space-y-2">
                      {mostLikedActivities.length === 0 ? (
                        <div className="text-xs text-brand-teal/40 italic p-4 bg-brand-coral/5 rounded-2xl border border-brand-coral/10">No activities have positive votes yet.</div>
                      ) : (
                        mostLikedActivities.map((act, idx) => (
                          <div key={idx} className="p-4 bg-brand-coral/5 border border-brand-coral/10 rounded-2xl text-xs flex flex-col justify-between hover:border-brand-coral/20 transition-all">
                            <div className="font-bold text-brand-teal leading-snug line-clamp-2">
                              {act.name}
                            </div>
                            <div className="flex items-center justify-between text-[10px] mt-2 border-t border-brand-coral/5 pt-1.5">
                              <span className="text-brand-teal/50 font-medium">Day {act.day_number}</span>
                              <span className="text-[#E87E5C] font-black tracking-wider uppercase">
                                👍 {act.likes} likes
                              </span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* SECTION C: MOST DISLIKED ACTIVITIES (Top 3) */}
                  <div className="space-y-4">
                    <span className="text-[10px] font-black uppercase tracking-widest text-amber-600 flex items-center gap-1.5">
                      <ThumbsDown className="w-3.5 h-3.5" /> Most Disliked Activities
                    </span>
                    <div className="space-y-2">
                      {mostDislikedActivities.length === 0 ? (
                        <div className="text-xs text-brand-teal/40 italic p-4 bg-amber-50/50 rounded-2xl border border-amber-200/20">Congratulations! No activities have negative votes.</div>
                      ) : (
                        mostDislikedActivities.map((act, idx) => (
                          <div key={idx} className="p-4 bg-[#FFF8E7] border border-amber-200/40 rounded-2xl text-xs flex flex-col justify-between hover:border-amber-200/60 transition-all">
                            <div>
                              <div className="font-bold text-brand-teal leading-snug line-clamp-2">
                                {act.name}
                              </div>
                              <div className="flex items-center justify-between text-[10px] mt-2 border-t border-brand-teal/5 pt-1.5">
                                <span className="text-brand-teal/50 font-medium">Day {act.day_number}</span>
                                <span className="text-amber-700 font-bold uppercase tracking-wider">
                                  👎 {act.dislikes} dislikes
                                </span>
                              </div>
                            </div>
                            
                            <button
                              onClick={() => {
                                setSelectedRegenDay(act.day_number);
                                setShowRegenModal(true);
                              }}
                              className="mt-3 w-full text-center py-2 bg-brand-coral hover:bg-brand-coral/90 text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all shadow-md shadow-brand-coral/10"
                            >
                              Regenerate Day {act.day_number}
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {/* SECTION 3: DAYS BREAKDOWN (Collapsible) */}
                <div className="pt-6">
                  <button
                    onClick={() => setFeedbackDaysExpanded(!feedbackDaysExpanded)}
                    className="w-full flex items-center justify-between py-2 text-left outline-none"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-brand-teal/40">Feedback by Day</span>
                      <span className="px-2 py-0.5 bg-brand-teal/5 text-brand-teal text-[9px] font-bold rounded-full">
                        {feedbackByDay.length} Days
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-[#E87E5C] font-bold hover:underline">
                      <span>{feedbackDaysExpanded ? "Collapse Breakdown" : "Expand Breakdown"}</span>
                      {feedbackDaysExpanded ? <ChevronUp className="w-4 h-4 text-[#E87E5C]" /> : <ChevronDown className="w-4 h-4 text-[#E87E5C]" />}
                    </div>
                  </button>

                  <AnimatePresence>
                    {feedbackDaysExpanded && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4 pt-4">
                          {feedbackByDay.map((d, index) => {
                            const isNegative = d.net < 0;
                            const isPositive = d.net > 0;
                            return (
                              <div key={index} className="p-4 bg-brand-sand/15 rounded-2xl border border-brand-teal/5 flex items-center justify-between hover:bg-brand-sand/25 transition-all">
                                <div>
                                  <div className="font-bold text-sm text-brand-teal">
                                    Day {d.day_number} • <span className="text-xs font-normal text-brand-teal/40">{formatDate(d.date, trip_metadata.trip_start_date)}</span>
                                  </div>
                                  <div className="text-[10px] text-brand-teal/40 mt-1">
                                    {d.total} total votes ({d.likes} likes, {d.dislikes} dislikes)
                                  </div>
                                </div>

                                <div className="flex items-center gap-2">
                                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                                    isNegative 
                                      ? "bg-red-50 text-red-600 border border-red-100" 
                                      : isPositive 
                                      ? "bg-green-50 text-green-600 border border-green-100" 
                                      : "bg-gray-50 text-gray-500 border border-gray-100"
                                  }`}>
                                    Net: {d.net > 0 ? `+${d.net}` : d.net}
                                  </span>
                                  {isNegative && (
                                    <span className="text-xs" title="Below average sentiment animate-bounce">⚠️ Below average</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* SECTION 4: ACTIONABLE INSIGHTS (Next Steps) */}
                {insightsList.length > 0 && (
                  <div className="pt-6 space-y-4">
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#E87E5C] block">Next Steps</span>
                    <div className="p-5 bg-brand-coral/[0.03] border border-brand-coral/10 rounded-2xl space-y-3">
                      {insightsList.map((insight, idx) => (
                        <div key={idx} className="flex items-start gap-2.5 text-xs text-brand-teal/75 font-medium italic">
                          <div className="w-1.5 h-1.5 rounded-full bg-brand-coral mt-1.5 shrink-0 animate-pulse" />
                          <p className="leading-relaxed">{insight}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </motion.section>
        )}

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
          {renderedDays.map((day: any, idx: number) => (
            <motion.div
              layout
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              key={idx}
              id={`day-container-${day.day_number}`}
              className="space-y-12"
            >
              {/* Day Header - Non-floating, paired elegantly at the top */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-brand-teal/5">
                <div className="flex items-center gap-6">
                  <div className="w-16 h-16 shrink-0 rounded-full bg-brand-teal flex items-center justify-center text-white font-serif italic text-2xl shadow-xl shadow-brand-teal/15">
                    {day.day_number}
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center flex-wrap gap-2">
                      <span className="text-[10px] font-black uppercase tracking-[0.3em] text-brand-coral">Day {day.day_number}</span>
                      {day.isRegenerated && (
                        <span className="px-2 py-0.5 bg-brand-coral/10 text-brand-coral text-[8px] font-black tracking-widest uppercase rounded">
                          Regenerated
                        </span>
                      )}
                    </div>
                    <h3 className="text-3xl md:text-4xl font-serif italic text-brand-teal leading-tight">{formatDate(day.date, trip_metadata.trip_start_date)}</h3>
                  </div>
                </div>

                {/* Day Action Buttons */}
                <div className="flex flex-wrap items-center gap-3">
                  {/* View History Link */}
                  {day.previous_versions && day.previous_versions.length > 0 && (
                    <button
                      onClick={() => {
                        setSelectedHistoryDay(day);
                        setShowHistoryModal(true);
                      }}
                      className="text-[10px] font-black uppercase tracking-widest text-brand-coral hover:underline"
                    >
                      History ({day.previous_versions.length})
                    </button>
                  )}

                  {/* Regenerate Day Button */}
                  {isOrganizer && (
                    <button
                      onClick={() => {
                        setSelectedRegenDay(day.day_number);
                        setShowRegenModal(true);
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-brand-teal/5 border border-brand-teal/10 hover:border-brand-coral hover:bg-brand-coral hover:text-white transition-all text-brand-teal rounded-xl text-[10px] font-black uppercase tracking-widest"
                    >
                      <Sparkles className="w-3.5 h-3.5" /> Regenerate Day {day.day_number}
                    </button>
                  )}
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
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                            <div className="flex flex-wrap items-center gap-3">
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

                            {/* Optional per-activity detail view for organizer */}
                            {isOrganizer && (likesCount > 0 || dislikesCount > 0) && (
                              <button
                                type="button"
                                onClick={() => setActivityVotesExpanded(prev => ({ ...prev, [activityId]: !prev[activityId] }))}
                                className="text-[10px] font-black uppercase tracking-widest text-[#E87E5C] hover:underline cursor-pointer"
                              >
                                {activityVotesExpanded[activityId] ? "Hide Votes" : `View Votes (${likesCount + dislikesCount})`}
                              </button>
                            )}
                          </div>

                          {/* Activity-level voter list */}
                          {isOrganizer && activityVotesExpanded[activityId] && (
                            <motion.div 
                              initial={{ opacity: 0, y: -5 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="flex flex-wrap gap-2 p-3 bg-brand-sand/20 border border-brand-teal/5 rounded-2xl mt-2"
                            >
                              {votes.filter(v => v.activity_id === activityId).length === 0 ? (
                                <span className="text-[10px] text-brand-teal/40 italic">No votes have been cast yet.</span>
                              ) : (
                                votes.filter(v => v.activity_id === activityId).map((v, vIdx) => (
                                  <span key={vIdx} className={`px-2.5 py-1 text-[9px] font-black uppercase tracking-wider rounded-lg border flex items-center gap-1.5 shadow-sm ${
                                    v.vote_type === "like"
                                      ? "bg-brand-coral/10 text-brand-coral border-[#E87E5C]/15"
                                      : "bg-brand-teal/5 text-[#1A6B7A] border-[#1A6B7A]/10"
                                  }`}>
                                    <span>{v.vote_type === "like" ? "👍" : "👎"}</span>
                                    <span>{getVoterLabel(v.voter_id)}</span>
                                  </span>
                                ))
                              )}
                            </motion.div>
                          )}

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

        {/* Success Toast */}
        {successToast && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed bottom-10 right-10 z-[120] bg-brand-teal text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 font-semibold text-sm border border-white/10"
          >
            <Sparkles className="w-5 h-5 text-brand-coral animate-bounce" />
            <span>{successToast}</span>
          </motion.div>
        )}

        {/* Day Regeneration Modal */}
        {showRegenModal && selectedRegenDay !== null && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            {/* Overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-brand-teal/45 backdrop-blur-sm"
              onClick={() => !regeneratingLoading && setShowRegenModal(false)}
            />

            {/* Modal Box */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-3xl p-8 shadow-2xl border border-brand-teal/5 overflow-hidden z-[120]"
            >
              {/* Header */}
              <div className="space-y-2 mb-6">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-coral">AI Assistant Editor</span>
                <h3 className="text-3xl font-serif italic text-brand-teal">Regenerate Day {selectedRegenDay}</h3>
                <p className="text-xs text-brand-teal/40 italic font-light">Custom tune this day’s schedule to match your team’s latest feedback.</p>
              </div>

              {regeneratingLoading ? (
                // LOADING STATE
                <div className="py-12 flex flex-col items-center justify-center text-center space-y-6">
                  <div className="relative">
                    <div className="w-16 h-16 border-4 border-brand-teal/10 border-t-brand-coral rounded-full animate-spin" />
                    <Sparkles className="w-6 h-6 text-brand-coral absolute inset-0 m-auto animate-pulse" />
                  </div>
                  <div className="space-y-2">
                    <h4 className="text-lg font-serif italic text-brand-teal animate-pulse">
                      {rotatingMessage || "Working some magic..."}
                    </h4>
                    <p className="text-xs text-brand-teal/40 font-light italic">This can take up to 45 seconds while we geographic-optimize the itinerary.</p>
                  </div>
                </div>
              ) : (
                // FORM STATE
                <div className="space-y-6">
                  {/* Error Notification */}
                  {regenError && (
                    <div className="p-4 bg-brand-coral/5 border border-brand-coral/20 rounded-2xl flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-brand-coral shrink-0 mt-0.5" />
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-brand-teal">{regenError}</p>
                        {regenAttempts[selectedRegenDay] === 1 && (
                          <button
                            onClick={handleRegenerateDaySubmit}
                            className="bg-brand-coral text-white text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-lg hover:bg-brand-coral/90 transition-all"
                          >
                            Try Again
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Free-text instructions */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-brand-teal/40">
                      <span>What should be different about this day?</span>
                      <span>{regenText.length}/200</span>
                    </div>
                    <textarea
                      value={regenText}
                      onChange={(e) => setRegenText(e.target.value.substring(0, 200))}
                      placeholder="e.g., cheaper options, more food, less walking, indoor activities..."
                      rows={3}
                      className="w-full bg-brand-sand/35 border border-brand-teal/15 focus:border-brand-coral focus:ring-1 focus:ring-brand-coral rounded-2xl p-4 text-sm text-brand-teal outline-none transition-all placeholder:text-brand-teal/20"
                    />
                  </div>

                  {/* Shortcut Chips */}
                  <div className="space-y-3">
                    <span className="text-[10px] font-black uppercase tracking-widest text-brand-teal/40 block">Select Shortcut Chips</span>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { label: "Cheaper options", value: "cheaper options" },
                        { label: "More food focus", value: "more food focus" },
                        { label: "Less walking", value: "less walking" },
                        { label: "Indoor alternatives", value: "indoor alternatives" },
                        { label: "More adventure", value: "more adventure" }
                      ].map((chip) => {
                        const active = regenChips.includes(chip.value);
                        return (
                          <button
                            key={chip.value}
                            type="button"
                            onClick={() => handleChipToggle(chip.value)}
                            className={`px-4 py-2 rounded-xl text-xs font-semibold border transition-all ${
                              active
                                ? "bg-brand-coral text-white border-brand-coral shadow-lg shadow-brand-coral/15"
                                : "bg-brand-sand/15 text-brand-teal border-brand-teal/10 hover:border-brand-teal/30"
                            }`}
                          >
                            {chip.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Footer Action Buttons */}
                  <div className="flex items-center justify-end gap-3 pt-4 border-t border-brand-teal/5">
                    <button
                      type="button"
                      onClick={() => {
                        setShowRegenModal(false);
                        setRegenText("");
                        setRegenChips([]);
                        setRegenError(null);
                      }}
                      className="px-6 py-3 border border-brand-teal/10 hover:bg-brand-sand/20 rounded-xl text-xs font-black uppercase tracking-widest text-brand-teal"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleRegenerateDaySubmit}
                      className="px-6 py-3 bg-brand-coral hover:bg-brand-coral/90 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-xl shadow-brand-coral/10"
                    >
                      Regenerate
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}

        {/* View Previous Versions (History) Modal */}
        {showHistoryModal && selectedHistoryDay && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            {/* Overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-brand-teal/45 backdrop-blur-sm"
              onClick={() => setShowHistoryModal(false)}
            />

            {/* Modal Box */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-3xl p-8 shadow-2xl border border-brand-teal/5 z-[120] flex flex-col max-h-[85vh]"
            >
              {/* Header */}
              <div className="space-y-2 mb-6 shrink-0">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-coral">Historical Archives</span>
                <h3 className="text-3xl font-serif italic text-brand-teal font-serif-italic">Day {selectedHistoryDay.day_number} Version History</h3>
                <p className="text-xs text-brand-teal/40 italic font-light">Browse prior generated iterations of this day and copy activity information if needed.</p>
              </div>

              {/* History List Scrollable section */}
              <div className="flex-1 overflow-y-auto space-y-8 pr-2">
                {selectedHistoryDay.previous_versions && selectedHistoryDay.previous_versions.length === 0 ? (
                  <p className="text-sm font-light text-brand-teal/40 italic py-8 text-center">No previous records exist for this day.</p>
                ) : (
                  [...selectedHistoryDay.previous_versions].reverse().map((version: any, vIdx: number) => {
                    const revIndex = selectedHistoryDay.previous_versions.length - 1 - vIdx;
                    return (
                      <div key={vIdx} className="bg-brand-sand/15 border border-brand-teal/5 rounded-2xl p-6 space-y-4">
                        <div className="flex items-center justify-between border-b border-brand-teal/5 pb-3">
                          <div>
                            <span className="text-xs font-black uppercase tracking-wider text-brand-coral">Version {revIndex}</span>
                            <span className="text-[10px] font-light text-brand-teal/30 ml-2 italic">
                              Saved at: {new Date(version.created_at).toLocaleString()}
                            </span>
                          </div>
                        </div>

                        {version.day_notes && (
                          <p className="text-xs italic text-brand-teal/50 font-light border-l-2 border-brand-accent/20 pl-3">
                            "{version.day_notes}"
                          </p>
                        )}

                        <div className="space-y-3">
                          {version.activities && version.activities.map((act: any, aIdx: number) => (
                            <div key={aIdx} className="flex items-start justify-between gap-4 p-3 bg-white/70 rounded-xl border border-brand-teal/[0.03]">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-semibold text-brand-teal/50 bg-brand-teal/5 px-2 py-0.5 rounded">
                                    {act.start_time}
                                  </span>
                                  <h4 className="text-xs font-bold text-brand-teal">
                                    {act.venue_name || act.name}
                                  </h4>
                                </div>
                                <p className="text-[11px] text-brand-teal/60 font-light leading-relaxed">
                                  {act.description}
                                </p>
                              </div>
                              <button
                                onClick={() => {
                                  const text = `${act.start_time} - ${act.venue_name || act.name}: ${act.description}`;
                                  navigator.clipboard.writeText(text);
                                  setCopiedActivityId(`${revIndex}_${aIdx}`);
                                  setTimeout(() => setCopiedActivityId(null), 2000);
                                }}
                                className="shrink-0 px-3 py-1.5 bg-brand-teal/5 hover:bg-brand-coral hover:text-white text-brand-teal rounded-lg text-[9px] font-black uppercase tracking-widest transition-all"
                              >
                                {copiedActivityId === `${revIndex}_${aIdx}` ? "Copied!" : "Copy info"}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Footer */}
              <div className="pt-6 border-t border-brand-teal/5 mt-6 flex justify-end shrink-0">
                <button
                  type="button"
                  onClick={() => setShowHistoryModal(false)}
                  className="px-6 py-3 bg-brand-teal text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all hover:bg-brand-teal/90"
                >
                  Close History
                </button>
              </div>
            </motion.div>
          </div>
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

