const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");

const API_KEY = process.env.LK888_API_KEY;
if (!API_KEY) { console.error("Set LK888_API_KEY before running."); process.exit(1); }

const CONFIG = {
  apiBase: "https://api.lk888.ai",
  uploadEndpoint: "https://api.lk888.ai/api/v1/media/upload",
  gptModel: "gpt-5.5",
  imageModel: "gpt-image-2",
  videoModel: "grok-video-3.5",
  imageSize: "2160x3840",
  imageQuality: "auto",
  aspectRatio: "9:16",
  duration: "6",
  resolution: "720p",
  pollInterval: 10000,
  pollTimeout: 600000,
};


const MODEL_WARDROBE_RULE =
  "WARDROBE RULES (MUST FOLLOW EXACTLY): summer-only, sexy-casual, figure-flattering. SAME story = SAME outfit across all 3 prompts. DIFFERENT story = COMPLETELY DIFFERENT outfit. NEVER let 3 consecutive stories use the same dominant color family (e.g., cannot have 3 stories in a row all white-ish, all blue-ish, all brown-ish, etc.). After 2 stories in one color family, the 3rd story MUST switch to a different color family. All scenes are warm-weather. Outfit must be consistent across the 3 prompts WITHIN the same story, but each story gets a COMPLETELY DIFFERENT look -- different top style, bottom style, color, fabric, and silhouette.\n\nTop options (vary every story): fitted V-neck tee, off-shoulder ribbed knit, cropped camisole, square-neck tank, halter top, scoop-neck bodysuit, sleeveless button-front blouse, one-shoulder fitted top, knit polo crop, lace-trim cami.\n\nBottom ratio: across all stories, aim for roughly 50% shorts and 50% long pants. Do NOT default to long pants every time.\nBottom options (shorts): high-waist tailored shorts, paperbag-waist shorts, denim cutoff shorts.\nBottom options (long): slim-fit cropped jeans, straight-leg linen trousers, wide-leg cropped pants.\nBottom options (rare, max 1 in 5 stories): fitted mini skirt, knitted bodycon midi skirt.\n\nColor palette -- rotate aggressively, NEVER repeat the same color combo two stories in a row. Balance colors evenly across stories, do NOT overuse any single color family. Mix from: black, ivory, warm white, charcoal, navy, terracotta, camel, soft sky blue, chocolate brown, warm beige, olive, butter yellow, rust, burnt orange, mint green, deep teal, burgundy, ginger yellow, blush. CRITICAL COLOR RULE: No single color family (pinks, blues, greens, browns, etc.) may appear in more than 2 consecutive stories. After 2 stories using warm tones, switch to cool tones, and vice versa. Pink-family colors (blush, dusty pink, rose, coral) must be spread at least 3 stories apart. Never let 3 stories in a row use the same hue family. Actively track and rotate through all color groups: neutrals (black, ivory, white, charcoal, beige), warm earth (terracotta, camel, rust, burnt orange, ginger yellow, chocolate brown), cool (navy, sky blue, deep teal, mint green, olive), and accent (burgundy, butter yellow, blush). Each story must draw from a different color group than the previous 2 stories. CRITICAL WHITE/IVORY/BEIGE RULE: Light neutrals (ivory, warm white, white, beige, cream) must NOT appear in more than 1 of every 3 stories. Do NOT default to white or ivory tops — they are boring when overused. White-family colors should be used sparingly as accents, not as the main top color for most stories. If the previous story used a white-family top, the next story MUST use a colored or dark top.\n\nOffice/boutique scenes: polished but still summer -- fitted knit top or sleeveless blouse with tailored trousers or wide-leg pants, feminine but not overtly sexy.\n\nCRITICAL: NEVER repeat an outfit. Black tops (fitted black tee, black tank, black bodysuit, black camisole, black knit top) MUST appear in at least 2 out of every 9 stories -- black is a staple that should not be missing. Dark neutrals (black, charcoal, navy, chocolate brown) should collectively appear in at least 4 out of every 9 stories, balanced with light neutrals and colors. Shorts and long pants must alternate roughly every other story. If the last story used shorts, consider long pants this time, and vice versa. The model is a young woman with a D-cup chest; clothing should fit naturally to her body type without distortion. Tasteful, fashion-ad appropriate. No overdressing.\n\nScene color grading / filter rule: Overall image color temperature must NOT be dominantly warm. Avoid golden-hour-orange, sepia, heavy amber, or overly yellow-warm filters across all scenes. Prefer clean, bright, neutral-to-slightly-cool daylight color balance. White balance should lean natural daylight (5500K-6500K), not sunset (2500K-3500K). Interiors use bright white or slightly cool lighting, not candlelight-warm. The bag must remain color-accurate under neutral light -- warm filters distort product color. At most 1 in 5 stories may have warm-toned lighting, and only when appropriate to the story setting (e.g. evening date).";

function log(...args) {
  const ts = new Date().toLocaleTimeString("zh-CN", { hour12: false });
  console.log("[" + ts + "]", ...args);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function randomPick(arr, n) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, Math.min(n, a.length));
}

