import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

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

    const { tripBrief } = req.body;
    if (!tripBrief) {
      return res.status(400).json({ error: "Trip brief is required." });
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
            model: "gemini-flash-latest",
            contents: tripBrief,
            config: {
              systemInstruction: `You are an experienced local travel planner who creates realistic, well-paced group itineraries. You will be given a Trip Brief with destination, dates, group size, budget per person, vibe tags, pace preference, and optional notes. You must return ONLY a valid JSON object matching the exact schema provided, with no surrounding text, no markdown code fences, and no explanation.

IMPORTANT: In this version of the system, there is no downstream venue verification, so populate all venue details yourself. For any venue where you are not confident about current operating hours, set verify_hours: true and use conservative time estimates.

Your itinerary must:
1. Respect the budget by aggregating per-day activity costs against the stated budget per person
2. Account for realistic travel time between consecutive activities (assume 20–40 minutes by local transit unless distances are clearly walkable, longer in cities known for congestion such as Jakarta, Bangkok, Manila, or Ho Chi Minh City)
3. Sequence activities geographically so the group is not crisscrossing the city
4. Front-load weather-dependent activities (beaches, hikes, outdoor markets, viewpoints) to earlier in the trip where possible
5. Reflect the vibe tags in your recommendations, weighted by their order of selection
6. Include 3 to 5 activities per day for relaxed pace, 4 to 6 for balanced, 5 to 7 for packed
7. Each activity description should be 2 to 3 sentences, written in a warm but practical tone — not marketing copy

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
If the destination is ambiguous (e.g., 'Cambridge' could be UK or US), return a single JSON object with key 'clarification_needed' and a value describing the ambiguity, instead of an itinerary.

OUTPUT SCHEMA:
Return only this JSON structure (no other text):
{
  "trip_metadata": {
    "destination_resolved": "string",
    "trip_start_date": "YYYY-MM-DD",
    "trip_end_date": "YYYY-MM-DD",
    "total_days": number,
    "total_estimated_cost_usd": number,
    "currency": "USD",
    "trip_alerts": ["string array of alerts, or empty if none"]
  },
  "days": [
    {
      "day_number": 1,
      "date": "YYYY-MM-DD",
      "day_notes": "string",
      "estimated_day_cost_usd": number,
      "weather_dependency": "high | medium | low",
      "activities": [
        {
          "id": "string (e.g., day1_activity1)",
          "name": "string",
          "description": "string (2-3 sentences)",
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
  ]
}

Important: Return ONLY valid JSON. No markdown, no backticks, no explanation.`,
              responseMimeType: "application/json",
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
        model: "gemini-flash-latest",
        contents: `Provide typical climate, weather patterns, and list of items to pack/prepare for traveling to: "${destination}" in the month of: "${monthName}". Your advice must focus on the seasons (summer, winter, monsoon, autumn, snow, etc.), what kind of typical weather condition is expected, and concrete recommendations for what to prepare.

Return ONLY a valid JSON object matching this exact schema:
{
  "month": "string (the month or period, e.g., June)",
  "season": "string (e.g., Summer, Mild Winter, Monsoon, Autumn)",
  "average_temp": "string (e.g., 24°C - 31°C / 75°F - 88°F)",
  "weather_conditions": "string (e.g., Very hot, sunny and dry with low humidity)",
  "apparel_prep": "string (e.g., Pack loose linen shirts, sunscreen, wide-brim hat, and light sandals.)",
  "gear_prep": "string (e.g., An umbrella for occasional shade or shower, and a refillable bottle.)",
  "weather_icon": "sunny | cloudy | rainy | snowy | windy | hot | cold"
}

Do not include any other markdown code blocks, backticks, or text in response. Just the JSON.`,
        config: {
          responseMimeType: "application/json",
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
