
import express from "express";
import multer from "multer";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/png", "image/jpeg", "image/webp"];
    const valid = allowed.includes(file.mimetype);
    cb(
      valid ? null : new Error("PNG, JPG හෝ WEBP image පමණක් upload කරන්න."),
      valid
    );
  }
});

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, app: "TANU FASHION DESIGN STUDIO" });
});

// Stability AI Image-to-Image helper
async function stabilityImageEdit(imageBuffer, mime, prompt, strength) {
  const apiKey = process.env.STABILITY_API_KEY;

  const form = new FormData();
  const extension =
    mime === "image/jpeg" ? "jpg" :
    mime === "image/webp" ? "webp" : "png";

  form.append(
    "init_image",
    new Blob([imageBuffer], { type: mime }),
    `input.${extension}`
  );

  form.append("init_image_mode", "IMAGE_STRENGTH");
  form.append("image_strength", String(strength));
  form.append("text_prompts[0][text]", prompt);
  form.append("text_prompts[0][weight]", "1");
  form.append("cfg_scale", "7");
  form.append("steps", "30");
  form.append("samples", "1");

  const response = await fetch(
    "https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/image-to-image",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "image/png"
      },
      body: form
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Stability API error:", response.status, errorText);

    const error = new Error(
      response.status === 401 ? "Stability API Key එක වැරදියි." :
      response.status === 402 ? "Stability AI credits ප්‍රමාණවත් නැහැ." :
      response.status === 429 ? "API rate limit එක ඉක්මවා ඇත. ටික වේලාවකින් නැවත උත්සාහ කරන්න." :
      `Stability AI error (${response.status}): ${errorText.slice(0, 300)}`
    );

    error.status = response.status;
    throw error;
  }

  return Buffer.from(await response.arrayBuffer());
}

app.post("/api/generate", upload.single("image"), async (req, res) => {
  try {
    if (!process.env.STABILITY_API_KEY) {
      return res.status(503).json({
        error: "Render එකේ STABILITY_API_KEY සකස් කරලා නැහැ."
      });
    }

    if (!req.file) {
      return res.status(400).json({
        error: "Design photo එක upload කරන්න."
      });
    }

    const category = req.body.category || "Male";
    const colour = req.body.colour || "Black";
    const modelChoice = req.body.model || "Boy";
    const background = req.body.background || "Auto AI";
    const view = req.body.view || "Front + Back + Model Photos";

    // STEP 1: Extract/recreate the print artwork
    const artworkPrompt = `
Create ONLY the T-shirt print artwork visible in the reference image.
Remove the T-shirt, fabric, person, hanger and surrounding background.
Recreate the visible graphic as a centered, isolated print design.
Preserve the original composition, symbols, colors and layout.
Do not invent extra logos or decorative elements.
Do not guess unreadable words or spelling.
Clean sharp edges, high contrast, professional T-shirt print artwork.
Plain white background.
`;

    const artworkBuffer = await stabilityImageEdit(
      req.file.buffer,
      req.file.mimetype,
      artworkPrompt,
      0.35
    );

    // STEP 2: Create the model/product mockup
    const bg =
      background === "Auto AI"
        ? "a professional lifestyle background suitable for the design"
        : background === "Studio"
        ? "a premium photography studio"
        : background === "Nature"
        ? "a beautiful natural outdoor location"
        : background === "Modern City"
        ? "a stylish modern city street"
        : "a simple plain neutral background";

    const viewInstruction =
      view === "Front View"
        ? "Show one clear front view."
        : view === "Front + Back"
        ? "Show front and back T-shirt product views side by side, without a model."
        : "Show a realistic fashion model wearing the T-shirt, with clear front and back product views.";

    const modelPrompt = `
Create a premium photorealistic TANU FASHION T-shirt catalogue photograph.
The person must wear a regular-fit ${colour} crew-neck T-shirt.
Print the supplied reference artwork in the center of the FRONT chest.
Keep the artwork's main shapes, colors and layout as close as possible.
Do not add extra text, logos or graphics.
Category: ${category}.
Model selection: ${modelChoice}.
For Kids, use an age-appropriate child in a wholesome fashion catalogue style.
Background: ${bg}.
${viewInstruction}
Realistic cotton fabric, natural folds, correct body proportions,
professional commercial fashion photography, sharp details.
`;

    const modelBuffer = await stabilityImageEdit(
      artworkBuffer,
      "image/png",
      modelPrompt,
      0.30
    );

    res.json({
      artwork: artworkBuffer.toString("base64"),
      model: modelBuffer.toString("base64")
    });

  } catch (err) {
    console.error("Generate error:", err);

    res.status(500).json({
      error: err.message || "Image generation failed."
    });
  }
});

app.use((err, _req, res, _next) => {
  res.status(400).json({
    error: err.message || "Upload error"
  });
});

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`TANU FASHION app running on port ${port}`);
});
