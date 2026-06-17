const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");

// ============================================================
// Configuration
// ============================================================

const API_KEY = process.env.LK888_API_KEY;
if (!API_KEY) {
  console.error("Set LK888_API_KEY before running.");
  process.exit(1);
}

const CONFIG = {
  apiBase: "https://api.lk888.ai",
  uploadEndpoint: "https://api.lk888.ai/api/v1/media/upload",
  gptModel: "gpt-5.5",
  videoModel: "grok-video-3.5",
  aspectRatio: "9:16",
  duration: "6",
  resolution: "720p",
  pollInterval: 10000,
  pollTimeout: 600000,
};

// Default prompt (from the original script)
const GPT_SYSTEM_PROMPT = `You are a professional video prompt engineer. Given reference images, generate exactly 3 video prompts (Shot 1 - Shot 3) for grok-video-3.5 image-to-video generation.

Rules:
- Each shot must strictly preserve the person's facial features, face shape, eye shape, nose, lips, eyebrows, skin tone, age perception, and overall temperament from the reference images.
- Do not change the person's identity, do not beautify, do not alter facial contours, do not change hairstyle or hair color.
- Do not change the person's clothing, clothing color, or clothing details from the reference images. Preserve the exact outfit as shown.
- The bag details must follow the handbag in the reference images exactly (color, shape, size, handle, texture, material, design).
- Each shot must include: person action + bag action + camera movement.
- Dynamic walking with close-up display and detail reveal.
- Keyframes should sequence naturally (front to back).
- No audio, no text, no watermark.
- Output format strictly: each shot on its own line, starting with "Shot N:" followed by the prompt in English only.`;

// ============================================================
// Helpers
// ============================================================

function log(...args) {
  const ts = new Date().toLocaleTimeString("zh-CN", { hour12: false });
  console.log(`[${ts}]`, ...args);
}