async function apiFetch(method, urlPath, body) {
  if (body === undefined) body = null;
  const url = CONFIG.apiBase + urlPath;
  const headers = { Authorization: "Bearer " + API_KEY };
  const opts = { method: method, headers: headers };
  if (body) {
    headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  if (!res.ok) {
    const text = await res.text().catch(function() { return ""; });
    throw new Error("HTTP " + res.status + " from " + urlPath + ": " + text.slice(0, 200));
  }
  return res.json();
}

async function uploadImage(filePath) {
  const absPath = path.resolve(filePath);
  const fileBuffer = fs.readFileSync(absPath);
  const boundary = "----FormBoundary" + randomUUID().replace(/-/g, "");
  const fileName = path.basename(absPath);
  const ext = path.extname(fileName).toLowerCase();
  const mimeMap = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
  const mimeType = mimeMap[ext] || "application/octet-stream";

  const bodyStart = Buffer.from("--" + boundary + "\r\nContent-Disposition: form-data; name=\"file\"; filename=\"" + fileName + "\"\r\nContent-Type: " + mimeType + "\r\n\r\n");
  const bodyEnd = Buffer.from("\r\n--" + boundary + "--\r\n");
  const body = Buffer.concat([bodyStart, fileBuffer, bodyEnd]);

  const res = await fetch(CONFIG.uploadEndpoint, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + API_KEY,
      "Content-Type": "multipart/form-data; boundary=" + boundary,
    },
    body: body,
  });
  if (!res.ok) throw new Error("Upload failed: HTTP " + res.status);
  const data = await res.json();
  const url = data.url || data.downloadLink || data.link;
  if (!url) throw new Error("No URL in upload response: " + JSON.stringify(data));
  log("  Uploaded " + fileName + " -> " + url);
  return url;
}

async function submitVideoTask(imageUrl, prompt, shotIndex, productCode) {
  const body = {
    model: CONFIG.videoModel,
    prompt: prompt,
    count: 1,
    params: {
      prompt: prompt,
      aspectRatio: CONFIG.aspectRatio,
      duration: CONFIG.duration,
      resolution: CONFIG.resolution,
      images: [imageUrl],
    },
  };
  const result = await apiFetch("POST", "/api/v1/media/generate", body);
  const taskId = result.data?.task_id;
  if (!taskId) throw new Error("No task_id in response: " + JSON.stringify(result));
  log("  Product " + productCode + " Shot " + shotIndex + ": video task submitted (task_id=" + taskId + ")");
  return taskId;
}

async function pollTask(taskId) {
  const deadline = Date.now() + CONFIG.pollTimeout;
  while (Date.now() < deadline) {
    const status = await apiFetch("GET", "/api/v1/skills/task-status?task_id=" + taskId);
    if (status.is_final || status.state === "success" || status.state === "failed") return status;
    await sleep(CONFIG.pollInterval);
  }
  throw new Error("Task " + taskId + " timed out");
}

