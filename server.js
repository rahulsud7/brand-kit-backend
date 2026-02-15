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
   OpenAI (UPGRADED MODEL)
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

    /* =========================
       AI PROMPT (PRO LEVEL)
    ========================= */

    const systemPrompt = `
You are a senior brand strategist, identity designer, and logo system architect.

You think conceptually, not decoratively.

You create:
• Meaningful visual identities
• Distinct symbolic SVG logos
• Cohesive color systems
• Strategic typography pairings

You NEVER output markdown.
You NEVER explain outside JSON.
You output ONLY valid JSON.

LOGO RULES:
- Logo MUST include a visual symbol + brand name
- Symbol must reflect brand concept, not random geometry
- Use only: <svg>, <text>, <rect>, <circle>, <line>, <path>
- Single-line SVG
- No gradients, no images
- Balanced composition
- Proper spacing
- Scalable vector
- Designed for dark background
- Modern and minimal

COLOR RULES:
- Choose psychologically aligned palette
- 1 primary
- 1 secondary
- 1 accent
- 2 neutrals
- Provide real hex values

TYPOGRAPHY RULES:
- Select real Google Fonts
- One display/headline font
- One readable body font
- Avoid overused combinations

All output must be cohesive and strategically aligned.
`;

    const userPrompt = `
Brand Name: ${brandName}
Brand Type: ${brandType || "Not specified"}
Industry: ${industry || "Not specified"}
Target Audience: ${audience || "Not specified"}
Brand Personality: ${personality || "Not specified"}
Keywords: ${keywords || "None"}
Competitors: ${competitors || "None"}

Generate a complete brand kit in EXACT JSON format:

{
  "taglines": ["", "", ""],

  "logo_svg": "<svg width='260' height='100' viewBox='0 0 260 100' xmlns='http://www.w3.org/2000/svg'>...</svg>",

  "logo_description": "",

  "colors": [
    {"role": "primary", "name": "", "hex": ""},
    {"role": "secondary", "name": "", "hex": ""},
    {"role": "accent", "name": "", "hex": ""},
    {"role": "neutral", "name": "", "hex": ""},
    {"role": "neutral", "name": "", "hex": ""}
  ],

  "fonts": {
    "heading": "",
    "body": ""
  },

  "instagram_bio": "",

  "captions": ["", "", ""]
}

IMPORTANT:
- logo_svg must be single line
- Use single quotes inside SVG attributes
- Include meaningful symbol (not just brand text)
- Symbol should visually represent brand positioning
- Ensure professional balance
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

    /* ---------- Save Brand Kit ---------- */
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
