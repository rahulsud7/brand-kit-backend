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
   HEALTH CHECK
========================= */

app.get("/", (_req, res) => {
  res.send("AI Brand Kit Backend Running 🚀");
});

/* =========================
   HELPERS
========================= */

function normalize(value) {
  if (!value) return "";
  if (Array.isArray(value)) return value.join(", ");
  return value;
}

/* =========================
   STYLE GUIDE
========================= */

function getStyleGuide(style) {
  const map = {
    Minimal:
      "clean geometric shapes, flat minimal design, strong negative space",

    Luxury:
      "thin elegant lines, balanced symmetry, premium minimalist style",

    Playful:
      "rounded shapes, friendly geometry, bright accent colors",

    Futuristic:
      "tech inspired shapes, nodes, circuits, sharp modern angles",

    Modern:
      "balanced geometric icon with clean startup branding"
  };

  return map[style] || "modern geometric startup logo";
}

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

    const personalityText = normalize(personality);
    const valuesText = normalize(values);
    const styleGuide = getStyleGuide(stylePreference);

    /* =========================
       SAVE PROJECT
    ========================= */

    const { data: project, error: projectError } = await supabase
      .from("brand_projects")
      .insert([
        {
          user_id: userId,
          brand_name: brandName,
          industry,
          audience,
          personality: personalityText
        }
      ])
      .select()
      .single();

    if (projectError) {
      console.error("Project creation failed:", projectError);
      return res.status(500).json({
        error: "Failed to create project"
      });
    }

    /* =========================
       SYSTEM PROMPT
    ========================= */

    const systemPrompt = `
You are a senior brand strategist and startup logo designer.

Create a modern SaaS-style brand identity.

Return ONLY valid JSON.

Do not include explanations.

LOGO DESIGN RULES:

• Logo must include ICON + WORDMARK
• Icon must appear LEFT of the text
• Use minimal geometric shapes
• Icon must visually represent the industry
• Avoid decorative clutter
• Use 1–2 colors maximum

ICON DESIGN EXAMPLES:

Technology → nodes, circuits, sparks
Coffee → beans, steam, cup
Finance → shield, upward arrow
Fitness → pulse, motion lines
Travel → compass, location pin

LAYOUT STRUCTURE:

[ICON]  BrandName

SPACING:

Icon center ≈ x:40 y:50

Text:

x="80"
y="58"

SVG RULES:

• width="260"
• height="100"
• viewBox="0 0 260 100"
• single line SVG

Allowed tags only:

<svg> <circle> <rect> <path> <line> <text>

Font family must be:

Inter, Poppins, or sans-serif.

Design inspiration:

Stripe, Linear, Vercel, Notion.

Output only JSON.
`;

    /* =========================
       USER PROMPT
    ========================= */

    const userPrompt = `
Brand Name: ${brandName}

Industry: ${industry}

Audience: ${audience}

Brand Personality: ${personalityText}

Core Values: ${valuesText}

Competitors: ${competitors}

Design Style: ${styleGuide}

Visual Direction: ${logoDirection}

Generate a full brand kit.

Return JSON exactly like this:

{
  "taglines": ["", "", ""],

  "logo_svg":"<svg width='260' height='100' viewBox='0 0 260 100' xmlns='http://www.w3.org/2000/svg'><circle cx='40' cy='50' r='16' fill='#6366F1'/><circle cx='52' cy='42' r='6' fill='#A5B4FC'/><text x='80' y='58' font-size='28' fill='#FFFFFF' font-family='Inter, sans-serif'>BrandName</text></svg>",

  "logo_description":"",

  "colors":[
    {"role":"primary","name":"","hex":""},
    {"role":"secondary","name":"","hex":""},
    {"role":"accent","name":"","hex":""},
    {"role":"neutral","name":"","hex":""},
    {"role":"neutral","name":"","hex":""}
  ],

  "fonts":{
    "heading":"",
    "body":""
  },

  "instagram_bio":"",

  "captions":["","",""]
}
`;

    /* =========================
       OPENAI CALL
    ========================= */

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.7,
      max_tokens: 1200,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    });

    const result = JSON.parse(
      completion.choices[0].message.content
    );

    /* =========================
       SAVE BRAND KIT
    ========================= */

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
    }

    res.json(result);

  } catch (err) {

    console.error("SERVER ERROR:", err);

    res.status(500).json({
      error: "Brand kit generation failed"
    });
  }
});

/* =========================
   GET USER BRAND KITS
========================= */

app.get("/my-kits/:userId", async (req, res) => {
  try {

    const { userId } = req.params;

    const { data, error } = await supabase
      .from("brand_projects")
      .select(`
        *,
        brand_kits(*)
      `)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      return res.status(500).json({
        error: "Failed to fetch kits"
      });
    }

    res.json(data);

  } catch (err) {

    console.error(err);

    res.status(500).json({
      error: "Server error"
    });
  }
});

/* =========================
   START SERVER
========================= */

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});