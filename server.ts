import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

// Define Gemini JSON Output Schemas to guarantee syntax-perfect responses
const itinerarySchema = {
  type: Type.OBJECT,
  properties: {
    clarification_needed: {
      type: Type.STRING,
      description: "If the destination is ambiguous (e.g. 'Cambridge' which could be UK or US), populate this clarification request message instead of generating an itinerary. If not ambiguous, omit this field."
    },
    trip_metadata: {
      type: Type.OBJECT,
      properties: {
        destination_resolved: { type: Type.STRING },
        trip_start_date: { type: Type.STRING },
        trip_end_date: { type: Type.STRING },
        total_days: { type: Type.INTEGER },
        total_estimated_cost_usd: { type: Type.NUMBER },
        currency: { type: Type.STRING },
        trip_alerts: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      },
      required: [
        "destination_resolved",
        "trip_start_date",
        "trip_end_date",
        "total_days",
        "total_estimated_cost_usd",
        "currency",
        "trip_alerts"
      ]
    },
    days: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          day_number: { type: Type.INTEGER },
          date: { type: Type.STRING },
          day_notes: { type: Type.STRING },
          estimated_day_cost_usd: { type: Type.NUMBER },
          weather_dependency: { type: Type.STRING },
          activities: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                name: { type: Type.STRING },
                description: { type: Type.STRING },
                category: { type: Type.STRING },
                start_time: { type: Type.STRING },
                duration_minutes: { type: Type.INTEGER },
                estimated_cost_usd: { type: Type.NUMBER },
                neighborhood: { type: Type.STRING },
                venue_name: { type: Type.STRING },
                transit_notes: { type: Type.STRING },
                verify_hours: { type: Type.BOOLEAN }
              },
              required: [
                "id", "name", "description", "category", "start_time",
                "duration_minutes", "estimated_cost_usd", "neighborhood",
                "venue_name", "transit_notes", "verify_hours"
              ]
            }
          }
        },
        required: [
          "day_number", "date", "day_notes", "estimated_day_cost_usd",
          "weather_dependency", "activities"
        ]
      }
    }
  }
};

const weatherSchema = {
  type: Type.OBJECT,
  properties: {
    month: { type: Type.STRING },
    season: { type: Type.STRING },
    average_temp: { type: Type.STRING },
    weather_conditions: { type: Type.STRING },
    apparel_prep: { type: Type.STRING },
    gear_prep: { type: Type.STRING },
    weather_icon: { type: Type.STRING }
  },
  required: [
    "month", "season", "average_temp", "weather_conditions",
    "apparel_prep", "gear_prep", "weather_icon"
  ]
};

const lingoSchema = {
  type: Type.OBJECT,
  properties: {
    destination: { type: Type.STRING },
    essential_phrases: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          local: { type: Type.STRING },
          english: { type: Type.STRING },
          context: { type: Type.STRING }
        },
        required: ["local", "english", "context"]
      }
    },
    common_slang: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          local: { type: Type.STRING },
          english: { type: Type.STRING },
          context: { type: Type.STRING }
        },
        required: ["local", "english", "context"]
      }
    },
    cultural_tips: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          tip_type: { type: Type.STRING },
          tip: { type: Type.STRING },
          explanation: { type: Type.STRING }
        },
        required: ["tip_type", "tip", "explanation"]
      }
    }
  },
  required: ["destination", "essential_phrases", "common_slang", "cultural_tips"]
};

