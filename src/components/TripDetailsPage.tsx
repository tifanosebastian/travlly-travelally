import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { collection, query, where, getDocs, getDoc, onSnapshot, doc, setDoc, deleteDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db, handleFirestoreError, OperationType, auth } from "../lib/firebase";
import { MapPin, Calendar, Clock, DollarSign, ArrowLeft, AlertCircle, Share2, Sparkles, Plane, LogOut, Sun, Cloud, CloudRain, Snowflake, Wind, Thermometer, Shirt, Briefcase, ChevronDown, ChevronUp, ThumbsUp, ThumbsDown, RotateCw, TrendingUp, Check } from "lucide-react";
import Footer from "./Footer";

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
  const [activitiesToRemove, setActivitiesToRemove] = useState<number[]>([]);
  const [additionalActivities, setAdditionalActivities] = useState<number>(0);
  const [regenWarningAllRemoved, setRegenWarningAllRemoved] = useState(false);
  const [regeneratingLoading, setRegeneratingLoading] = useState(false);
  const [rotatingMessage, setRotatingMessage] = useState("");
  const [regenError, setRegenError] = useState<string | null>(null);
  const [regenAttempts, setRegenAttempts] = useState<{ [dayNum: number]: number }>({});
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const originalRegenDay = selectedRegenDay !== null && trip
    ? (itineraryDays.find((d: any) => d.id === selectedRegenDay.toString() || d.day_number === selectedRegenDay) || 
       trip.itinerary?.days?.find((d: any) => d.day_number === selectedRegenDay))
    : null;
  const currentDayActivities = originalRegenDay?.activities || [];

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

  // Local Lingo Guide states
  const [localLingo, setLocalLingo] = useState<any>(null);
  const [lingoLoading, setLingoLoading] = useState(false);
  const [lingoSectionsExpanded, setLingoSectionsExpanded] = useState<{[key: string]: boolean}>({
    phrases: true, // Expanded by default
    slang: false,
    tips: false
  });

  // Background venue verification state
  const [verifyingActivityIds, setVerifyingActivityIds] = useState<Record<string, boolean>>({});

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

  // Background Google Places Venue Verification Hook
  useEffect(() => {
    if (!trip?.id || loading || !trip?.itinerary) return;

    const trip_metadata = trip.itinerary.trip_metadata || {};
    const destination = trip.destination || trip_metadata.destination_resolved || "";
    const days = trip.itinerary.days || [];

    // Find all activities across all days that have venue_name but no google_places_verification in Firestore
    const pending: { day: any; activity: any; activityId: string }[] = [];

    // Scan rendered activities using the same logic as the renderedDays list
    days.forEach((origDay: any) => {
      const subDoc = itineraryDays.find(d => d.id === origDay.day_number.toString() || d.day_number === origDay.day_number);
      const dayActivities = subDoc ? subDoc.activities : origDay.activities;

      (dayActivities || []).forEach((act: any, aIdx: number) => {
        const actId = `${origDay.day_number}_${aIdx}`;
        if (act.venue_name && !act.google_places_verification && verifyingActivityIds[actId] === undefined) {
          pending.push({ day: origDay, activity: act, activityId: actId });
        }
      });
    });

    if (pending.length === 0) return;

    // Process the first pending activity sequentially to optimize cost and throttle rate limits
    const nextToVerify = pending[0];
    const { day, activity, activityId } = nextToVerify;

    const runVerification = async () => {
      // Mark as verifying in React state to avoid duplicate processing
      setVerifyingActivityIds(prev => ({ ...prev, [activityId]: true }));

      console.log(`[Verification] Validating activity: "${activity.venue_name}" (${activityId})`);

      try {
        const cacheKey = `${activity.venue_name}_${activity.neighborhood || ""}_${destination}`
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "_");

        let verifiedData = null;
        let activityToUpdate = null;
        let shouldRemoveActivity = false;

        // Step 1: Query global Firestore google_places_cache collection for cost optimization
        try {
          const cacheRef = doc(db, "google_places_cache", cacheKey);
          const cacheSnap = await getDoc(cacheRef);
          if (cacheSnap.exists()) {
            console.log(`[Verification] Cache Hit for: "${activity.venue_name}"`);
            const cached = cacheSnap.data();
            if (cached && cached.verification_data) {
              verifiedData = cached.verification_data;
              if (cached.new_activity) {
                activityToUpdate = cached.new_activity;
              }
              if (cached.was_removed) {
                shouldRemoveActivity = true;
              }
            }
          }
        } catch (err) {
          console.error("Cache read error (non-blocking):", err);
        }

        // Step 2: Query secure server-side verification proxy api if cache-miss occurred
        if (!verifiedData) {
          console.log(`[Verification] Cache Miss for: "${activity.venue_name}". Fetching from proxy...`);
          const response = await fetch("/api/places/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              venue_name: activity.venue_name,
              neighborhood: activity.neighborhood || "",
              destination: destination,
              activity: activity
            })
          });

          if (response.ok) {
            const result = await response.json();
            if (result.was_replaced && result.new_activity) {
              // Option A: replace activity with the new shiny one
              verifiedData = result.google_places_verification || {
                verified: false,
                reason: result.reason || "not_found",
                verified_at: new Date().toISOString()
              };
              activityToUpdate = result.new_activity;
            } else if (result.was_removed) {
              // Option B: Remove activity from the list
              verifiedData = result.google_places_verification || {
                verified: false,
                reason: result.reason || "not_found",
                verified_at: new Date().toISOString()
              };
              shouldRemoveActivity = true;
            } else if (result.verified && result.data) {
              verifiedData = result.data;
            } else {
              // Mark as unverified to prevent repeat attempts
              verifiedData = {
                verified: false,
                reason: "not_found",
                verified_at: new Date().toISOString(),
                verified_by: "google_places_api_not_found"
              };
            }

            // Write verification result to global cache
            try {
              await setDoc(doc(db, "google_places_cache", cacheKey), {
                query: `${activity.venue_name} ${activity.neighborhood || ""} ${destination}`,
                verification_data: verifiedData,
                new_activity: activityToUpdate || null,
                was_removed: shouldRemoveActivity || null,
                cached_at: new Date().toISOString()
              });
            } catch (err) {
              console.error("Cache write error (non-blocking):", err);
            }
          } else {
            throw new Error(`Proxy verification returned non-ok status: ${response.status}`);
          }
        }

        // Step 3: Write verification credentials back to the itinerary_days subcollection
        if (verifiedData) {
          const dayIdStr = day.day_number.toString();
          const subDocRef = doc(db, "trips", trip.id, "itinerary_days", dayIdStr);
          const existingSubDocSnap = await getDoc(subDocRef);

          let updatedActivities = [];
          
          if (existingSubDocSnap.exists()) {
            const data = existingSubDocSnap.data();
            const currentActivities = data.activities || [];
            
            if (activityToUpdate) {
              updatedActivities = [];
              currentActivities.forEach((act: any, idx: number) => {
                if (idx === parseInt(activityId.split("_")[1], 10)) {
                  // Keep BOTH!
                  // 1. The original activity marked as closed/replaced
                  const closedActivity = {
                    ...act,
                    activity_id: activityId,
                    google_places_verification: verifiedData
                  };
                  updatedActivities.push(closedActivity);
                  
                  // 2. The new replacement activity
                  updatedActivities.push(activityToUpdate);
                } else {
                  updatedActivities.push(act);
                }
              });
            } else if (shouldRemoveActivity) {
              updatedActivities = currentActivities.filter((act: any, idx: number) => {
                return idx !== parseInt(activityId.split("_")[1], 10);
              });
            } else {
              updatedActivities = currentActivities.map((act: any, idx: number) => {
                if (idx === parseInt(activityId.split("_")[1], 10)) {
                  return {
                    ...act,
                    google_places_verification: verifiedData
                  };
                }
                return act;
              });
            }

            await updateDoc(subDocRef, {
              activities: updatedActivities
            });
          } else {
            // Instantiate day subcollection document
            const origDay = days.find((d: any) => d.day_number === day.day_number);
            const currentActivities = [...(origDay?.activities || [])];
            
            if (activityToUpdate) {
              updatedActivities = [];
              currentActivities.forEach((act: any, idx: number) => {
                if (idx === parseInt(activityId.split("_")[1], 10)) {
                  const closedActivity = {
                    ...act,
                    activity_id: activityId,
                    google_places_verification: verifiedData
                  };
                  updatedActivities.push(closedActivity);
                  updatedActivities.push(activityToUpdate);
                } else {
                  updatedActivities.push(act);
                }
              });
            } else if (shouldRemoveActivity) {
              updatedActivities = currentActivities.filter((act: any, idx: number) => {
                return idx !== parseInt(activityId.split("_")[1], 10);
              });
            } else {
              updatedActivities = currentActivities.map((act: any, idx: number) => {
                if (idx === parseInt(activityId.split("_")[1], 10)) {
                  return {
                    ...act,
                    google_places_verification: verifiedData
                  };
                }
                return act;
              });
            }

            await setDoc(subDocRef, {
              day_number: day.day_number,
              date: day.date || "",
              day_notes: day.day_notes || "",
              activities: updatedActivities,
              estimated_day_cost_usd: day.estimated_day_cost_usd || 0,
              weather_dependency: day.weather_dependency || "low",
              is_current_version: true,
              regenerated_at: new Date().toISOString(),
              regeneration_reason: "Initialized with Places Verification"
            });
          }
        }
      } catch (err: any) {
        console.error("Verification operation failure (non-blocking):", err);
      } finally {
        // Mark as completed/processed so the scanning pointer can move to next activities
        setVerifyingActivityIds(prev => ({ ...prev, [activityId]: false }));
      }
    };

    runVerification();
  }, [trip, loading, itineraryDays, verifyingActivityIds]);

  // Fetch or generate Local Lingo Guide
  useEffect(() => {
    if (!trip) return;
    if (trip.local_lingo) {
      setLocalLingo(trip.local_lingo);
      return;
    }

    async function fetchLingo() {
      setLingoLoading(true);
      try {
        const dest = trip.destination || trip.itinerary?.trip_metadata?.destination_resolved || "";
        if (!dest) {
          setLingoLoading(false);
          return;
        }
        const res = await fetch("/api/generate-lingo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ destination: dest }),
        });
        if (res.ok) {
          const lingoData = await res.json();
          const localLingoObj = {
            ...lingoData,
            generated_at: new Date().toISOString(),
            language: "en"
          };
          setLocalLingo(localLingoObj);
          
          // Cache lingo back to Firestore so we don't regenerate it next time
          const tripDocRef = doc(db, "trips", trip.id);
          await updateDoc(tripDocRef, {
            local_lingo: localLingoObj,
            updatedAt: serverTimestamp(),
          }).catch((err) => {
            console.warn("Failed caching lingo back to Firestore (non-blocking):", err);
          });
        }
      } catch (err) {
        console.error("Non-blocking on-demand lingo loading error:", err);
      } finally {
        setLingoLoading(false);
      }
    }
    fetchLingo();
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
    setRotatingMessage("Working some magic...");

    const dayNumber = selectedRegenDay;
    const originalDay = itineraryDays.find((d: any) => d.id === dayNumber.toString() || d.day_number === dayNumber) ||
                        trip.itinerary?.days?.find((d: any) => d.day_number === dayNumber);
    const dayActivities = originalDay?.activities || [];

    // Setup rotating message interval
    const messages = [
      "Working some magic...",
      "Geographic optimizing the route...",
      "Sequencing recommended spots...",
      "Formulating day itinerary...",
      "Checking hours & operations..."
    ];
    let msgIdx = 0;
    const intervalId = setInterval(() => {
      msgIdx = (msgIdx + 1) % messages.length;
      setRotatingMessage(messages[msgIdx]);
    }, 4000);

    // Timeout to show "Still generating..." if it takes > 60 seconds
    const stillGeneratingTimeoutId = setTimeout(() => {
      clearInterval(intervalId);
      setRotatingMessage("Still generating...");
    }, 60000);

    // Collect activities with downvotes on this day to pass as feedback
    const dayActivitiesWithDislikes = dayActivities.map((act: any, idx: number) => {
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

    // Calculate removed activities names based on raw checked state indices
    const removedActivityNames = activitiesToRemove.map(idx => {
      const act = dayActivities[idx];
      return act ? (act.venue_name || act.name) : "";
    }).filter(Boolean);

    try {
      const response = await fetch(`/api/days/${dayNumber}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trip_id: trip.id,
          constraints_text: regenText,
          constraint_chips: regenChips,
          removed_activities: removedActivityNames,
          additional_activities_count: additionalActivities,
          original_day: originalDay,
          destination: trip.itinerary.trip_metadata.destination_resolved || trip.destination,
          budget: trip.itinerary.trip_metadata.total_estimated_cost_usd || trip.budgetPerPerson,
          vibe_tags: trip.vibeTags || [],
          disliked_activities: dislikedList,
          start_date: trip.itinerary.trip_metadata.trip_start_date || trip.startDate,
          end_date: trip.itinerary.trip_metadata.trip_end_date || trip.endDate
        })
      });

      clearInterval(intervalId);
      clearTimeout(stillGeneratingTimeoutId);

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
      // Clear votes associated with the old activities that were removed/replaced
      const activitiesToClearVotes = activitiesToRemove.length > 0
        ? activitiesToRemove.map(idx => `${dayNumber}_${idx}`)
        : dayActivities.map((_: any, idx: number) => `${dayNumber}_${idx}`);
      
      // 1. Clear local vote UI immediately
      setVotes(prev => prev.filter(v => !activitiesToClearVotes.includes(v.activity_id)));

      // 2. Delete the votes from Firestore
      try {
        const matchingVotesToDelete = votes.filter(v => v.trip_id === trip.id && activitiesToClearVotes.includes(v.activity_id));
        if (matchingVotesToDelete.length > 0) {
          const deletePromises = matchingVotesToDelete.map(v => deleteDoc(doc(db, "activity_votes", v.id)));
          await Promise.all(deletePromises);
        }
      } catch (voteDeleteErr) {
        console.warn("Non-blocking error deleting old votes from Firestore:", voteDeleteErr);
      }

      // Compute dynamic replacement details for history log
      const oldActNames = dayActivities.map((a: any) => a.venue_name || a.name);
      const newActNames = (newDayData.activities || []).map((a: any) => a.venue_name || a.name);
      
      const removedList = oldActNames.filter((name: string) => !newActNames.includes(name));
      const addedList = newActNames.filter((name: string) => !oldActNames.includes(name));
      
      let reasonText = "";
      const parts = [];
      if (removedList.length > 0) parts.push(`Removed: ${removedList.join(", ")}`);
      if (addedList.length > 0) parts.push(`Added: ${addedList.join(", ")}`);
      
      if (parts.length > 0) {
        reasonText = parts.join(". ");
      } else {
        const chipsList = [...regenChips];
        if (regenText) chipsList.push(regenText);
        reasonText = chipsList.length > 0 ? `Adjusted with: ${chipsList.join(", ")}` : "Regenerated Day schedule";
      }

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
          regeneration_reason: reasonText,
          created_at: existingSubDoc.regenerated_at || new Date().toISOString()
        });
      } else if (originalDay) {
        previousVersions.push({
          version_number: 0,
          activities: originalDay.activities,
          day_notes: originalDay.day_notes || "",
          regeneration_reason: "Original schedule version",
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
        regeneration_reason: reasonText,
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
      const toastMsg = `Day ${dayNumber} regenerated! ${removedList.length} activities removed, ${addedList.length} new ones added.`;
      setSuccessToast(toastMsg);
      setTimeout(() => setSuccessToast(null), 5000);
      
      setShowRegenModal(false);
      setRegenText("");
      setRegenChips([]);
      setActivitiesToRemove([]);
      setAdditionalActivities(0);
      setRegenWarningAllRemoved(false);
      setRegenAttempts(prev => ({ ...prev, [dayNumber]: 0 }));

      // Smoothly scroll to the regenerated day
      setTimeout(() => {
        const element = document.getElementById(`day-container-${dayNumber}`);
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 500);

    } catch (e: any) {
      clearInterval(intervalId);
      clearTimeout(stillGeneratingTimeoutId);
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

  const handleOpenRegenModal = async (dayNumber: number) => {
    setSelectedRegenDay(dayNumber);
    setActivitiesToRemove([]);
    setAdditionalActivities(0);
    setRegenWarningAllRemoved(false);
    setRegenText("");
    setRegenChips([]);
    setRegenError(null);
    setShowRegenModal(true);

    try {
      if (!trip?.id) return;
      const dayIdStr = dayNumber.toString();
      
      // Try to fetch from subcollection first
      const subDocRef = doc(db, "trips", trip.id, "itinerary_days", dayIdStr);
      const subDocSnap = await getDoc(subDocRef);
      
      if (subDocSnap.exists()) {
        const freshDayData = subDocSnap.data();
        setItineraryDays(prev => {
          const filtered = prev.filter(d => d.id !== dayIdStr);
          return [...filtered, { id: dayIdStr, ...freshDayData }];
        });
      } else {
        // Fallback or refresh standard trip document to see if main days was updated
        const tripDocRef = doc(db, "trips", trip.id);
        const tripSnap = await getDoc(tripDocRef);
        if (tripSnap.exists()) {
          const freshTripData = { id: tripSnap.id, ...tripSnap.data() };
          setTrip(freshTripData);
        }
      }
    } catch (err) {
      console.error("Error fetching fresh day content from Firestore:", err);
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
  const groupSize = Number(trip?.groupSize) || 1;

  // Budget calculations
  const budgetPerPerson = Number(trip?.budgetPerPerson) || 0;
  const totalTripBudget = budgetPerPerson * groupSize;
  const currentTotalCost = Number(trip_metadata.total_estimated_cost_usd) || 0;
  const targetPct = totalTripBudget > 0 ? (currentTotalCost / totalTripBudget) * 100 : 0;
  const targetSpending = totalTripBudget * 0.8;
  const minTargetSpending = totalTripBudget * 0.75;
  const maxTargetSpending = totalTripBudget * 0.85;

  let budgetStatus = "Below Target";
  let statusColor = "text-amber-700 bg-amber-500/10 border-amber-500/20";
  let statusExplanation = `Current activity spending is under the recommended 75% - 85% range of your stated budget. You have plenty of head room!`;

  if (currentTotalCost >= minTargetSpending && currentTotalCost <= maxTargetSpending) {
    budgetStatus = "On Target (75-85%)";
    statusColor = "text-green-700 bg-green-500/10 border-green-500/20";
    statusExplanation = `Perfect! Your total activity spending sits beautifully in the targeted 75% - 85% range (80% optimal target) of your stated budget.`;
  } else if (currentTotalCost > maxTargetSpending) {
    budgetStatus = "Above Target (>85%)";
    statusColor = "text-red-700 bg-red-500/10 border-red-500/20";
    statusExplanation = `Heads up! Total activity spending has exceeded 85% of your stated budget. Consider choosing cheaper options during regeneration.`;
  }

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
    (day.activities || [])
      .map((act: any, aIdx: number) => ({
        activity_id: `${day.day_number}_${aIdx}`,
        name: act.venue_name || act.name,
        day_number: day.day_number,
        rawActivity: act,
        date: day.date
      }))
      .filter((act: any) => {
        const isClosed = act.rawActivity.google_places_verification?.reason === "permanently_closed" ||
                         act.rawActivity.google_places_verification?.reason === "temporarily_closed";
        return !isClosed;
      })
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
      <header className="fixed top-0 left-0 right-0 z-50 bg-brand-sand/80 backdrop-blur-md border-b border-brand-teal/5 py-3 px-4 sm:py-4 sm:px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:grid sm:grid-cols-3 items-center gap-2 sm:gap-0">
          
          {/* Dashboard Left / Mobile Header Top Row */}
          <div className="flex justify-between sm:justify-start items-center w-full sm:w-auto">
            <motion.button 
              whileHover={{ x: -4 }}
              onClick={() => navigate("/")} 
              className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-brand-teal/40 hover:text-brand-coral transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Dashboard
            </motion.button>

            {/* Mobile share button / version wrapper */}
            <div className="flex sm:hidden items-center gap-3">
              <span className="text-[10px] font-black uppercase tracking-widest text-[#6B7785]/80">v1.7</span>
              <button
                onClick={handleShare}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-brand-teal text-white rounded-full text-[9px] font-black uppercase tracking-widest hover:bg-brand-teal/90 shadow-lg shadow-brand-teal/10 transition-all"
              >
                <Share2 className="w-3 h-3" /> {copied ? "Copied!" : "Share"}
              </button>
            </div>
          </div>
          
          {/* Title Center */}
          <div className="flex flex-col items-center text-center w-full sm:auto">
            <h1 className="text-lg sm:text-xl md:text-2xl font-serif italic text-brand-teal leading-none">{trip_metadata.destination_resolved}</h1>
          </div>

          {/* Desktop Only Share Buttons */}
          <div className="hidden sm:flex items-center justify-end gap-4 w-full sm:w-auto">
            <span className="text-[10px] font-black uppercase tracking-widest text-[#6B7785]/80">v1.7</span>
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
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-teal/60">Curated Journey by Travlly</span>
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
              <span className="text-[10px] font-black uppercase tracking-widest text-brand-teal/20 mb-1">Est. Cost / Person</span>
              <span className="text-sm font-bold text-brand-accent">${(Number(trip_metadata.total_estimated_cost_usd) / groupSize).toFixed(0)}</span>
            </div>
            <div className="w-1 h-1 rounded-full bg-brand-teal/10" />
            <div className="flex flex-col items-center">
              <span className="text-[10px] font-black uppercase tracking-widest text-brand-teal/20 mb-1">Total Trip Cost</span>
              <span className="text-sm font-bold text-brand-teal">${trip_metadata.total_estimated_cost_usd}</span>
            </div>
          </div>
        </motion.section>

        {/* Dynamic Accommodation Panel */}
        {trip.trip_logistics?.has_accommodation && trip.trip_logistics?.accommodation_name && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[#FAF7F2] border border-brand-teal/15 rounded-3xl p-8 md:p-10 space-y-6 max-w-2xl mx-auto shadow-xl shadow-brand-teal/[0.01]"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">🏨</span>
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-brand-teal/50">Booked Accommodation</h3>
            </div>
            <div className="space-y-4">
              <div>
                <h4 className="text-3xl font-serif italic text-brand-teal leading-tight font-medium">
                  {trip.trip_logistics.accommodation_name}
                </h4>
                {trip.trip_logistics.accommodation_location && (
                  <p className="flex items-center gap-2 text-sm text-brand-teal/65 mt-2 font-light">
                    <MapPin className="w-4 h-4 text-brand-coral shrink-0" />
                    <span>{trip.trip_logistics.accommodation_location}</span>
                  </p>
                )}
                {trip.trip_logistics.accommodation_type && (
                  <span className="inline-block mt-3 px-3.5 py-1.5 bg-brand-teal/5 border border-brand-teal/10 rounded-full text-[10px] font-black uppercase tracking-widest text-brand-teal/60">
                    {trip.trip_logistics.accommodation_type}
                  </span>
                )}
              </div>
              <div className="pt-2 flex items-center gap-2 text-green-600 font-bold text-xs uppercase tracking-wider">
                <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
                <span>Booked ✓ <span className="font-light normal-case text-brand-teal/40">(not an algorithmic recommendation)</span></span>
              </div>
            </div>
          </motion.section>
        )}

        {/* Budget Targeting Panel */}
        {totalTripBudget > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[#FAF7F2] border border-brand-teal/15 rounded-3xl p-8 md:p-10 space-y-6 max-w-2xl mx-auto shadow-xl shadow-brand-teal/[0.01]"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-brand-teal/5 pb-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl">📊</span>
                <div>
                  <h3 className="text-xs font-black uppercase tracking-[0.2em] text-brand-teal/50">Active Budget Targeting</h3>
                  <p className="text-[10px] text-brand-teal/40">Maintaining total spending within target threshold</p>
                </div>
              </div>
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${statusColor}`}>
                {budgetStatus}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div className="bg-white/60 backdrop-blur-xs p-4 rounded-2xl border border-brand-teal/5">
                <span className="block text-[9px] font-black uppercase text-brand-teal/30 tracking-widest mb-1">Stated Budget</span>
                <span className="block text-2xl font-serif italic text-brand-teal">${totalTripBudget.toLocaleString()}</span>
                <span className="block text-[10px] text-brand-teal/40 mt-1">${budgetPerPerson}/person × {groupSize} people</span>
              </div>

              <div className="bg-white/60 backdrop-blur-xs p-4 rounded-2xl border border-brand-teal/5">
                <span className="block text-[9px] font-black uppercase text-brand-teal/30 tracking-widest mb-1">Target Spending (75-85%)</span>
                <span className="block text-base font-serif italic text-brand-accent">${minTargetSpending.toFixed(0)} - ${maxTargetSpending.toFixed(0)}</span>
                <span className="block text-[10px] text-brand-teal/40 mt-1">Optimal 80%: ${targetSpending.toFixed(0)}</span>
              </div>

              <div className="bg-white/60 backdrop-blur-xs p-4 rounded-2xl border border-brand-teal/5">
                <span className="block text-[9px] font-black uppercase text-brand-teal/30 tracking-widest mb-1">Current Spending</span>
                <span className="block text-2xl font-serif italic text-[#1A6B7A]">${currentTotalCost.toLocaleString()}</span>
                <span className="block text-[10px] text-brand-teal/40 mt-1">${(currentTotalCost / groupSize).toFixed(0)}/person ({targetPct.toFixed(0)}% used)</span>
              </div>
            </div>

            {/* Target Progress Bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-[9px] font-black uppercase tracking-wider text-brand-teal/40 px-1">
                <span>0% Budget Used</span>
                <span className="text-brand-accent">Target Range (75-85%)</span>
                <span>100% Stated Limit</span>
              </div>
              <div className="relative h-4 bg-white/50 rounded-full border border-brand-teal/10">
                {/* 75-85% highlighted region */}
                <div 
                  className="absolute top-0 bottom-0 bg-brand-accent/15 border-x border-brand-accent/20"
                  style={{ left: "75%", width: "10%" }}
                />
                {/* Current progress fill */}
                <div 
                  className="h-full bg-[#1A6B7A]/20 transition-all duration-500 rounded-full"
                  style={{ width: `${Math.min(100, targetPct)}%` }}
                />
                {/* Marker at current progress */}
                <div 
                  className="absolute top-0 bottom-0 w-1 bg-[#1A6B7A] flex items-center justify-center transition-all duration-500"
                  style={{ left: `${Math.min(100, targetPct)}%` }}
                >
                  <div className="w-2.5 h-2.5 rounded-full bg-brand-coral animate-ping absolute" />
                  <div className="w-1.5 h-1.5 rounded-full bg-[#1A6B7A] absolute" />
                </div>
              </div>
              <p className="text-xs text-brand-teal/60 font-light italic leading-relaxed pt-1">
                {statusExplanation}
              </p>
            </div>
          </motion.section>
        )}

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
                              onClick={() => handleOpenRegenModal(act.day_number)}
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

        {/* Local Lingo & Cultural Tips */}
        {trip && (lingoLoading || localLingo || !trip.local_lingo) && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-3xl overflow-hidden border border-brand-teal/5 shadow-xl shadow-brand-teal/[0.01]"
          >
            {/* Header */}
            <div className="bg-[#1A6B7A] text-white p-6 md:p-8 flex items-center justify-between gap-4">
              <div className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-[0.25em] text-brand-coral">Authentic Connection</span>
                <h3 className="text-2xl md:text-3xl font-serif italic flex items-center gap-2">
                  Local Lingo & Cultural Tips
                </h3>
                <p className="text-white/80 text-xs font-light">
                  Speak like a local and navigate customs and etiquettes with confidence.
                </p>
              </div>
            </div>

            {lingoLoading ? (
              <div className="p-12 flex flex-col items-center justify-center space-y-4 bg-[#FAF7F2]">
                <div className="w-10 h-10 border-4 border-brand-teal/10 border-t-brand-coral rounded-full animate-spin" />
                <p className="text-xs text-brand-teal/50 italic">Generating custom cultural guide for {trip.destination || "destination"}...</p>
              </div>
            ) : (!localLingo || (!localLingo.essential_phrases && !localLingo.common_slang && !localLingo.cultural_tips)) ? (
              /* EMPTY STATE / OBSCURE fallback */
              <div className="p-10 text-center space-y-3 bg-[#FAF7F2]">
                <p className="text-sm font-semibold text-brand-teal/70">Cultural tips coming soon for this destination</p>
                <p className="text-xs text-brand-teal/40 italic max-w-sm mx-auto">
                  We're still gathering authentic phrases and local insights for "{trip.destination || 'this location'}".
                </p>
              </div>
            ) : (
              /* CONTENT SECTIONS */
              <div className="p-6 md:p-8 space-y-6 bg-white">
                {/* 1. Essential Phrases (💬) */}
                <div className="border border-brand-teal/5 rounded-2xl overflow-hidden">
                  <header
                    onClick={() => setLingoSectionsExpanded(prev => ({ ...prev, phrases: !prev.phrases }))}
                    className="bg-[#FAF7F2] px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-brand-sand/10 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-xl">💬</span>
                      <h4 className="text-sm font-black uppercase tracking-wider text-brand-teal">Essential Phrases</h4>
                      <span className="px-2 py-0.5 bg-brand-teal/5 text-brand-teal text-[9px] font-black rounded-full">
                        {localLingo.essential_phrases?.length || 0} items
                      </span>
                    </div>
                    {lingoSectionsExpanded.phrases ? (
                      <ChevronUp className="w-4 h-4 text-brand-teal/50" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-brand-teal/50" />
                    )}
                  </header>
                  
                  <AnimatePresence initial={false}>
                    {lingoSectionsExpanded.phrases && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden border-t border-brand-teal/5 bg-white"
                      >
                        <div className="p-4 md:p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                          {localLingo.essential_phrases && localLingo.essential_phrases.length > 0 ? (
                            localLingo.essential_phrases.map((itm: any, idx: number) => (
                              <div key={idx} className="p-4 rounded-2xl bg-[#FAF7F2] border border-brand-teal/[0.03] space-y-2 hover:border-[#E87E5C]/20 transition-colors">
                                <div className="flex flex-wrap items-baseline gap-2">
                                  <span className="text-base font-bold text-[#E87E5C]">{itm.local}</span>
                                  <span className="text-xs text-brand-teal/30">•</span>
                                  <span className="text-sm font-medium text-brand-teal">{itm.english}</span>
                                </div>
                                <p className="text-xs text-brand-teal/60 font-light leading-relaxed">
                                  {itm.context}
                                </p>
                              </div>
                            ))
                          ) : (
                            <p className="text-xs text-brand-teal/40 italic p-4 col-span-full">No essential phrases available.</p>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* 2. Common Slang (🗣️) */}
                <div className="border border-brand-teal/5 rounded-2xl overflow-hidden">
                  <header
                    onClick={() => setLingoSectionsExpanded(prev => ({ ...prev, slang: !prev.slang }))}
                    className="bg-[#FAF7F2] px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-brand-sand/10 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-xl">🗣️</span>
                      <h4 className="text-sm font-black uppercase tracking-wider text-brand-teal">Common Slang</h4>
                      <span className="px-2 py-0.5 bg-brand-teal/5 text-brand-teal text-[9px] font-black rounded-full">
                        {localLingo.common_slang?.length || 0} items
                      </span>
                    </div>
                    {lingoSectionsExpanded.slang ? (
                      <ChevronUp className="w-4 h-4 text-brand-teal/50" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-brand-teal/50" />
                    )}
                  </header>

                  <AnimatePresence initial={false}>
                    {lingoSectionsExpanded.slang && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden border-t border-brand-teal/5 bg-white"
                      >
                        <div className="p-4 md:p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                          {localLingo.common_slang && localLingo.common_slang.length > 0 ? (
                            localLingo.common_slang.map((itm: any, idx: number) => (
                              <div key={idx} className="p-4 rounded-2xl bg-[#FAF7F2] border border-brand-teal/[0.03] space-y-2 hover:border-[#E87E5C]/20 transition-colors">
                                <div className="flex flex-wrap items-baseline gap-2 font-sans">
                                  <span className="text-base font-bold text-[#E87E5C]">{itm.local}</span>
                                  <span className="text-xs text-brand-teal/30">•</span>
                                  <span className="text-sm font-medium text-brand-teal">{itm.english}</span>
                                </div>
                                <p className="text-xs text-brand-teal/60 font-light leading-relaxed">
                                  {itm.context}
                                </p>
                              </div>
                            ))
                          ) : (
                            <div className="text-xs text-brand-teal/40 italic p-4 col-span-full">
                              No general slang listed. Speak standard language with a warm smile!
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* 3. Cultural Tips (🤝) */}
                <div className="border border-brand-teal/5 rounded-2xl overflow-hidden">
                  <header
                    onClick={() => setLingoSectionsExpanded(prev => ({ ...prev, tips: !prev.tips }))}
                    className="bg-[#FAF7F2] px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-brand-sand/10 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-xl">🤝</span>
                      <h4 className="text-sm font-black uppercase tracking-wider text-brand-teal">Cultural Tips (Do's & Don'ts)</h4>
                      <span className="px-2 py-0.5 bg-brand-teal/5 text-brand-teal text-[9px] font-black rounded-full">
                        {localLingo.cultural_tips?.length || 0} items
                      </span>
                    </div>
                    {lingoSectionsExpanded.tips ? (
                      <ChevronUp className="w-4 h-4 text-brand-teal/50" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-brand-teal/50" />
                    )}
                  </header>

                  <AnimatePresence initial={false}>
                    {lingoSectionsExpanded.tips && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden border-t border-brand-teal/5 bg-white"
                      >
                        <div className="p-4 md:p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                          {localLingo.cultural_tips && localLingo.cultural_tips.length > 0 ? (
                            localLingo.cultural_tips.map((itm: any, idx: number) => {
                              const isDo = itm.tip_type === "do" || String(itm.tip_type).toLowerCase() === "do";
                              return (
                                <div key={idx} className="p-4 rounded-2xl bg-[#FAF7F2] border border-brand-teal/[0.03] space-y-2 hover:border-[#E87E5C]/20 transition-colors flex gap-3 items-start">
                                  <span className={`text-xs font-black shrink-0 ${isDo ? "text-green-600" : "text-brand-coral"}`}>
                                    {isDo ? "✓ DO" : "✗ DON'T"}
                                  </span>
                                  <div className="space-y-1">
                                    <span className="text-xs font-bold text-brand-teal block">{itm.tip}</span>
                                    <p className="text-xs text-brand-teal/60 font-light leading-relaxed">
                                      {itm.explanation}
                                    </p>
                                  </div>
                                </div>
                              );
                            })
                          ) : (
                            <div className="text-xs text-brand-teal/40 italic p-4 col-span-full">
                              Be kind, respectful, and observant. That is always correct everywhere!
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
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
                      <span className="text-[10px] font-black uppercase tracking-[0.3em] text-brand-coral">
                        {day.day_number === trip_metadata.total_days && trip.trip_logistics?.has_flight && trip.trip_logistics?.flight_departure_datetime 
                          ? `Last Day (Day ${day.day_number})` 
                          : `Day ${day.day_number}`}
                      </span>
                      {day.isRegenerated && (
                        <span className="px-2 py-0.5 bg-brand-coral/10 text-brand-coral text-[8px] font-black tracking-widest uppercase rounded">
                          Regenerated
                        </span>
                      )}
                      
                      {day.day_number === 1 && trip.trip_logistics?.has_flight && trip.trip_logistics?.flight_arrival_datetime && (
                        <span className="px-2 py-0.5 bg-[#E87E5C]/15 border border-[#E87E5C]/20 text-[#E87E5C] text-[8px] font-black tracking-widest uppercase rounded flex items-center gap-1 leading-none">
                          ✈️ Arrival: {formatFlightTime(trip.trip_logistics.flight_arrival_datetime)}
                        </span>
                      )}
                      
                      {day.day_number === trip_metadata.total_days && trip.trip_logistics?.has_flight && trip.trip_logistics?.flight_departure_datetime && (
                        <span className="px-2 py-0.5 bg-brand-teal/10 border border-brand-teal/20 text-[#1A6B7A] text-[8px] font-black tracking-widest uppercase rounded flex items-center gap-1 leading-none">
                          ✈️ Departure: {formatFlightTime(trip.trip_logistics.flight_departure_datetime)}
                        </span>
                      )}

                      {day.estimated_day_cost_usd !== undefined && day.estimated_day_cost_usd !== null && day.estimated_day_cost_usd > 0 && (
                        <span className="px-2 py-0.5 bg-brand-teal/5 border border-brand-teal/10 text-[#1A6B7A] text-[8px] font-black tracking-widest uppercase rounded flex items-center gap-1 leading-none">
                          💰 Est: ${(Number(day.estimated_day_cost_usd) / groupSize).toFixed(2)}/person
                          {groupSize > 1 && (
                            <span className="opacity-50 font-normal">(${day.estimated_day_cost_usd} total)</span>
                          )}
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
                      onClick={() => handleOpenRegenModal(day.day_number)}
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
                  {day.activities
                    .map((activity: any, originalIndex: number) => ({ ...activity, originalIndex }))
                    .filter((activity: any) => {
                      const isClosed = activity.google_places_verification?.reason === "permanently_closed" ||
                                       activity.google_places_verification?.reason === "temporarily_closed";
                      return !isClosed;
                    })
                    .map((activity: any, renderedIndex: number) => {
                      const activityId = `${day.day_number}_${activity.originalIndex}`;

                      const likesCount = votes.filter(v => v.activity_id === activityId && v.vote_type === "like").length;
                      const dislikesCount = votes.filter(v => v.activity_id === activityId && v.vote_type === "dislike").length;
                      const userVote = votes.find(v => v.activity_id === activityId && v.voter_id === voterId);
                      const currentVoteType = userVote?.vote_type; // "like", "dislike", or undefined

                      const displayVenueName = activity.venue_name || activity.name;
                      const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${activity.venue_name || activity.name} ${activity.neighborhood || ""} ${trip_metadata.destination_resolved || ""}`)}`;

                      return (
                        <motion.div 
                          key={activity.originalIndex}
                          whileHover={{ x: 6 }}
                        className="group relative pl-8 pb-12 border-l border-brand-teal/5 last:border-0"
                      >
                        <div className="absolute left-[-5px] top-1.5 w-2.5 h-2.5 rounded-full bg-brand-sand border-2 border-brand-accent group-hover:bg-brand-coral group-hover:border-brand-coral transition-colors" />
                        
                        <div className="space-y-4">
                          <div className="flex flex-wrap items-center justify-between gap-4">
                            <div className="flex items-center flex-wrap gap-3">
                              <span className="text-xs font-black text-brand-teal/20 tabular-nums">{activity.start_time}</span>
                              <h4 className="text-2xl font-bold text-brand-teal group-hover:text-brand-coral transition-all leading-tight">
                                {activity.venue_name ? (
                                  <a
                                    href={mapsUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title="Open in Google Maps"
                                    className="inline-flex items-center gap-1.5 hover:underline decoration-brand-coral/30 hover:text-brand-coral decoration-2 underline-offset-4 transition-all"
                                  >
                                    <MapPin className="w-5 h-5 text-brand-coral/80 shrink-0" />
                                    <span>{displayVenueName}</span>
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
                              href={mapsUrl}
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
                                      ? "bg-brand-coral text-white border border-transparent shadow-sm shadow-brand-coral/25"
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
                                      ? "bg-brand-teal text-white border border-transparent shadow-sm shadow-brand-teal/20"
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
                              <DollarSign className="w-3 h-3 text-brand-coral" /> ${(Number(activity.estimated_cost_usd) / groupSize).toFixed(2)}/person
                              {groupSize > 1 && (
                                <span className="opacity-50 font-normal lowercase">(${activity.estimated_cost_usd} total)</span>
                              )}
                            </span>
                            <span className="text-[9px] font-medium text-brand-teal/40 italic flex flex-wrap items-center gap-1.5">
                              <MapPin className="w-3.5 h-3.5 text-brand-teal/30 shrink-0" />
                              <span>{activity.neighborhood || "Local District"}</span>
                              {activity.name && activity.name !== activity.venue_name && (
                                <>
                                  <span className="opacity-60">—</span>
                                  <span className="font-semibold text-brand-teal/50">{activity.name}</span>
                                </>
                              )}
                            </span>
                          </div>

                          {activity.transit_notes && (
                            <div className="p-4 bg-brand-sand/50 rounded-xl border border-brand-teal/[0.03] text-sm italic font-light text-brand-teal/60">
                              {activity.transit_notes}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}

                  {/* Travel Legs / Transit to Hotel Option */}
                  {trip.trip_logistics?.has_accommodation && trip.trip_logistics?.accommodation_name && (day.day_number !== trip_metadata.total_days || !trip.trip_logistics?.flight_departure_datetime) && (
                    <motion.div
                      whileHover={{ x: 6 }}
                      className="group relative pl-8 pb-4 border-l border-brand-teal/5 last:border-0"
                    >
                      <div className="absolute left-[-5px] top-1.5 w-2.5 h-2.5 rounded-full bg-brand-sand border-2 border-brand-coral group-hover:bg-[#E87E5C] group-hover:border-[#E87E5C] transition-colors" />
                      
                      <div className="space-y-3 bg-[#FAF7F2]/80 p-5 rounded-2xl border border-brand-teal/[0.04]">
                        <div className="flex items-center gap-2">
                          <span className="text-sm">🚗</span>
                          <span className="text-[10px] font-black uppercase tracking-[0.25em] text-[#E87E5C]">Transit to Hotel Loft</span>
                        </div>
                        <div className="space-y-1">
                          <h4 className="text-lg font-bold text-brand-teal">
                            Commute to {trip.trip_logistics.accommodation_name}
                          </h4>
                          <p className="text-xs text-brand-teal/50 font-light leading-relaxed">
                            Conclude the day's adventures and head back to your home base in {trip.trip_logistics.accommodation_location || "the city center"}.
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-4 pt-1">
                          <span className="text-[9px] font-black uppercase tracking-widest text-[#1A6B7A] bg-brand-teal/5 px-2.5 py-1 rounded-md">
                            Commute: ~20-25 mins
                          </span>
                          <span className="text-[9px] font-black uppercase tracking-widest text-brand-coral bg-brand-coral/5 px-2.5 py-1 rounded-md">
                            Mode: Taxi / Car / Scooter
                          </span>
                          <span className="text-[9px] font-black uppercase tracking-widest text-brand-teal/40 bg-brand-teal/[0.02] px-2.5 py-1 rounded-md">
                            Est. Cost: $5 - $12
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  )}
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
              onClick={() => {
                if (!regeneratingLoading) {
                  if (activitiesToRemove.length > 0 || additionalActivities > 0 || regenText || regenChips.length > 0) {
                    setSuccessToast("Changes discarded. Your day is unchanged.");
                    setTimeout(() => setSuccessToast(null), 3000);
                  }
                  setShowRegenModal(false);
                  setRegenText("");
                  setRegenChips([]);
                  setActivitiesToRemove([]);
                  setAdditionalActivities(0);
                  setRegenWarningAllRemoved(false);
                  setRegenError(null);
                }
              }}
            />

            {/* Modal Box */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-brand-teal/5 overflow-hidden z-[120] flex flex-col max-h-[85vh]"
            >
              {/* Header */}
              <div className="space-y-1.5 p-6 sm:p-8 pb-4 shrink-0 border-b border-brand-teal/5">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-coral">AI Assistant Editor</span>
                <h3 className="text-2xl sm:text-3xl font-serif italic text-brand-teal">Regenerate Day {selectedRegenDay}</h3>
                <p className="text-xs text-brand-teal/40 italic font-light">Custom tune this day’s schedule to match your team’s latest feedback.</p>
              </div>

              {regeneratingLoading ? (
                // LOADING STATE
                <div className="p-8 flex-1 flex flex-col items-center justify-center text-center space-y-6">
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
                <div className="flex-1 flex flex-col min-h-0 bg-white">
                  {/* Scrollable Content Container */}
                  <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6">
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

                    {/* SECTION 1: REMOVE SPECIFIC ACTIVITIES */}
                    <div className="space-y-3">
                      <span className="text-[10px] font-black uppercase tracking-widest text-brand-teal/40 block">
                        Remove specific activities (optional)
                      </span>
                      <div className="space-y-2">
                        {currentDayActivities.map((act: any, idx: number) => {
                          const isChecked = activitiesToRemove.includes(idx);
                          return (
                            <div
                              key={idx}
                              onClick={() => {
                                setActivitiesToRemove(prev => {
                                  const exists = prev.includes(idx);
                                  const updated = exists ? prev.filter(i => i !== idx) : [...prev, idx];
                                  if (updated.length !== currentDayActivities.length) {
                                    setRegenWarningAllRemoved(false);
                                  }
                                  return updated;
                                });
                              }}
                              className={`flex items-center gap-3 p-3 text-left cursor-pointer rounded-2xl border transition-all ${
                                isChecked
                                  ? "bg-[#FFE5E5] border-red-200"
                                  : "bg-brand-sand/10 border-brand-teal/5 hover:bg-brand-sand/20 hover:border-brand-teal/15"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {}} // toggled by outer onClick card click
                                className="w-4 h-4 rounded text-brand-coral border-brand-teal/20 focus:ring-brand-coral shrink-0"
                              />
                              <div className="min-w-0 flex-1">
                                <div className={`text-xs font-bold leading-tight ${isChecked ? "text-red-900 line-through" : "text-brand-teal"}`}>
                                  {act.venue_name || act.name}
                                </div>
                                <div className="flex flex-wrap items-center gap-2 mt-1 text-[10px] text-brand-teal/40">
                                  ${(act.start_time || act.time) && (
                                    <span>{act.start_time || act.time}</span>
                                  )}
                                  {(act.duration_minutes !== undefined || act.duration) && (
                                    <>
                                      <span className="hidden sm:inline">•</span>
                                      <span className="hidden sm:inline">{act.duration_minutes !== undefined ? `${act.duration_minutes}m` : act.duration}</span>
                                    </>
                                  )}
                                  {(act.estimated_cost_usd !== undefined || act.cost) && (
                                    <>
                                      <span>•</span>
                                      <span>
                                        ${(Number(act.estimated_cost_usd ?? act.cost) / groupSize).toFixed(2)}/person
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Dynamic Confirmation Warning Box */}
                    {regenWarningAllRemoved && (
                      <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-[11px] text-red-700 italic font-medium leading-relaxed">
                        ⚠️ You're removing all activities. At least one must remain or be generated. Regenerate to get a fresh day.
                      </div>
                    )}

                    {/* SECTION 2: CHIPS & CUSTOM CONSTRAINTS */}
                    <div className="border-t border-brand-teal/5 pt-4 space-y-4">
                      {/* Add more activities picker */}
                      <div className="bg-brand-sand/15 p-4 rounded-2xl border border-brand-teal/5 space-y-3">
                        <div>
                          <span className="text-[10px] font-black uppercase tracking-widest text-brand-teal/40 block">
                            Add more activities (optional)
                          </span>
                          <span className="text-[11px] text-brand-teal/50 font-medium mt-1 block">
                            Currently {currentDayActivities.length - activitiesToRemove.length} active + {additionalActivities} new = {currentDayActivities.length - activitiesToRemove.length + additionalActivities} total activities
                          </span>
                        </div>
                        
                        <div className="flex flex-wrap items-center gap-2">
                          {[0, 1, 2, 3, 4, 5].map((num) => {
                            const active = additionalActivities === num;
                            return (
                              <button
                                key={num}
                                type="button"
                                onClick={() => setAdditionalActivities(num)}
                                className={`w-9 h-9 rounded-xl text-xs font-black transition-all flex items-center justify-center border ${
                                  active
                                    ? "bg-brand-coral text-white border-brand-coral shadow-md shadow-brand-coral/15"
                                    : "bg-white text-brand-teal border-brand-teal/10 hover:border-brand-teal/25"
                                }`}
                              >
                                +{num}
                              </button>
                            );
                          })}
                          <span className="text-[11px] text-brand-teal/40 italic font-medium ml-2">
                            {additionalActivities === 0 ? "No extra" : `${additionalActivities} additional`}
                          </span>
                        </div>
                      </div>

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
                          rows={2}
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
                    </div>
                  </div>

                  {/* Fixed Footer Action Buttons */}
                  <div className="p-6 sm:p-8 pt-4 border-t border-brand-teal/5 bg-white shrink-0 flex items-center justify-end gap-3 w-full mt-auto">
                    <button
                      type="button"
                      onClick={() => {
                        if (activitiesToRemove.length > 0 || additionalActivities > 0 || regenText || regenChips.length > 0) {
                          setSuccessToast("Changes discarded. Your day is unchanged.");
                          setTimeout(() => setSuccessToast(null), 3000);
                        }
                        setShowRegenModal(false);
                        setRegenText("");
                        setRegenChips([]);
                        setActivitiesToRemove([]);
                        setAdditionalActivities(0);
                        setRegenWarningAllRemoved(false);
                        setRegenError(null);
                      }}
                      className="px-6 py-3 border border-brand-teal/10 hover:bg-brand-sand/20 rounded-xl text-xs font-black uppercase tracking-widest text-brand-teal"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const total = currentDayActivities.length;
                        if (total > 0 && activitiesToRemove.length === total && !regenWarningAllRemoved) {
                          setRegenWarningAllRemoved(true);
                          return;
                        }
                        handleRegenerateDaySubmit();
                      }}
                      className="px-6 py-3 bg-brand-coral hover:bg-brand-coral/90 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-xl shadow-brand-coral/10 hover:scale-[1.02] active:scale-[0.98]"
                    >
                      {regenWarningAllRemoved ? "Confirm & Regenerate" : "Regenerate"}
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

                        {version.regeneration_reason && (
                          <div className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200/40 px-3 py-1.5 rounded-xl font-medium">
                            <span className="font-extrabold text-brand-coral uppercase tracking-wider text-[9px] mr-1.5">Changes:</span>
                            {version.regeneration_reason}
                          </div>
                        )}

                        {version.day_notes && (
                          <p className="text-xs italic text-brand-teal/50 font-light border-l-2 border-brand-accent/20 pl-3">
                            "{version.day_notes}"
                          </p>
                        )}

                        <div className="space-y-3">
                          {version.activities && version.activities.filter((act: any) => {
                            const isClosed = act.google_places_verification?.reason === "permanently_closed" ||
                                             act.google_places_verification?.reason === "temporarily_closed";
                            return !isClosed;
                          }).map((act: any, aIdx: number) => (
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

      <div className="max-w-6xl mx-auto px-6 mt-16 pb-10">
        <Footer />
      </div>
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

function formatFlightTime(dateTimeVal: any): string {
  if (!dateTimeVal) return "";
  let d: Date;
  if (typeof dateTimeVal.toDate === "function") {
    d = dateTimeVal.toDate();
  } else if (dateTimeVal.seconds !== undefined) {
    d = new Date(dateTimeVal.seconds * 1000);
  } else {
    d = new Date(dateTimeVal);
  }
  if (isNaN(d.getTime())) return "Invalid Time";
  const hours = String(d.getUTCHours()).padStart(2, '0');
  const minutes = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