async function downloadResult(url, outputPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Download failed: HTTP " + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, buf);
  log("  Downloaded -> " + outputPath);
}
const STORY_ARCS = [
    {
    id: "limited_sale_unboxing",
    title: "Limited sale unboxing",
    concept: "A premium home unboxing story that reveals the sale price before the model styles the bag.",
    continuity: "clean apartment interior, soft daylight, premium but natural home styling",
    allowPriceTagText: true,
    shots: [
      "Opening: hands open a clean box on a table and reveal the woven handbag inside tissue paper.",
      "Product beat: the model lifts the bag close to camera, with a large physical hangtag prominently visible close to camera, showing $100 crossed out with a bold red line and $43.99 in crisp sharp text.",
      "Closing: she checks the bag with her outfit in a mirror and walks toward the door ready to go out."
    ]
  },
  {
    id: "friend_price_reveal",
    title: "Friend price reveal",
    concept: "A social proof moment where a friend notices the bag and the sale tag makes the deal feel surprising.",
    continuity: "bright weekend shopping street, friendly candid energy, warm daylight",
    allowPriceTagText: true,
    shots: [
      "Opening: the model walks along a weekend shopping street with the woven handbag on her arm.",
      "Product beat: a friend admires the bag while the model tilts it slightly so the large physical hangtag is prominently visible close to camera, showing $100 crossed out with a bold red line and $43.99 in crisp sharp text.",
      "Closing: the model smiles and continues walking with the bag as the friend reacts with impressed surprise."
    ]
  },
  {
    id: "factory_craft",
    title: "Factory craft",
    concept: "Inside the handbag workshop, the model watches artisans weave, then picks a finished bag with a sale tag reveal.",
    continuity: "warm factory interior, natural materials and tools, authentic craft atmosphere",
    allowPriceTagText: true,
    shots: [
      "Opening: the model walks through a bright handbag workshop, artisans weaving at wooden looms around her.",
      "Product beat: she lifts a finished woven handbag from the inspection table; a large physical hangtag is prominently visible close to camera, showing original price $100 crossed out with a bold red line and sale price $43.99 in crisp sharp text.",
      "Closing: she carries the bag out of the workshop, sunlight hitting the bag through the factory door."
    ]
  },
  {
    id: "warehouse_sale",
    title: "Warehouse sale",
    concept: "A warehouse clearance moment where the model discovers the bag among stacked shelves, price tag front and center.",
    continuity: "industrial warehouse with warm lighting, organized shelves, exclusive sale atmosphere",
    allowPriceTagText: true,
    shots: [
      "Opening: the model enters a warehouse filled with stacked shelves of handbags, browsing with curiosity.",
      "Product beat: she picks up the woven handbag from a shelf display and a large physical hangtag is prominently visible close to camera, showing original price $100 crossed out with a bold red line and sale price $43.99 in crisp sharp text.",
      "Closing: she walks out of the warehouse carrying the bag, warehouse sign reading Clearance Sale softly blurred behind her."
    ]
  },
  {
    id: "popup_store",
    title: "Pop-up store",
    concept: "A trendy pop-up shop opening where the model is the first customer to grab the deal.",
    continuity: "modern pop-up store with clean white displays, warm accent lighting, excited crowd energy",
    allowPriceTagText: true,
    shots: [
      "Opening: the model walks into a sleek pop-up handbag store with modern white displays and warm accent lights.",
      "Product beat: she picks up the woven handbag from a display pedestal and a large physical hangtag is prominently visible close to camera, showing original price $100 crossed out with a bold red line and sale price $43.99 in crisp sharp text.",
      "Closing: she pays at the counter and walks out of the pop-up with the bag on her arm, smiling."
    ]
  },
  {
    id: "design_studio",
    title: "Design studio reveal",
    concept: "In a designer studio, the model sees the bag being sketched and then holds the finished piece with its sale tag.",
    continuity: "creative design studio, mood boards and fabric swatches, modern minimalist workspace",
    allowPriceTagText: true,
    shots: [
      "Opening: the model enters a bright design studio with mood boards and fabric swatches on the walls, a designer sketching at a desk.",
      "Product beat: the designer hands her the finished woven handbag and a large physical hangtag is prominently visible close to camera, showing original price $100 crossed out with a bold red line and sale price $43.99 in crisp sharp text.",
      "Closing: she holds the bag up beside the original sketch on the wall, then walks out of the studio with it on her shoulder."
    ]
  },
  {
    id: "livestream_sale",
    title: "Livestream sale",
    concept: "A livestream shopping moment where the model hosts a quick sale segment with the bag as hero product.",
    continuity: "bright ring light setup, phone on tripod, product-table background",
    allowPriceTagText: true,
    shots: [
      "Opening: the model sits behind a product table with a ring light and phone on a tripod, greeting her livestream audience.",
      "Product beat: she holds the woven handbag up to the camera and a large physical hangtag is prominently visible close to camera, showing original price $100 crossed out with a bold red line and sale price $43.99 in crisp sharp text.",
      "Closing: she waves goodbye to the audience and holds the bag beside her face with a warm smile."
    ]
  },
  {
    id: "sample_room",
    title: "Sample room pick",
    concept: "In a brand sample room, the model picks her favorite woven bag and shows the sample tag with the deal price.",
    continuity: "clean white sample room with organized bag displays, soft showroom lighting",
    allowPriceTagText: true,
    shots: [
      "Opening: the model walks through a sample room with rows of handbags on white shelves, browsing each style.",
      "Product beat: she picks up the woven handbag from a shelf and a large physical hangtag is prominently visible close to camera, showing original price $100 crossed out with a bold red line and sale price $43.99 in crisp sharp text.",
      "Closing: she nods with approval and carries the bag toward the exit, showroom door closing behind her."
    ]
  },
  {
    id: "packing_station",
    title: "Packing station",
    concept: "A behind-the-scenes moment at the packing station where the model sees her order being prepared with the sale tag visible.",
    continuity: "clean packing station with kraft boxes and tissue, warm workshop lighting",
    allowPriceTagText: true,
    shots: [
      "Opening: the model watches at a packing station as a worker carefully wraps the woven handbag in tissue paper.",
      "Product beat: before packing, the worker lifts the bag and a large physical hangtag is prominently visible close to camera, showing original price $100 crossed out with a bold red line and sale price $43.99 in crisp sharp text.",
      "Closing: the model receives the sealed box with both hands, holding it against her chest with a happy smile."
    ]
  },
  {
    id: "trade_show",
    title: "Trade show discovery",
    concept: "At a fashion trade show, the model discovers the woven bag at a booth and the wholesale-to-retail deal is revealed.",
    continuity: "bright trade show hall with modern booths, professional fashion buyer energy",
    allowPriceTagText: true,
    shots: [
      "Opening: the model walks through a fashion trade show, passing sleek brand booths and display racks.",
      "Product beat: she stops at a booth and picks up the woven handbag; a large physical hangtag is prominently visible close to camera, showing original price $100 crossed out with a bold red line and sale price $43.99 in crisp sharp text.",
      "Closing: she exchanges a business card with the exhibitor and walks away with the bag, trade show buzz continuing behind her."
    ]
  },
  {
    id: "cafe_to_street",
    title: "Cafe to street",
    concept: "A relaxed lifestyle moment where the bag transitions naturally from a sidewalk cafe to a shopping stroll.",
    continuity: "bright sidewalk cafe exterior, warm afternoon light, effortless urban style",
    allowPriceTagText: false,
    shots: [
      "Opening: the model sits at an outdoor cafe table with coffee, the woven handbag resting on the empty chair beside her.",
      "Product beat: she picks up the bag, stands, and adjusts it on her shoulder as she steps onto the sunny street.",
      "Closing: she walks down the tree-lined street and a passerby glances back at the bag with a smile."
    ]
  },
  {
    id: "travel_ready",
    title: "Travel ready",
    concept: "A travel moment showing the bag as the perfect carry-on companion, from airport lounge to boarding.",
    continuity: "bright airport terminal, clean travel aesthetic, relaxed jet-set mood",
    allowPriceTagText: false,
    shots: [
      "Opening: the model sits in an airport lounge, the woven handbag on the armrest beside her as she checks her phone.",
      "Product beat: she stands and adjusts the bag on her shoulder, walking toward the boarding gate with rolling luggage.",
      "Closing: she glances back with a confident smile before stepping through the gate, the bag visible on her arm."
    ]
  },
  {
    id: "date_night_ready",
    title: "Date night ready",
    concept: "An evening-out moment where the bag elevates the outfit from daytime casual to date-night polished.",
    continuity: "warm evening light transitioning from apartment to restaurant exterior, romantic but modern",
    allowPriceTagText: false,
    shots: [
      "Opening: the model checks her reflection in a mirror, the woven handbag on her arm completing an evening outfit.",
      "Product beat: she steps out of her apartment building into warm evening light, bag swinging naturally at her side.",
      "Closing: she arrives at a restaurant entrance and a waiting date smiles warmly as the bag catches the ambient light."
    ]
  },
  {
    id: "summer_boardwalk",
    title: "Summer boardwalk",
    concept: "A bright summer boardwalk moment where the bag pairs perfectly with weekend casual vibes.",
    continuity: "sunny boardwalk with ocean backdrop, relaxed summer energy, warm golden light",
    allowPriceTagText: false,
    shots: [
      "Opening: the model walks along a sunny boardwalk, ocean waves sparkling behind her, the woven handbag on her arm.",
      "Product beat: she pauses at a railing to look out at the water, the bag resting against the railing in frame.",
      "Closing: she continues walking toward a pier, the bag catching the golden afternoon sunlight."
    ]
  },
  {
    id: "unboxing_to_outfit",
    title: "Unboxing to outfit",
    concept: "A satisfying unboxing moment that leads straight into styling the bag with a complete outfit.",
    continuity: "clean apartment interior, bright natural light, seamless transition from packaging to mirror",
    allowPriceTagText: false,
    shots: [
      "Opening: the model opens a clean shipping box on a table, lifting the woven handbag from tissue paper.",
      "Product beat: she carries the bag to a full-length mirror and styles it with her outfit, turning to check the look.",
      "Closing: she grabs her keys and walks out the door, the bag on her arm, ready to start the day."
    ]
  },
  {
    id: "fitting_room_mirror",
    title: "Fitting room selfie",
    concept: "A fitting-room try-on moment where the bag is the finishing touch that makes the outfit work.",
    continuity: "bright boutique fitting room with large mirror, warm changing-room lighting",
    allowPriceTagText: false,
    shots: [
      "Opening: the model stands in a boutique fitting room wearing a new outfit, the woven handbag on the hook beside the mirror.",
      "Product beat: she picks up the bag and places it on her arm, turning to admire the complete look in the mirror.",
      "Closing: she snaps a mirror selfie with the bag and smiles, ready to make the purchase."
    ]
  },
  {
    id: "bookstore_browse",
    title: "Bookstore browse",
    concept: "A cozy bookstore moment where the bag adds effortless style to a cultured weekend activity.",
    continuity: "warm bookstore interior with wood shelves, soft window light, quiet intellectual mood",
    allowPriceTagText: false,
    shots: [
      "Opening: the model browses a bookshelf with the bag hanging on her arm.",
      "Product beat: she sits by a window with coffee, bag placed on the table beside an open book.",
      "Closing: she leaves the bookstore and a passerby glances back at the bag."
    ]
  },
  {
    id: "girls_brunch",
    title: "Girls brunch",
    concept: "A weekend brunch with friends where the bag becomes the conversation piece at the table.",
    continuity: "bright brunch cafe with natural light, lively social energy, fresh food aesthetic",
    allowPriceTagText: false,
    shots: [
      "Opening: the model sits at a brunch table with friends, the woven handbag on the empty chair beside her.",
      "Product beat: a friend points at the bag with an admiring look, and the model lifts it briefly to show the design.",
      "Closing: the group laughs together and the model picks up the bag as they all stand to leave."
    ]
  },
  {
    id: "whats_in_my_bag",
    title: "What is in my bag",
    concept: "A satisfying what-is-in-my-bag reveal showing how much the woven bag can hold while staying chic.",
    continuity: "clean tabletop with natural daylight, organized flat-lay aesthetic",
    allowPriceTagText: false,
    shots: [
      "Opening: the model places the bag on a clean table and unzips it.",
      "Product beat: she lays out daily essentials: phone, sunglasses, lipstick, keys, and a small wallet beside the bag.",
      "Closing: she packs everything back in, lifts the bag, and walks toward the door ready for the day."
    ]
  },
  {
    id: "work_to_dinner",
    title: "Work to dinner",
    concept: "A desk-to-dinner transition showing the bag working for both office and evening settings.",
    continuity: "bright modern office transitioning to warm restaurant, same outfit, versatile mood",
    allowPriceTagText: false,
    shots: [
      "Opening: the model works at a bright modern desk, the woven handbag on the corner of the desk beside her laptop.",
      "Product beat: she finishes work, picks up the bag, and heads out of the office into early evening light.",
      "Closing: she arrives at a dinner spot with colleagues, the bag on her arm as she greets them warmly."
    ]
  },
  {
    id: "bf_buys_me_bag",
    title: "BF buys me a bag",
    concept: "A boyfriend-shopping moment where the price makes the decision easy and the interaction feels real.",
    continuity: "bright mall interior, relaxed couple energy, warm retail lighting",
    allowPriceTagText: true,
    shots: [
      "Opening: the model and her boyfriend browse a store, she eyes the woven handbag on display while he checks a shelf nervously.",
      "Product beat: she picks up the bag and shows the large physical hangtag close to camera, prominently showing original price $100 crossed out with a bold red line and sale price $43.99 in crisp sharp text, while his expression turns to relief.",
      "Closing: he hands a card at the counter and she walks out with the bag on her arm, linking her other arm through his happily."
    ]
  },
  {
    id: "sale_alert_countdown",
    title: "Sale alert countdown",
    concept: "A flash-sale countdown moment that creates urgency around the price reveal.",
    continuity: "bright livestream-style setup, phone screen aesthetic, energetic urgency",
    allowPriceTagText: true,
    shots: [
      "Opening: a phone screen shows the original price $100 flashing with a countdown timer ticking down.",
      "Product beat: the model lifts the woven handbag up and the large physical hangtag is prominently visible close to camera, showing original price $100 crossed out with a bold red line and sale price $43.99 in crisp sharp text.",
      "Closing: the model makes a heart gesture and blows a kiss, the bag held beside her face happily."
    ]
  },
  {
    id: "ootd_check",
    title: "OOTD check",
    concept: "A daily outfit-of-the-day moment where the bag is the hero accessory.",
    continuity: "full-length mirror in bright apartment, natural daylight, clean aesthetic",
    allowPriceTagText: false,
    shots: [
      "Opening: the model films her outfit in a full-length mirror, pausing to highlight the woven handbag on her arm.",
      "Product beat: she reaches into the bag and pulls out sunglasses, lipstick, and keys one by one, showing how the bag completes the look.",
      "Closing: she pushes the apartment door open and steps outside into sunlight, the bag swinging naturally for a final outfit reveal."
    ]
  },
  {
    id: "pov_you_got_the_bag",
    title: "POV: you just got the bag",
    concept: "A first-person point-of-view story that makes the viewer feel like they just unboxed and wore the bag.",
    continuity: "first-person perspective, natural home-to-street lighting, immersive feel",
    allowPriceTagText: false,
    shots: [
      "Opening: POV hands open a package and lift the woven handbag from tissue paper, the bag filling the frame.",
      "Product beat: POV walking down the street with the bag visible at the bottom of frame, a passing stranger glances back at the bag.",
      "Closing: POV mirror selfie where the bag is prominently visible in the reflection."
    ]
  },
  {
    id: "beach_to_brunch",
    title: "Beach to brunch",
    concept: "One bag transitions seamlessly from a beach setting to a brunch setting, showing all-day versatility.",
    continuity: "beach scene transitioning to cafe interior, consistent warm lighting, relaxed versatile mood",
    allowPriceTagText: false,
    shots: [
      "Opening: the woven handbag rests on a beach towel beside the model feet, ocean waves softly blurred behind.",
      "Product beat: scene transitions smoothly to a bright cafe where the same bag sits on the table next to a croissant and coffee.",
      "Closing: the model picks up the bag and stands, ready to continue the day with the bag as her all-day accessory."
    ]
  },
  {
    id: "conversation_starter",
    title: "Conversation starter",
    concept: "A series of quick street encounters where strangers react to the bag, proving it is a social magnet.",
    continuity: "bright busy street, fast candid cuts, positive social energy",
    allowPriceTagText: false,
    shots: [
      "Opening: the model walks down a busy street and a passerby visibly glances back at the woven handbag.",
      "Product beat: in a coffee-shop queue a stranger turns and gestures toward the bag with an approving look.",
      "Closing: the model smiles at the camera, points toward her phone, and walks away confidently with the bag on her arm."
    ]
  },
﻿  {
    id: "morning_routine",
    title: "Morning routine",
    concept: "A bedroom-to-doorway morning moment where the bag is part of her daily ritual, from bedside to mirror to coffee.",
    continuity: "bright bedroom with soft morning light, clean minimal aesthetic, relaxed wake-up energy",
    allowPriceTagText: false,
    shots: [
      "Opening: the model wakes up in soft morning light, the woven handbag resting on a bench at the foot of her bed.",
      "Product beat: she walks to her vanity, picks up the bag, and checks it with her reflection in the mirror, turning slightly.",
      "Closing: she grabs her coffee, slings the bag over her shoulder, and pushes the bedroom door open into the day."
    ]
  },
  {
    id: "gift_from_mom",
    title: "Gift from mom",
    concept: "A heartfelt moment where the mom gifts the bag, the hangtag confirms the deal price, and the hug is real.",
    continuity: "cozy living room with warm natural light, genuine family warmth, gift-unwrapping energy",
    allowPriceTagText: true,
    shots: [
      "Opening: the model sits on a living room sofa as her mom hands her a wrapped gift box, the model eyes lighting up.",
      "Product beat: she lifts the woven handbag from the box and the large physical hangtag is prominently visible close to camera, showing original price $100 crossed out with a bold red line and sale price $43.99 in crisp sharp text, while the mom points at the tag with a knowing smile.",
      "Closing: the model puts the bag on her shoulder and hugs her mom tight, the gift box still on the sofa behind them."
    ]
  },
  {
    id: "fitting_room_reckoning",
    title: "Fitting room reckoning",
    concept: "A fitting-room try-on marathon where the bag works with every outfit, and the price tag turns indecision into checkout.",
    continuity: "bright boutique fitting room with large mirror, soft changing-room lighting, decisive shopping energy",
    allowPriceTagText: true,
    shots: [
      "Opening: the model enters a fitting room carrying several outfits, the woven handbag already hanging on the hook beside the mirror.",
      "Product beat: she tries the bag with multiple outfits in quick succession, then on the last look she lifts the large physical hangtag prominently visible close to camera, showing original price $100 crossed out with a bold red line and sale price $43.99 in crisp sharp text, and gives a decisive nod.",
      "Closing: she carries the bag out of the fitting room and heads toward the checkout counter with confidence."
    ]
  },
];



