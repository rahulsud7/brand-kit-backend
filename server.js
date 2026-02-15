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
   OPENAI
========================= */
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/* =========================
   SUPABASE
========================= */
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/* =========================
   HEALTH
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
      industry,
      audience,
      personality,
      values,
      competitors,
      stylePreference,
      logoDirection,
      userId
    } = req.body;

    if (!brandName || !userId) {
      return res.status(400).json({
        error: "brandName and userId are required"
      });
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
      console.error(projectError);
      return res.status(500).json({ error: "Project creation failed" });
    }

    /* =========================
       SYSTEM PROMPT (PRO LEVEL)
    ========================= */

    const systemPrompt = `
You are a senior brand strategist and identity designer.

You create:
- Concept-driven logos
- Structured color systems
- Intentional typography
- Cohesive brand identity

RULES:
- Output ONLY valid JSON
- No markdown
- No explanation text outside JSON

LOGO RULES:
- Must include a symbolic icon + wordmark
- Symbol must reflect brand positioning
- Clean geometry
- Modern minimal
- Designed for dark background
- Single line SVG
- Use only <svg>, <text>, <rect>, <circle>, <line>, <path>
- No gradients or images

Think like a real brand designer, not a template generator.
`;

    const userPrompt = `
Brand Name: ${brandName}
Industry: ${industry || "Not specified"}
Audience: ${audience || "Not specified"}
Personality: ${personality || "Not specified"}
Core Values: ${values || "Not specified"}
Competitors: ${competitors || "Not specified"}
Preferred Logo Style: ${stylePreference || "Not specified"}
Visual Direction: ${logoDirection || "Not specified"}

Generate this EXACT JSON structure:

{
  "taglines": ["", "", ""],

  "logo_svg": "<svg width='260' height='100' viewBox='0 0 260 100' xmlns='http://www.w3.org/2000/svg'>...</svg>",

  "logo_description": "",

  "colors": [
    {"role":"primary","name":"","hex":""},
    {"role":"secondary","name":"","hex":""},
    {"role":"accent","name":"","hex":""},
    {"role":"neutral","name":"","hex":""},
    {"role":"neutral","name":"","hex":""}
  ],

  "fonts": {
    "heading": "",
    "body": ""
  },

  "instagram_bio": "",

  "captions": ["", "", ""]
}

IMPORTANT:
- logo_svg must be ONE LINE
- Use single quotes in SVG
- Symbol must visually represent brand concept
- Balanced layout
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.7,
      max_tokens: 1200,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    });

    let result;

    try {
      result = JSON.parse(completion.choices[0].message.content);
    } catch (err) {
      console.error("AI RAW OUTPUT:", completion.choices[0].message.content);
      return res.status(500).json({ error: "AI JSON parse failed" });
    }

    /* ---------- Save Kit ---------- */
    const { error: kitError } = await supabase
      .from("brand_kits")
      .insert([
        {
          project_id: project.id,
          result
        }
      ]);

    if (kitError) {
      console.error(kitError);
      return res.status(500).json({ error: "Saving brand kit failed" });
    }

    res.json(result);

  } catch (err) {
    console.error("SERVER ERROR:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/* =========================
   START SERVER
========================= */
app.listen(process.env.PORT || 5000, () => {
  console.log("Server running");
});
