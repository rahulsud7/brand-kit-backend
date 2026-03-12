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
   HELPER
========================= */

function normalizeArray(value) {
  if (!value) return "";
  if (Array.isArray(value)) return value.join(", ");
  return value;
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

    const personalityText = normalizeArray(personality);

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
      console.error("Project Error:", projectError);
      return res.status(500).json({
        error: "Failed to create project"
      });
    }

    /* =========================
       SYSTEM PROMPT
    ========================= */

    const systemPrompt = `
You are a senior brand strategist, identity designer, and creative director.

Your task is to generate a professional brand identity system.

STRICT RULES:

Return ONLY valid JSON.

Do NOT include markdown or explanations.

LOGO DESIGN RULES:

- Create a SYMBOL + WORDMARK logo
- Use minimal geometric design
- Avoid decorative complexity
- Symbol must represent brand meaning
- SVG must be clean and scalable
- Designed primarily for dark backgrounds

SVG RESTRICTIONS:

Use ONLY these elements:
<svg> <text> <rect> <circle> <line> <path>

SVG must be ONE LINE with no line breaks.

COLORS:

Provide a balanced palette suitable for modern digital brands.

FONTS:

Suggest widely available web-safe or Google Fonts.

SOCIAL CONTENT:

Captions must sound natural and brand-aligned.
`;

    /* =========================
       USER PROMPT
    ========================= */

    const userPrompt = `
Brand Name: ${brandName}

Industry: ${industry}

Target Audience: ${audience}

Brand Personality: ${personalityText}

Core Values: ${values}

Competitors: ${competitors}

Design Style: ${stylePreference}

Logo Direction: ${logoDirection}

Create a complete brand kit.

Return JSON in this EXACT structure:

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

    /* =========================
       OPENAI REQUEST
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
      console.error("Kit Save Error:", kitError);
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
   START SERVER
========================= */

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});