async function gptGenerateScenePrompts(productUrl, modelUrl, story) {
  const systemPrompt = "You are a fashion advertising image director. Generate 3 detailed photorealistic image prompts that tell a connected 3-shot story for a women handbag ad. Each prompt must describe the model, the exact handbag, the setting, lighting, and camera framing. Each prompt must produce a SINGLE full-frame 9:16 photograph — NEVER a tiled layout, three-panel grid, split-screen, or collage. Do NOT add any text overlay, logo, or watermark to the image description.";

  const userContent = "Product (handbag): " + productUrl + "\nModel (person): " + modelUrl + "\nStory arc: " + story.title + "\nConcept: " + story.concept + "\nContinuity: " + story.continuity + "\nPrice tag text required: " + (story.allowPriceTagText ? "YES - include large physical hangtag with $100 crossed out and $43.99 in crisp text" : "NO - do not add any price tag") + "\n\n" + MODEL_WARDROBE_RULE + "\n\nCRITICAL BAG STRAP RULE: The handbag handle/strap must be structurally perfect - one unbroken solid piece with smooth continuous edges. The strap must NEVER appear split, cracked, torn, frayed, pixelated, or disconnected from the bag. It must attach cleanly to both sides of the bag without floating.";

  const body = {
    model: CONFIG.gptModel,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent }
    ],
    max_tokens: 2000,
  };

  log("  GPT-5.5 analyzing product + model, generating 3 scene prompts...");
  const result = await apiFetch("POST", "/v1/chat/completions", body);
  const raw = result.choices?.[0]?.message?.content || "";
  log("  GPT response (" + raw.length + " chars)");

  const prompts = [];
  const regex = /Prompt\s*(\d+)[:\s]+(.+?)(?=\n\s*Prompt\s*\d+[:\s]|$)/gis;
  let match;
  while ((match = regex.exec(raw)) !== null) {
    const p = match[2].trim();
    if (p.length > 20) prompts.push(p);
  }
  if (prompts.length < 3) {
    log("  WARNING: Could not parse 3 prompts, using story shots");
    return story.shots;
  }
  return prompts.slice(0, 3);
}

