import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

/* =========================
   OpenAI (VALID MODEL)
========================= */
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/* =========================
   Supabase
========================= */
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/* =========================
   Health Check
========================= */
app.get("/", (_req, res) => {
  res.send("Backend running 🚀");
});

/* =========================
   GENERATE BRAND KIT
========================= */
app.post("/generate-brand-kit", async (req, res) => {
  try {
    const {
      brandName,
      brandType,
      industry,
      audience,
      personality,
      keywords,
      competitors,
      userId
    } = req.body;

    if (!brandName || !userId) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    /* ---------- Create Project ---------- */
    const { data: project, error: projectError } = await supabase
      .from("brand_projects")
      .insert([
        {
          user_id: userId,
          brand_name: brandName,
          industry,
          audience,
          personality
        }
      ])
      .select()
      .single();

    if (projectError) {
      console.error("Project error:", projectError);
      return res.status(500).json({ error: "Project creation failed" });
    }

    /* ---------- AI PROMPT ---------- */
const systemPrompt = `
You are a senior brand designer and logo system architect.

Your task is to generate a CLEAN, PROFESSIONAL, MINIMAL SVG LOGO
based on brand strategy inputs.

STRICT RULES:
- Output ONLY valid JSON
- NO markdown, NO explanations
- SVG must be single-line
- Use ONLY <svg>, <text>, <rect>, <circle>, <line>
- No gradients, no filters, no images
- Center the logo horizontally
- Brand name must be the main focus
- Use modern sans-serif typography
- Logo must look good on dark background
- Use brand colors consistently
- SVG must be scalable and responsive
`;

const userPrompt = `
Brand Name: ${brandName}
Industry: ${industry}
Target Audience: ${audience}
Brand Personality: ${personality}
Keywords: ${keywords || "None"}

Generate a full brand kit in the following JSON format:

{
  "taglines": ["", "", ""],

  "logo_svg": "<svg width='240' height='80' viewBox='0 0 240 80' xmlns='http://www.w3.org/2000/svg'>...</svg>",

  "logo_description": "Explain the concept of the logo in 1 sentence",

  "colors": [
    {"name": "", "hex": ""},
    {"name": "", "hex": ""},
    {"name": "", "hex": ""},
    {"name": "", "hex": ""},
    {"name": "", "hex": ""}
  ],

  "fonts": ["Primary Font", "Secondary Font"],

  "instagram_bio": "",

  "captions": ["", "", ""]
}

IMPORTANT:
- logo_svg must be ONE LINE
- Use single quotes inside SVG attributes
- Do NOT include line breaks inside SVG
- Keep logo minimal and professional
`;

const completion = await openai.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ],
  max_tokens: 900,
  temperature: 0.6
});


    /* ---------- SAFE PARSE ---------- */
    let result;
    try {
      result = JSON.parse(completion.choices[0].message.content);
    } catch (err) {
      console.error("RAW AI OUTPUT:");
      console.error(completion.choices[0].message.content);
      return res.status(500).json({ error: "AI JSON parse failed" });
    }

    /* ---------- SAVE BRAND KIT ---------- */
    const { error: kitError } = await supabase
      .from("brand_kits")
      .insert([
        {
          project_id: project.id,
          result
        }
      ]);

    if (kitError) {
      console.error("Kit save error:", kitError);
      return res.status(500).json({ error: "Saving brand kit failed" });
    }

    /* ---------- RESPONSE ---------- */
    res.json({ result });

  } catch (err) {
    console.error("SERVER ERROR:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/* =========================
   DASHBOARD FETCH
========================= */
app.get("/my-kits/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const { data, error } = await supabase
      .from("brand_projects")
      .select(`
        id,
        brand_name,
        created_at,
        brand_kits ( result )
      `)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Fetch error:", error);
      return res.status(500).json({ error: "Fetch failed" });
    }

    res.json(data);
  } catch (err) {
    console.error("Dashboard error:", err);
    res.status(500).json({ error: "Dashboard error" });
  }
});

/* =========================
   START SERVER
========================= */
app.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT}`);
});
