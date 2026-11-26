import express from "express";
import multer from "multer";
import OpenAI, { toFile } from "openai";
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
    cb(allowed.includes(file.mimetype) ? null : new Error("PNG, JPG හෝ WEBP image පමණක් upload කරන්න."), allowed.includes(file.mimetype));
  }
});

app.use(express.static(path.join(__dirname, "public")));
app.get("/api/health", (_req, res) => res.json({ ok: true, app: "TANU FASHION DESIGN STUDIO" }));

app.post("/api/generate", upload.single("image"), async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: "Server එකේ OPENAI_API_KEY සකස් කරලා නැහැ." });
    if (!req.file) return res.status(400).json({ error: "Design photo එක upload කරන්න." });

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const category = req.body.category || "Male";
    const colour = req.body.colour || "Black";
    const modelChoice = req.body.model || "Boy";
    const background = req.body.background || "Auto AI";
    const view = req.body.view || "Front + Back + Model Photos";
    const mime = req.file.mimetype;

    const artworkPrompt = `Carefully isolate and recreate ONLY the printed graphic/artwork visible in the supplied reference image as a clean, print-ready graphic. Preserve the original artwork's composition, wording, spelling, typography, colors, symbols and relative layout as faithfully as possible. Do not invent extra words, logos or decorative elements. Remove the T-shirt, person, room and all mockup/background elements. Center the artwork on a transparent background if supported; otherwise use a clean plain white background. Crisp edges, high resolution, suitable for DTF/screen printing. If exact lettering cannot be read, do not guess or add replacement text.`;

    const artworkResponse = await client.images.edit({
      model: "gpt-image-2.6-sunburst",
      image: await toFile(req.file.buffer, "reference." + (mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : "png"), { type: mime }),
      prompt: artworkPrompt,
      background: "transparent",
      size: "1024x1024",
      quality: "high",
      output_format: "png"
    });
    const artwork = artworkResponse.data?.[0]?.b64_json;
    if (!artwork) throw new Error("Artwork image එකක් ලැබුණේ නැහැ.");

    const bg = background === "Auto AI" ? "a tasteful professional lifestyle background chosen to suit the design" :
      background === "Studio" ? "a clean premium photography studio background" :
      background === "Nature" ? "a beautiful natural outdoor background" :
      background === "Modern City" ? "a stylish modern city street background" : "a simple plain neutral background";

    const viewInstruction = view === "Front View" ? "Show a single clear front view." :
      view === "Front + Back" ? "Show the T-shirt front and back views side by side on a clean product display; no model is needed." :
      "Show a realistic fashion model wearing the T-shirt, with a clear front view; include a tasteful back-view product inset only if it can be shown clearly.";

    const modelPrompt = `Create a premium photorealistic T-shirt product fashion photograph for the brand TANU FASHION. Use the supplied second image as the exact print artwork reference. Put this artwork on the FRONT of a plain ${colour.toLowerCase()} regular-fit crew-neck T-shirt. The print must be centered on the chest, appropriately sized, and visually match the supplied artwork; do not redesign it, add text, or invent logos. Category: ${category}. Model selection: ${modelChoice}. Use an appropriate adult model for Male/Female/Couple categories; for Kids use an age-appropriate child model and a wholesome non-sexual children's fashion catalogue style. Background: ${bg}. ${viewInstruction} Natural fabric folds, realistic cotton texture, accurate garment fit, professional commercial fashion photography, sharp details, natural proportions.`;

    const modelResponse = await client.images.edit({
      model: "gpt-image-2.6-sunburst",
      image: await toFile(Buffer.from(artwork, "base64"), "extracted-artwork.png", { type: "image/png" }),
      prompt: modelPrompt,
      size: "1024x1024",
      quality: "high",
      output_format: "png"
    });
    const model = modelResponse.data?.[0]?.b64_json;
    if (!model) throw new Error("Model photo එකක් ලැබුණේ නැහැ.");

    res.json({ artwork, model });
  } catch (err) {
    console.error("Generate error:", err);
    const msg = err?.status === 401 ? "API Key එක වැරදියි හෝ අවලංගුයි." :
      err?.status === 429 ? "API quota/billing සීමාව හෝ rate limit එකක්. Billing සහ usage පරීක්ෂා කරන්න." :
      (err.message || "Server error");
    res.status(500).json({ error: msg });
  }
});

app.use((err, _req, res, _next) => {
  res.status(400).json({ error: err.message || "Upload error" });
});
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`TANU FASHION app running on port ${port}`));