function withBagPreservationRules(prompt, story, shotIndex) {
  const isPriceTagBeat = story.allowPriceTagText && (shotIndex === 0 || shotIndex === 1);
  const textRule = isPriceTagBeat ? "SINGLE full-frame photograph. NO three-grid, NO split-screen, NO multi-panel, NO collage, NO tiled layouts. No logos and no watermark. No extra readable text except the physical sale hangtag, which may show only $100 crossed out and $43.99. The hangtag must be large, positioned prominently, with bold black text and red strikethrough, crisply legible, not blurred." : "SINGLE full-frame photograph. NO three-grid, NO split-screen, NO multi-panel, NO collage, NO tiled layouts. No logos, no text, no readable words, no watermark. No hangtags, no price tags, no sale tags.";
  return prompt + "\n\nCritical wardrobe rules: IGNORE the clothing the model wears in the reference photo. Dress her in a brand-new summer outfit as follows: " + MODEL_WARDROBE_RULE + "\n\nCritical product preservation rules: Reference image 2 is the handbag. The bag in the final image MUST be an exact pixel-level copy of reference image 2: identical color, shape, size, proportions, handle length, handle thickness, strap length, weave pattern, texture, material, hardware, and stitching. Do NOT elongate, shorten, thin, thicken, split, fray, tear, crack, or otherwise alter any part of the bag. The handle/strap must be ONE continuous solid piece. The bag must be the main subject, clearly visible and prominent in the frame. " + textRule;
}