const regenerateDaySchema = {
  type: Type.OBJECT,
  properties: {
    day_number: { type: Type.INTEGER },
    date: { type: Type.STRING },
    day_notes: { type: Type.STRING },
    estimated_day_cost_usd: { type: Type.NUMBER },
    weather_dependency: { type: Type.STRING },
    activities: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          name: { type: Type.STRING },
          description: { type: Type.STRING },
          category: { type: Type.STRING },
          start_time: { type: Type.STRING },
          duration_minutes: { type: Type.INTEGER },
          estimated_cost_usd: { type: Type.NUMBER },
          neighborhood: { type: Type.STRING },
          venue_name: { type: Type.STRING },
          transit_notes: { type: Type.STRING },
          verify_hours: { type: Type.BOOLEAN }
        },
        required: [
          "id", "name", "description", "category", "start_time",
          "duration_minutes", "estimated_cost_usd", "neighborhood",
          "venue_name", "transit_notes", "verify_hours"
        ]
      }
    }
  },
  required: [
    "day_number", "date", "day_notes", "estimated_day_cost_usd",
    "weather_dependency", "activities"
  ]
};

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route for Itinerary Generation
  app.post("/api/generate-itinerary", async (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY;
    console.log("Using API Key of length:", apiKey?.length, "starts with:", apiKey?.substring(0, 3));
    
    if (!apiKey) {
      return res.status(500).json({ error: "Gemini API key is missing. Please configure it in Settings." });
    }

    const { tripBrief, trip_logistics } = req.body;
    if (!tripBrief) {
      return res.status(400).json({ error: "Trip brief is required." });
    }

    let queryContents = tripBrief;
    if (trip_logistics) {
      queryContents += `\n\n### ADDITIONAL TRIP LOGISTICS AND CONSTRAINTS ###\n`;
      if (trip_logistics.has_flight) {
        if (trip_logistics.flight_arrival_datetime) {
          const arrivalDt = new Date(trip_logistics.flight_arrival_datetime);
          if (!isNaN(arrivalDt.getTime())) {
            const hours = String(arrivalDt.getUTCHours()).padStart(2, '0');
            const minutes = String(arrivalDt.getUTCMinutes()).padStart(2, '0');
            const timeStr = `${hours}:${minutes}`;
            const dateStr = arrivalDt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
            queryContents += `
- Day 1 Start Type: flight_arrival
- Airport: ${trip_logistics.airport_name || "Airport"}
- Flight Arrival: ${timeStr} (24-hour style) on ${dateStr}
- Day 1 Recommendations / Instructions: Day 1 activities MUST start after ${timeStr} (24-hour format) arrival at ${trip_logistics.airport_name || "Airport"} (plus 1 hour for exit and transfers). Suggest 2-3 light activities on Day 1 only (specifically, airport transfer to accommodation, check-in, and evening meal / lightweight evening option only). Full sightseeing activities start on Day 2.
`;
          }
        }
        if (trip_logistics.flight_departure_datetime) {
          const departureDt = new Date(trip_logistics.flight_departure_datetime);
          if (!isNaN(departureDt.getTime())) {
            const hours = String(departureDt.getUTCHours()).padStart(2, '0');
            const minutes = String(departureDt.getUTCMinutes()).padStart(2, '0');
            const timeStr = `${hours}:${minutes}`;
            const dateStr = departureDt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
            const exitTime = new Date(departureDt.getTime() - 2 * 60 * 60 * 1000);
            const exitHours = String(exitTime.getUTCHours()).padStart(2, '0');
            const exitMinutes = String(exitTime.getUTCMinutes()).padStart(2, '0');
            const exitTimeStr = `${exitHours}:${exitMinutes}`;

            queryContents += `
- Last Day End Type: flight_departure
- Airport: ${trip_logistics.airport_name || "Airport"}
- Flight Departure: ${timeStr} (24-hour style) on ${dateStr}
- Last Day Recommendations / Instructions: Last day must end by ${exitTimeStr} (24-hour format, at least 2 hours before departure) for flight transfer at ${trip_logistics.airport_name || "Airport"}. Recommend light activities only (e.g., breakfast or short walking, then transfer to airport). No all-day or long-duration activities.
`;
          }
        }
      }

      if (trip_logistics.has_accommodation) {
        queryContents += `
- Accommodation Name: ${trip_logistics.accommodation_name}
- Accommodation Location/Neighborhood: ${trip_logistics.accommodation_location}
- Instruction: Do NOT recommend any hotels, resorts, or accommodations in the day-by-day activities. Focus the activities and prioritize them near ${trip_logistics.accommodation_location} (within 15-20 min travel time). If an activity is far from the accommodation (>30 minutes), note travel time explicitly in the "transit_notes".
`;
      }
    }

    try {
      const genAI = new GoogleGenAI({ 
        apiKey: apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      let response;
      let retries = 3;
      while (retries > 0) {
        try {
          response = await genAI.models.generateContent({
            model: "gemini-3.5-flash",
            contents: queryContents,
            config: {
              systemInstruction: `You are an experienced local travel planner who creates realistic, well-paced group itineraries. You will be given a Trip Brief with destination, dates, group size, budget per person, vibe tags, pace preference, and optional notes. 

IMPORTANT: In this version of the system, there is no downstream venue verification, so populate all venue details yourself. For any venue where you are not confident about current operating hours, set verify_hours: true and use conservative time estimates.

Your itinerary must:
1. Strict Budget Spending & Targeting:
   - Calculate the total trip budget as [budget_per_person × group_size].
   - Target overall spending (namely, the sum of all estimated_cost_usd of all activities across all days) to be exactly 80% of this total trip budget.
   - The total of all activity costs must stay strictly between 75% and 85% of the total trip budget. Allocate individual activity and meals costs realistically so their sum achieves this target.
2. Account for realistic travel time between consecutive activities (assume 20–40 minutes by local transit unless distances are clearly walkable, longer in cities known for congestion such as Jakarta, Bangkok, Manila, or Ho Chi Minh City)
3. Sequence activities geographically so the group is not crisscrossing the city
4. Front-load weather-dependent activities (beaches, hikes, outdoor markets, viewpoints) to earlier in the trip where possible
5. Reflect the vibe tags in your recommendations, weighted by their order of selection
6. Include 3 to 5 activities per day for relaxed pace, 4 to 6 for balanced, 5 to 7 for packed
7. Each activity description should be 2 to 3 sentences, written in a warm but practical tone — not marketing copy

If trip_logistics.day_1_start_type == "flight_arrival":
- Day 1 activities start AFTER flight arrival time + 1 hour (for airport exit, transfer, check-in)
- Recommend only 2-3 light activities on Day 1 (meal + walk, not full day)
- Start full activities on Day 2
If trip_logistics.last_day_end_type == "flight_departure":
- Last day must have airport transfer 2 hours before departure
- No activities after 2 hours before departure
- Recommend light activities only (meal, nearby walk)
If trip_logistics.accommodation_name:
- Do NOT recommend hotels or accommodations in activities
- Prioritize activities within 20 min of accommodation
- If activity is far (>30 min), note distance in transit_notes
- If far activity is important (popular destination), include it but note travel time

SPECIFIC TIME PERIODS:
Every activity must have a concrete start_time in 24-hour format (e.g. '09:00', '14:30', '19:45') and a duration_minutes field with a realistic integer value. Do not use vague time labels like 'morning' or 'evening.' Build in transit gaps between activities — do not schedule a 12:00 activity ending at 13:00 followed immediately by a 13:00 activity in a different neighborhood. Account for meal times explicitly: breakfast windows (07:00–09:30), lunch windows (12:00–14:00), and dinner windows (18:30–21:00) should contain food activities unless the trip vibe explicitly de-prioritizes scheduled meals. Respect typical local rhythms: in Southeast Asia, factor in midday heat (12:00–15:00 is often better for indoor or shaded activities); in Spain or Italy, account for siesta closures and late dinner culture; in Japan, account for early restaurant closures (last orders often 21:00).

VENUE SPECIFICITY:
Provide specific, real, named venues — not generic placeholders. Write 'Locavore NXT' not 'a fine-dining restaurant in Ubud.' Write 'Naoshima Art House Project' not 'a contemporary art installation.' Include the neighborhood or district name with every venue to disambiguate (e.g., 'Warung Babi Guling Ibu Oka, Ubud' rather than just 'Warung Babi Guling Ibu Oka').

TRANSIT NOTES:
For every activity, populate a transit_notes field describing access considerations. Account for known recurring patterns: Jakarta's rush hour congestion on weekdays (07:00–10:00 and 16:00–20:00); Bangkok's Sukhumvit and Silom congestion during the same windows; Friday afternoon mosque-adjacent road closures in some neighborhoods; weekend festival or market closures that turn certain streets into pedestrian zones. Where a route between two consecutive activities is likely to involve known congestion, increase the assumed transit time accordingly.

DATE-AWARENESS:
Calculate the specific weekday for each day of the trip. If the trip overlaps a known major holiday or event (Nyepi in Bali, Songkran in Thailand, Chinese New Year, Eid, etc.), include a top-level trip_alerts array warning the user.

SEQUENCING RULES:
Before finalizing each day: (1) verify there is at least 20 minutes of buffer between the end of one activity and the start of the next; (2) verify the day's total estimated cost does not exceed the daily budget by more than 20%; (3) verify weather-dependent activities are sequenced to early in the trip where possible.

AMBIGUITY HANDLING:
If the destination is ambiguous (e.g., 'Cambridge' could be UK or US), populate 'clarification_needed' explaining the ambiguity. Otherwise, leave 'clarification_needed' empty, and fully populate the itinerary fields.`,
              responseMimeType: "application/json",
              responseSchema: itinerarySchema,
            },
          });
          break; // Success
        } catch (error: any) {
          retries--;
          console.error(`Gemini Error (retries left: ${retries}):`, error);
          if (retries === 0) throw error;
          await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3s before retry
        }
      }

      let text = response.text.trim();
      
      // Clean up markdown if AI accidentally included it
      if (text.includes("{")) {
        const start = text.indexOf("{");
        const end = text.lastIndexOf("}");
        if (start !== -1 && end !== -1) {
          text = text.substring(start, end + 1);
        }
      }

      const itinerary = JSON.parse(text);
      res.json(itinerary);
    } catch (error: any) {
      console.error("Gemini Error:", error);
      res.status(500).json({ error: "Failed to generate itinerary.", details: error.message });
    }
  });

  // API Route for typical weather info and packing preparation advice
  app.get("/api/weather-info", async (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Gemini API key is missing. Please configure it in Settings." });
    }

    const { destination, date } = req.query;
    if (!destination) {
      return res.status(400).json({ error: "Destination parameter is required." });
    }

    // derive month name for travel period
    let monthName = "the trip month";
    if (date) {
      const parsedDate = new Date(date as string);
      if (!isNaN(parsedDate.getTime())) {
        monthName = parsedDate.toLocaleString("en-US", { month: "long" });
      } else {
        monthName = date as string;
      }
    }

    try {
      const genAI = new GoogleGenAI({ 
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const response = await genAI.models.generateContent({
        model: "gemini-3.5-flash",
        contents: `Provide typical climate, weather patterns, and list of items to pack/prepare for traveling to: "${destination}" in the month of: "${monthName}". Your advice must focus on the seasons (summer, winter, monsoon, autumn, snow, etc.), what kind of typical weather condition is expected, and concrete recommendations for what to prepare.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: weatherSchema,
        }
      });

      let text = response.text.trim();
      if (text.includes("{")) {
        const start = text.indexOf("{");
        const end = text.lastIndexOf("}");
        if (start !== -1 && end !== -1) {
          text = text.substring(start, end + 1);
        }
      }

      const weatherData = JSON.parse(text);
      res.json(weatherData);
    } catch (error: any) {
      console.error("Weather Info error:", error);
      res.status(500).json({ error: "Failed to get weather details", details: error.message });
    }
  });

  // API Route for Local Lingo Generation
  app.post("/api/generate-lingo", async (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Gemini API key is missing. Please configure it in Settings." });
    }

    const { destination } = req.body;
    if (!destination) {
      return res.status(400).json({ error: "Destination parameter is required." });
    }

    try {
      const genAI = new GoogleGenAI({ 
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const systemInstruction = "You are a cultural guide expert. Generate authentic local phrases, slang, and cultural tips for travelers visiting a specific destination. Focus on practical, respectful communication and cultural sensitivity. Format your response as JSON with three sections: essential_phrases, common_slang, and cultural_tips.";

      const prompt = `Generate local lingo and cultural tips for travelers visiting ${destination}.

Return JSON with:
{
  "destination": "${destination}",
  "essential_phrases": [
    {
      "local": "phrase in local language",
      "english": "English translation",
      "context": "When/how to use this phrase (1-2 sentences)"
    }
  ],
  "common_slang": [
    {
      "local": "slang term",
      "english": "English translation/concept",
      "context": "What this means culturally (1-2 sentences)"
    }
  ],
  "cultural_tips": [
    {
      "tip_type": "do" or "don't",
      "tip": "The actual tip (short phrase)",
      "explanation": "Why this matters (1-2 sentences)"
    }
  ]
}`;

      const response = await genAI.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: lingoSchema,
        }
      });

      let text = response.text.trim();
      if (text.includes("{")) {
        const start = text.indexOf("{");
        const end = text.lastIndexOf("}");
        if (start !== -1 && end !== -1) {
          text = text.substring(start, end + 1);
        }
      }

      const lingo = JSON.parse(text);
      res.json(lingo);
    } catch (error: any) {
      console.error("Lingo generation error:", error);
      res.status(500).json({ error: "Failed to generate local lingo guide.", details: error.message });
    }
  });

  // API Route for Day Regeneration
  app.post("/api/days/:dayId/regenerate", async (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Gemini API key is missing. Please configure it in Settings." });
    }

    const dayId = req.params.dayId;
    const { 
      trip_id, 
      constraints_text, 
      constraint_chips,
      original_day,
      destination,
      budget,
      vibe_tags,
      disliked_activities,
      removed_activities,
      start_date,
      end_date,
      additional_activities_count
    } = req.body;

    if (!trip_id) {
      return res.status(400).json({ error: "trip_id parameter is required." });
    }

    try {
      const genAI = new GoogleGenAI({ 
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const chipsString = constraint_chips && constraint_chips.length > 0
        ? constraint_chips.join(", ")
        : "None";

      const dislikesString = disliked_activities && disliked_activities.length > 0
        ? disliked_activities.join("\n")
        : "None";

      const originalDayJson = original_day ? JSON.stringify(original_day, null, 2) : "Unknown";

      const originalCount = (original_day && original_day.activities) ? original_day.activities.length : 0;
      const removedCount = (removed_activities && removed_activities.length) || 0;
      const additionalCount = Number(additional_activities_count) || 0;

      // Build consolidated constraints message for AI
      const constraintParts = [];
      if (removed_activities && removed_activities.length > 0) {
        constraintParts.push(`Remove these activities: ${removed_activities.join(", ")}`);
      }
      if (additionalCount > 0) {
        const estRemaining = Math.max(0, originalCount - removedCount);
        const totalActivitiesNeeded = estRemaining + additionalCount;
        constraintParts.push(`Generate ${totalActivitiesNeeded} total activities for Day ${dayId}. Current day has ${originalCount} activities. We are removing ${removedCount} and wanting to add ${additionalCount} more new activities.`);
      }
      if (constraint_chips && constraint_chips.length > 0) {
        constraintParts.push(`Apply these adjustments: ${constraint_chips.join(", ")}`);
      }
      if (constraints_text) {
        constraintParts.push(`Additional: ${constraints_text}`);
      }
      const combinedConstraints = constraintParts.length > 0 
        ? constraintParts.join("\n")
        : "Make it more interesting and better structured";

      const systemInstruction = `You are an experienced local travel planner who creates realistic, well-paced group itineraries. You will be given a request to REGENERATE only Day ${dayId} of an existing itinerary.
You must return ONLY a valid JSON object matching the exact schema provided, with no surrounding text, no markdown code fences, and no explanation.

IMPORTANT: Maintain realistic travel times, restaurant operating hours, and sequence activities geographically within the same day so travelers don't crisscross. Keep the total cost similar to the original day’s budget. Match the original style of the activities.`;

      const prompt = `Please regenerate only Day ${dayId} of an itinerary for: "${destination}".
Original Trip details:
- Dates: ${start_date} to ${end_date}
- Vibes: ${vibe_tags ? vibe_tags.join(", ") : "general"}
- Original budget per person: USD ${budget || "unknown"}

Current activities for Day ${dayId}:
${originalDayJson}

USER REQUEST FOR REGENERATION & CONSTRAINTS:
${combinedConstraints}

GROUP FEEDBACK / DISLIKED ACTIVITIES FROM VOTING TO AVOID:
${dislikesString}

CONSTRAINT RULES BASED ON REQUESTED ITEMS:
- if "cheaper options" is in the constraints: prioritize free/low-cost activities, skip paid experiences
- if "more food focus" is in the constraints: increase % of food-related activities (e.g. delicious lunch, local bites, unique dinner spots)
- if "less walking" is in the constraints: reduce transit time, choose nearby key activities
- if "indoor alternatives" is in the constraints: replace outdoor activities with comparable indoor equivalents
- if "more adventure" is in the constraints: add active/sport/nature activities, reduce passive sightseeing

ADDITIONAL REGENERATION RULES:
- Do NOT include any of the removed activities: ${removed_activities && removed_activities.length > 0 ? removed_activities.join(", ") : "None"}
- If additional activities count is requested (${additionalCount} extra), the total number of activities for Day ${dayId} should be ${originalCount - removedCount + additionalCount}. Keep and preserve the remaining original activities, and append ${additionalCount} new interesting activities to fill the day's schedule.
- Respect the time/cost structure of the day
- Incorporate the requested adjustments
- Maintain geographic coherence
- Keep total day cost similar to original

Return ONLY a single valid JSON object matching this exact structure for Day ${dayId} (Do not wrap this in any other fields or arrays):
{
  "day_number": ${Number(dayId) || 1},
  "date": "${original_day?.date || ""}",
  "day_notes": "A brief 1-sentence note summarizing the main theme of this newly adjusted day.",
  "estimated_day_cost_usd": number,
  "weather_dependency": "high | medium | low",
  "activities": [
    {
      "id": "day${dayId}_activity_1" (adjust number for each activity sequentially),
      "name": "string",
      "description": "string (practical, engaging 2-3 sentences)",
      "category": "food | sightseeing | activity | transit | accommodation | free_time",
      "start_time": "HH:MM",
      "duration_minutes": number,
      "estimated_cost_usd": number,
      "neighborhood": "string",
      "venue_name": "string",
      "transit_notes": "string",
      "verify_hours": boolean
    }
  ]
}

Important: Keep activities realistic and concrete. Return ONLY this valid JSON object, with no explanation and no markdown backticks.`;

      const response = await genAI.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: regenerateDaySchema,
        }
      });

      let text = response.text.trim();
      if (text.includes("{")) {
        const start = text.indexOf("{");
        const end = text.lastIndexOf("}");
        if (start !== -1 && end !== -1) {
          text = text.substring(start, end + 1);
        }
      }

      const regeneratedDay = JSON.parse(text);
      res.json({ success: true, new_day: regeneratedDay });
    } catch (error: any) {
      console.error("Day regeneration error:", error);
      res.status(500).json({ success: false, error_message: error.message });
    }
  });

  app.post("/api/places/verify", async (req, res) => {
    const apiKey = process.env.GOOGLE_MAPS_PLATFORM_KEY || process.env.GOOGLE_PLACES_KEY;
    if (!apiKey) {
      console.warn("Google Google Maps/Places API key is missing. Verification will fall back to unverified.");
      return res.json({ verified: false, error: "No API Key configured on the server." });
    }

    const { venue_name, neighborhood, destination, activity } = req.body;
    if (!venue_name) {
      return res.status(400).json({ error: "venue_name is required directly in request body." });
    }

    const cleanQuery = `${venue_name} ${neighborhood || ""} ${destination || ""}`.trim();
    console.log(`[Google Places] Verifying venue query: "${cleanQuery}"`);

    try {
      // 1. Text Search to get place ID and check status
      const textSearchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(cleanQuery)}&key=${apiKey}&language=en`;
      const textSearchRes = await fetch(textSearchUrl);
      if (!textSearchRes.ok) {
        throw new Error(`TextSearch API failed: Status ${textSearchRes.status}`);
      }

      const textSearchData = (await textSearchRes.json()) as any;
      
      let exists = false;
      let isPermanentlyClosed = false;
      let isTemporarilyClosed = false;

      if (textSearchData.results && textSearchData.results.length > 0) {
        const topResult = textSearchData.results[0];
        exists = true;
        
        const bStatus = topResult.business_status;
        if (bStatus === "CLOSED_PERMANENTLY") {
          isPermanentlyClosed = true;
        } else if (bStatus === "CLOSED_TEMPORARILY" || bStatus === "TEMPORARILY_CLOSED") {
          isTemporarilyClosed = true;
        }
      }

      // If NOT found OR permanently/temporarily closed -> Venue is bad!
      if (!exists || isPermanentlyClosed || isTemporarilyClosed) {
        const reason = !exists ? "not_found" : (isPermanentlyClosed ? "permanently_closed" : "temporarily_closed");
        console.log(`[Google Places] Venue "${venue_name}" is bad (${reason}). Initiating Gemini replacement...`);

        const geminiApiKey = process.env.GEMINI_API_KEY;
        if (geminiApiKey) {
          try {
            const genAI = new GoogleGenAI({ 
              apiKey: geminiApiKey,
              httpOptions: {
                headers: {
                  'User-Agent': 'aistudio-build',
                }
              }
            });

            const replacementPrompt = `Replace this closed venue: ${venue_name}

Generate a NEW activity:
- Same category (Food & Drink, Sightseeing, etc.): "${activity?.category || "sightseeing"}"
- Same location (neighborhood: "${neighborhood || "anywhere"}"): "${neighborhood || "Local District"}"
- Similar cost ($${activity?.cost_usd || activity?.estimated_cost_usd || 20})
- Similar duration (${activity?.duration_minutes || 120} minutes)
- Operating now (verified open)

Return ONLY a valid JSON object matching this exact schema:
{
  "name": "Alternative Venue Name",
  "venue_name": "Alternative Venue Name",
  "description": "Engaging description: 2-3 sentences explaining what this is and why it's a great choice here.",
  "category": "${activity?.category || "sightseeing"}",
  "start_time": "${activity?.start_time || "10:00"}",
  "duration_minutes": ${Number(activity?.duration_minutes) || 120},
  "estimated_cost_usd": ${Number(activity?.estimated_cost_usd) || Number(activity?.cost_usd) || 20},
  "neighborhood": "${neighborhood || "Local District"}",
  "transit_notes": "Brief tips on how to get there or continue.",
  "verify_hours": false
}`;

            const geminiRes = await genAI.models.generateContent({
              model: "gemini-3.5-flash",
              contents: replacementPrompt,
              config: {
                responseMimeType: "application/json"
              }
            });

            let text = geminiRes.text.trim();
            if (text.includes("{")) {
              const start = text.indexOf("{");
              const end = text.lastIndexOf("}");
              if (start !== -1 && end !== -1) {
                text = text.substring(start, end + 1);
              }
            }

            const newId = `replaced_${Date.now()}`;
            const newActivity = JSON.parse(text);
            newActivity.id = newId;
            newActivity.activity_id = newId;
            newActivity.google_places_verification = {
              verified: true,
              reason: "found",
              verified_at: new Date().toISOString()
            };

            console.log(`[Google Places] Generated replacement for "${venue_name}" -> "${newActivity.venue_name}"`);

            return res.json({
              verified: false,
              reason,
              was_replaced: true,
              new_activity: newActivity,
              google_places_verification: {
                verified: false,
                reason,
                replaced_with: newId,
                original_venue: venue_name
              }
            });

          } catch (geminiErr) {
            console.error("Gemini replacement generation failed:", geminiErr);
          }
        }

        // Fallback Option B: if Gemini API is not accessible/fails, return was_removed: true
        return res.json({
          verified: false,
          reason,
          was_removed: true,
          google_places_verification: {
            verified: false,
            reason,
            verified_at: new Date().toISOString()
          }
        });
      }

      // If found and NOT CLOSED_PERMANENTLY: Venue is good! ✓
      const google_places_verification = {
        verified: true,
        reason: "found",
        verified_at: new Date().toISOString()
      };

      console.log(`[Google Places] Verified: "${venue_name}" exists and is open.`);
      return res.json({
        verified: true,
        reason: "found",
        data: google_places_verification
      });

    } catch (error: any) {
      console.error("[Google Places] Error during verification flow:", error);
      return res.json({
        verified: false,
        reason: "not_found",
        error: error.message || "Internal verification error",
        google_places_verification: {
          verified: false,
          reason: "not_found",
          verified_at: new Date().toISOString()
        }
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
