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
        error: "brandName and userId required"
      });
    }

    /* ---------- Save Project ---------- */
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
       SYSTEM PROMPT
    ========================= */

    const systemPrompt = `
You are a senior brand strategist and identity designer.

Create a concept-driven brand identity.

RULES:
- Output ONLY valid JSON
- No markdown
- No explanations outside JSON
- Logo must include symbol + wordmark
- Use clean minimal geometry
- SVG must be single-line
- Designed for dark background
- Use only <svg>, <text>, <rect>, <circle>, <line>, <path>
`;

    const userPrompt = `
Brand Name: ${brandName}
Industry: ${industry}
Audience: ${audience}
Personality: ${personality}
Core Values: ${values}
Competitors: ${competitors}
Logo Style: ${stylePreference}
Visual Direction: ${logoDirection}

Return:

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
    await supabase.from("brand_kits").insert([
      {
        project_id: project.id,
        result
      }
    ]);

    res.json(result);

  } catch (err) {
    console.error("SERVER ERROR:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(process.env.PORT || 5000, () => {
  console.log("Server running");
});