async function submitImageTask(prompt, refImages, shotIndex, story) {
  const finalPrompt = withBagPreservationRules(prompt, story, shotIndex);
  const body = {
    model: CONFIG.imageModel,
    prompt: finalPrompt,
    size: CONFIG.imageSize,
    quality: CONFIG.imageQuality,
    images: refImages,
  };
  const result = await apiFetch("POST", "/api/v1/media/generate", body);
  const taskId = result.data?.task_id || result.data?.[0]?.task_id || result.task_id;
  if (!taskId) throw new Error("No task_id in image response: " + JSON.stringify(result));
  return taskId;
}

async function generateSceneImageUrls(productUrl, modelUrl, story) {
  const scenePrompts = await gptGenerateScenePrompts(productUrl, modelUrl, story);
  log("");
  log("--- GPT Image 2: Submitting 3 Image Tasks ---");
  const refImages = [modelUrl, productUrl];
  const taskIds = [];
  for (let i = 0; i < 3; i++) {
    const taskId = await submitImageTask(scenePrompts[i], refImages, i, story);
    taskIds.push(taskId);
    log("  Image Shot " + (i+1) + ": submitted (task_id=" + taskId + ")");
  }
  log("");
  log("--- Polling Image Generation Tasks ---");
  const imageResults = [];
  for (let i = 0; i < taskIds.length; i++) {
    log("  Waiting for image Shot " + (i+1) + " (task " + taskIds[i] + ")...");
    try {
      const status = await pollTask(taskIds[i]);
      if (status.state === "success") {
        const url = status.data?.result_url || status.result_url || status.url;
        imageResults.push(url);
        log("  OK Scene " + (i+1) + ": image URL ready");
      } else {
        throw new Error(status.error || "Image generation failed");
      }
    } catch (err) {
      log("  FAIL Scene " + (i+1) + ": " + err.message);
    }
  }
  if (imageResults.length < 3) throw new Error("Only " + imageResults.length + "/3 image URLs generated.");
  return imageResults;
}