async function apiFetch(method, urlPath, body = null) {
  const url = `${CONFIG.apiBase}${urlPath}`;
  const headers = {
    Authorization: `Bearer ${API_KEY}`,
  };
  const opts = { method, headers };
  if (body) {
    headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} from ${urlPath}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

// ============================================================
// 1. Upload image → public URL
// ============================================================

async function uploadImage(filePath) {
  const absPath = path.resolve(filePath);
  const fileBuffer = fs.readFileSync(absPath);
  const boundary = `----FormBoundary${randomUUID().replace(/-/g, "")}`;
  const fileName = path.basename(absPath);
  const ext = path.extname(fileName).toLowerCase();
  const mimeMap = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
  const mimeType = mimeMap[ext] || "application/octet-stream";

  const bodyStart = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: ${mimeType}\r\n\r\n`);
  const bodyEnd = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([bodyStart, fileBuffer, bodyEnd]);

  const res = await fetch(CONFIG.uploadEndpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });
  if (!res.ok) throw new Error(`Upload failed: HTTP ${res.status}`);
  const data = await res.json();
  const url = data.url || data.downloadLink || data.link;
  if (!url) throw new Error(`No URL in upload response: ${JSON.stringify(data)}`);
  log(`  Uploaded ${fileName} → ${url}`);
  return url;
}

async function uploadImageWithRetry(filePath, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      return await uploadImage(filePath);
    } catch (err) {
      if (i < retries) {
        log(`  Upload retry ${i+1}/${retries} for ${path.basename(filePath)}: ${err.message.slice(0,60)}`);
        await sleep(2000);
      } else {
        throw err;
      }
    }
  }
}

// Upload all images for a group together
async function uploadImages(filePaths) {
  const results = [];
  for (const fp of filePaths) {
    results.push(await uploadImageWithRetry(fp));
  }
  return results;
}

// ============================================================
// 2. GPT vision analysis → shot prompts
// ============================================================

async function gptAnalyze(imageUrls, tailImageUrl, userPrompt = "") {
  const userContent = [{ type: "text", text: userPrompt || GPT_SYSTEM_PROMPT }];

  // Add reference images
  for (const url of [tailImageUrl, ...imageUrls]) {
    if (url) {
      userContent.push({ type: "image_url", image_url: { url } });
    }
  }
  // Add the user's specific prompt at the end
  userContent.push({
    type: "text",
    text: userPrompt
      ? ""
      : "\nAnalyze these reference images (person + bag + scene) and generate 3 shots for image-to-video generation. Output exactly in format:\nShot 1: ...\nShot 2: ...\nShot 3: ...",
  });

  const body = {
    model: CONFIG.gptModel,
    messages: [{ role: "user", content: userContent }],
    max_tokens: 2000,
  };

  log(`  GPT analyzing ${imageUrls.length} images + 1 tail image...`);
  const result = await apiFetch("POST", "/v1/chat/completions", body);
  const raw = result.choices?.[0]?.message?.content || "";
  log(`  GPT response (${raw.length} chars)`);

  return parseShotPrompts(raw);
}

function parseShotPrompts(text) {
  const shots = [];
  const regex = /Shot\s*(\d+)[:\s]+(.+?)(?=\n\s*Shot\s*\d+[:\s]|$)/gis;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const prompt = match[2].trim();
    if (prompt.length > 20) {
      shots.push({ shot: parseInt(match[1]), prompt });
    }
  }
  // Fallback: split by lines if regex fails
  if (shots.length === 0) {
    text.split("\n").forEach((line) => {
      const m = line.match(/Shot\s*\d+[:\s]+(.+)/i);
      if (m && m[1].trim().length > 20) shots.push({ shot: shots.length + 1, prompt: m[1].trim() });
    });
  }
  return shots.slice(0, 3);
}

// ============================================================
// 3. Submit video generation task
// ============================================================

async function submitVideoTask(imageUrl, prompt, shotIndex, groupIndex) {
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
  if (!taskId) {
    throw new Error(`No task_id in response: ${JSON.stringify(result)}`);
  }
  log(`  Group ${groupIndex} Shot ${shotIndex}: task submitted (task_id=${taskId})`);
  return taskId;
}

// ============================================================
// 4. Poll task status
// ============================================================

async function pollTask(taskId) {
  const deadline = Date.now() + CONFIG.pollTimeout;
  while (Date.now() < deadline) {
    const status = await apiFetch("GET", `/api/v1/skills/task-status?task_id=${taskId}`);
    if (status.is_final || status.state === "success" || status.state === "failed") {
      return status;
    }
    await sleep(CONFIG.pollInterval);
  }
  throw new Error(`Task ${taskId} timed out after ${CONFIG.pollTimeout / 1000}s`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ============================================================
// 5. Download result
// ============================================================

async function downloadResult(url, outputPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, buf);
  log(`  Downloaded → ${outputPath}`);
}

// ============================================================
// 6. Scan directory → group images
// ============================================================

function scanGroups(rootDir) {
  const supported = [".jpg", ".jpeg", ".png", ".webp"];
  const allFiles = fs.readdirSync(rootDir).filter((f) => supported.includes(path.extname(f).toLowerCase()));

  const tailFiles = allFiles.filter((f) => /^e\d+\.[^.]+$/i.test(f));
  const imageFiles = allFiles.filter((f) => !/^e\d+\.[^.]+$/i.test(f));

  imageFiles.sort((a, b) => {
    const na = parseInt(a.match(/^\d+/)?.[0]) || 999999;
    const nb = parseInt(b.match(/^\d+/)?.[0]) || 999999;
    return na - nb;
  });

  tailFiles.sort((a, b) => {
    const na = parseInt(a.match(/e(\d+)/i)?.[1]) || 0;
    const nb = parseInt(b.match(/e(\d+)/i)?.[1]) || 0;
    return na - nb;
  });

  const groups = [];
  for (let i = 0; i < imageFiles.length; i += 3) {
    const groupNum = Math.floor(i / 3) + 1;
    const images = imageFiles.slice(i, i + 3).map((f) => path.join(rootDir, f));
    const tail = tailFiles[groupNum - 1] ? path.join(rootDir, tailFiles[groupNum - 1]) : null;
    groups.push({ group: groupNum, images, tail });
  }
  return groups;
}

// ============================================================
// 7. Main
// ============================================================

async function main() {
  const args = process.argv.slice(2);
  const argMap = {};
  for (const arg of args) {
    const ci = arg.indexOf(":");
    if (ci > 0) {
      argMap[arg.slice(0, ci)] = arg.slice(ci + 1);
    }
  }

  const imageDir = argMap["dir"] || argMap["图片路径"];
  const startGroup = parseInt(argMap["start"] || argMap["起始组"]) || 1;
  const userPrompt = argMap["prompt"] || argMap["提示词描述"] || "";
  const customOutputDir = argMap["outdir"] || argMap["输出目录"] || "";

  if (!imageDir) {
    console.log("Usage: node ai_gpt_veo_v.js dir:D:\\path\\to\\images [start:2] [prompt:...] [outdir:D:\\path\\to\\output]");
    console.log("  Required env: LK888_API_KEY");
    process.exit(1);
  }

  if (!fs.existsSync(imageDir)) {
    console.error(`Directory not found: ${imageDir}`);
    process.exit(1);
  }

  // Phase 0: Scan groups
  const groups = scanGroups(imageDir);
  if (groups.length === 0) {
    console.error("No images found.");
    process.exit(1);
  }

  log(`Found ${groups.length} groups, starting from group ${startGroup}`);
  for (const g of groups) {
    log(`  Group ${g.group}: ${g.images.length} images + ${g.tail ? "tail" : "no tail"}`);
  }

  // Phase 1: For each group, GPT analyze → submit video tasks
  const allTasks = []; // [{ taskId, group, shot, prompt, outputPath }]

  for (const grp of groups) {
    if (grp.group < startGroup) {
      log(`\nSkipping group ${grp.group} (start=${startGroup})`);
      continue;
    }
    if (grp.images.length < 3) {
      log(`\nSkipping group ${grp.group}: only ${grp.images.length} images, need 3`);
      continue;
    }
    if (!grp.tail) {
      log(`\nSkipping group ${grp.group}: no tail image`);
      continue;
    }

    log(`\n${"=".repeat(50)}`);
    log(`GROUP ${grp.group}/${groups.length}`);
    log(`${"=".repeat(50)}`);

    // Upload reference images for GPT
    log("Uploading images...");
    const gptImageUrls = await uploadImages(grp.images);
    const tailUrl = await uploadImage(grp.tail);

    // GPT analyze
    const shots = await gptAnalyze(gptImageUrls, tailUrl, userPrompt);
    if (shots.length === 0) {
      log(`Group ${grp.group}: GPT returned no valid shots, skipping.`);
      continue;
    }
    log(`Got ${shots.length} shots from GPT`);
    shots.forEach((s) => log(`  Shot ${s.shot}: ${s.prompt.slice(0, 80)}...`));

    // Submit video tasks for each shot
    for (let si = 0; si < shots.length && si < grp.images.length; si++) {
      const shot = shots[si];
      log(`\nSubmitting video for Shot ${shot.shot}...`);
      const taskId = await submitVideoTask(gptImageUrls[si], shot.prompt, shot.shot, grp.group);
      allTasks.push({
        taskId,
        group: grp.group,
        shot: shot.shot,
        prompt: shot.prompt,
        imageUrl: gptImageUrls[si],
      });
    }
  }

  // Phase 2: Poll all tasks and download
  if (allTasks.length === 0) {
    log("No tasks submitted.");
    return;
  }

  log(`\n${"=".repeat(50)}`);
  log(`POLLING ${allTasks.length} video tasks...`);
  log(`${"=".repeat(50)}`);

  const now = new Date();
  const monthDir = `${String(now.getMonth() + 1).padStart(2, "0")}.${String(now.getDate()).padStart(2, "0")}`;
  const outputDir = customOutputDir ? path.resolve(customOutputDir) : path.join("D:\\Backup\\Downloads", monthDir);
  const results = [];

  for (const task of allTasks) {
    log(`\nWaiting for Group ${task.group} Shot ${task.shot} (task ${task.taskId})...`);
    try {
      const status = await pollTask(task.taskId);
      if (status.state === "success" && status.result_url) {
        const ext = ".mp4";
        const outPath = path.join(outputDir, `${String(task.group).padStart(2, "0")}_shot${task.shot}${ext}`);
        await downloadResult(status.result_url, outPath);
        results.push({ ...task, status: "success", output: outPath, cost: status.cost });
        log(`  ✅ Group ${task.group} Shot ${task.shot}: done (cost=${status.cost})`);
      } else {
        log(`  ❌ Group ${task.group} Shot ${task.shot}: ${status.error || status.status || "unknown error"}`);
        results.push({ ...task, status: "failed", error: status.error });
      }
    } catch (err) {
      log(`  ❌ Group ${task.group} Shot ${task.shot}: ${err.message}`);
      results.push({ ...task, status: "error", error: err.message });
    }
  }

  // Summary
  log(`\n${"=".repeat(50)}`);
  log("SUMMARY");
  log(`${"=".repeat(50)}`);
  const success = results.filter((r) => r.status === "success").length;
  const failed = results.filter((r) => r.status !== "success").length;
  log(`Total submitted: ${results.length}`);
  log(`Successful: ${success}`);
  log(`Failed: ${failed}`);
  if (success > 0) log(`Output directory: ${path.resolve(outputDir)}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