async function gptAnalyzeVideoPrompts(sceneImageUrls, modelUrl) {
  const systemPrompt = "You are a video ad director. Given 3 ordered scene reference images and 1 model reference, generate 3 detailed image-to-video prompts (Shot 1, Shot 2, Shot 3) for a vertical TikTok/Instagram fashion ad. Each prompt must include: model action + bag action + camera movement + voiceover narration line. Voiceover: warm youthful female American voice, same narrator across all 3 shots, medium-fast TikTok ad rhythm, steady volume with slight lift on price. PRICE PRONUNCIATION: When the narration mentions $43.99, always pronounce it as 'forty-three point nine nine' — include the word 'point', never say 'forty-three ninety-nine' or 'forty-three dollars ninety-nine cents'. No BGM, no on-screen text, no logo, no watermark. Preserve model exact identity, exact outfit, and exact handbag from references. CLOTHING COLOR LOCK: The outfit colors must remain absolutely fixed throughout the entire video — no fading, no shifting, no color transitions, no gradient changes. The clothing must look identical in color and tone from the first frame to the last frame. HANGTAG LEGIBILITY: If a physical sale hangtag with $100 crossed out and $43.99 is visible in the reference image, it must remain razor-sharp, high-contrast, and fully readable in every frame. The tag text must never blur, fade, warp, pixelate, or disappear. It must stay as crisp as printed text on cardboard throughout all camera movements. BAG HAND LOCK: The handbag must remain in the SAME hand or position throughout the entire video. If the reference shows the bag in the left hand, it stays in the left hand for every frame. If in the right hand, it stays in the right hand. The bag must NEVER teleport between hands, appear in both hands simultaneously, or duplicate itself. Only ONE bag, in ONE consistent hand, from start to finish. BAG PHYSICS: The bag must obey real-world physics — it cannot float, hover, levitate, or fly through the air without being held. If the model is not actively holding or carrying the bag, it must be resting on a visible surface (table, chair, floor). The handle/strap must be one solid unbroken piece — it must never split, crack, detach, or disconnect from the bag body. The strap must maintain continuous connection to the bag at all times. CRITICAL: bag handle/strap must be one solid unbroken piece. PACING RULE: Every action and camera movement must match real human speed exactly — no slow-motion, no dreamlike drifting, no lingering. Walking must look like real walking, picking up the bag must look like a real-time arm movement, turning must match real body rotation speed. If a motion takes 2 seconds in real life, it must take 2 seconds in the video — not stretched to 4 or 6 seconds. Every movement must feel like raw phone footage of a real person, crisp and immediate. No floating, no gliding, no slow-motion effects of any kind.";
  const userContent = [
    { type: "text", text: "Model reference image:" },
    { type: "image_url", image_url: { url: modelUrl } },
    { type: "text", text: "Ordered story reference image 1:" },
    { type: "image_url", image_url: { url: sceneImageUrls[0] } },
    { type: "text", text: "Ordered story reference image 2:" },
    { type: "image_url", image_url: { url: sceneImageUrls[1] } },
    { type: "text", text: "Ordered story reference image 3:" },
    { type: "image_url", image_url: { url: sceneImageUrls[2] } },
    { type: "text", text: "Output exactly:\nShot 1: ...\nShot 2: ...\nShot 3: ..." }
  ];
  const body = {
    model: CONFIG.gptModel,
    messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userContent }],
    max_tokens: 2000,
  };
  log("  GPT-5.5 generating video prompts...");
  const result = await apiFetch("POST", "/v1/chat/completions", body);
  const raw = result.choices?.[0]?.message?.content || "";
  log("  GPT video response (" + raw.length + " chars)");
  const shots = [];
  const regex = /Shot\s*(\d+)[:\s]+(.+?)(?=\n\s*Shot\s*\d+[:\s]|$)/gis;
  let match;
  while ((match = regex.exec(raw)) !== null) {
    const p = match[2].trim();
    if (p.length > 20) shots[parseInt(match[1])-1] = p;
  }
  return shots.filter(Boolean);
}

function isImageFile(fileName) {
  const ext = require("path").extname(fileName).toLowerCase();
  return [".jpg", ".jpeg", ".png", ".webp"].includes(ext);
}

function buildModelOutputDir(srcDir) {
  const today = new Date();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const modelName = path.basename(srcDir);
  return path.join("D:\\Backup\\Downloads", mm + "." + dd, modelName);
}

function findModelImage(rootDir) {
  const entries = fs.readdirSync(rootDir);
  const modelFiles = entries.filter(function(f) { return /^m\d+\.(png|jpg|jpeg)$/i.test(f) && isImageFile(f); });
  if (modelFiles.length > 0) return modelFiles[0];
  return null;
}

function scanProductImages(rootDir) {
  return fs.readdirSync(rootDir)
    .filter(function(f) { return isImageFile(f) && !/^m\d+\./i.test(f); })
    .sort(function(a, b) {
      const na = parseInt(a), nb = parseInt(b);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.localeCompare(b);
    });
}

function productFolderName(productPath) {
  return path.basename(productPath, path.extname(productPath));
}

function productVideosComplete(outputDir, productCode) {
  for (let i = 1; i <= 3; i++) {
    const p = path.join(outputDir, "v" + productCode.padStart(2, "0") + "_shot" + i + ".mp4");
    if (!fs.existsSync(p)) return false;
  }
  return true;
}

async function runFullAutoForProduct(productPath, modelPath, outputDir, productCode, dryRun, modelUrl, newOnly) {
  log("Product: " + productPath);
  log("Model:   " + modelPath);
  log("Output: " + outputDir);
  log("");
  log("--- Uploading ---");
  const productUrl = await uploadImage(productPath);
  log("newOnly=" + newOnly + " stories=" + STORY_ARCS.length);
  const pool = newOnly ? STORY_ARCS.filter(function(s) { return /^(morning_routine|gift_from_mom|fitting_room_reckoning)$/.test(s.id); }) : STORY_ARCS;
  const story = randomPick(pool, 1)[0];
  log("Story: [" + story.id + "] " + story.title);
  story.shots.forEach(function(s, i) { log("  Beat " + (i+1) + ": " + s); });

  const sceneImageUrls = await generateSceneImageUrls(productUrl, modelUrl, story);

  log("--- GPT-5.5: Generating Video Prompts ---");
  const videoPrompts = await gptAnalyzeVideoPrompts(sceneImageUrls, modelUrl);
  if (videoPrompts.length < 3) throw new Error("Failed to generate 3 video prompts");

  if (dryRun) {
    log("--- DRY-RUN: stopping before video ---");
    return;
  }

  log("=== PHASE 2: Direct Video Generation ===");
  const videoTasks = [];
  for (let i = 0; i < 3; i++) {
    // Append CLOTHING COLOR LOCK directly to grok-video prompt to prevent frame-to-frame color shifting
    const colorLockRule = "\n\nCRITICAL CLOTHING COLOR LOCK: The model EXACT outfit colors must stay IDENTICAL in every single frame of this video. No fading, no shifting, no hue changes, no saturation changes, no brightness changes. If the top is white, it stays precisely the same white from frame 1 to the last frame. If pants are light blue, they stay exactly the same light blue. ZERO color variation between frames. The clothing must look like one continuous unedited shot with absolutely no color drift whatsoever.";
    const lockedPrompt = videoPrompts[i] + colorLockRule;
    const taskId = await submitVideoTask(sceneImageUrls[i], lockedPrompt, i+1, productCode);
    videoTasks.push(taskId);
  }

  for (let i = 0; i < videoTasks.length; i++) {
    log("Waiting for Product " + productCode + " Shot " + (i+1) + " (task " + videoTasks[i] + ")...");
    try {
      const status = await pollTask(videoTasks[i]);
      if (status.state === "success") {
        const url = status.data?.result_url || status.result_url || status.url;
        const outPath = path.join(outputDir, "v" + productCode.padStart(2, "0") + "_shot" + (i+1) + ".mp4");
        await downloadResult(url, outPath);
        log("  OK Product " + productCode + " Shot " + (i+1) + ": done");
      } else {
        log("  FAIL Product " + productCode + " Shot " + (i+1) + ": " + (status.error || "unknown"));
      }
    } catch (err) {
      log("  FAIL Product " + productCode + " Shot " + (i+1) + ": " + err.message);
    }
  }
  log("=== PRODUCT DONE ===");
}

async function main() {
  log("=== AI Full Auto: Bag Image + Video Pipeline ===");
  const args = process.argv.slice(2);
  const argMap = {};
  args.forEach(function(a) {
    const m = a.match(/^(.+?):(.+)$/);
    if (m) argMap[m[1].toLowerCase()] = m[2];
    else argMap[a.toLowerCase()] = "1";
  });
  const batchDir = argMap["dir"] || "";
  const dryRun = (argMap["dry"] || "") !== "";
  const newOnly = (argMap["newonly"] || "") !== "";

  if (batchDir) {
    const modelFile = findModelImage(batchDir);
    if (!modelFile) { log("No model image found"); process.exit(1); }
    const fullModelPath = path.join(batchDir, modelFile);
    log("Batch dir: " + batchDir);
    log("Model: " + fullModelPath);
    log("--- Uploading model image (once) ---");
    const batchModelUrl = await uploadImage(fullModelPath);
    log("Model URL cached: " + batchModelUrl);
    const products = scanProductImages(batchDir).map(function(f) { return path.join(batchDir, f); });
    log("Products: " + products.length);
    const outputDir = buildModelOutputDir(batchDir);
    log("Run root: " + outputDir);
    let success = 0, skipped = 0, failed = 0;
    for (let pi = 0; pi < products.length; pi++) {
      const product = products[pi];
      const productCode = productFolderName(product);
      const paddedCode = productCode.padStart(2, "0");
      if (productVideosComplete(outputDir, paddedCode)) {
        log("SKIP " + path.basename(product));
        skipped++;
        continue;
      }
      log("==================================================");
      log("BATCH PRODUCT " + (pi+1) + "/" + products.length + ": " + path.basename(product));
      try {
        await runFullAutoForProduct(product, fullModelPath, outputDir, paddedCode, dryRun, batchModelUrl, newOnly);
        success++;
      } catch (err) {
        log("PRODUCT FAILED: " + path.basename(product));
        log("Error: " + err.message);
        failed++;
      }
    }
    log("==================================================");
    log("BATCH SUMMARY");
    log("Total: " + products.length + " Success: " + success + " Skipped: " + skipped + " Failed: " + failed);
    return;
  }
}

main().catch(function(err) { console.error("Fatal:", err); process.exit(1); });