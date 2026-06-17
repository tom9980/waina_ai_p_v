# Video-Only Workflow

This document covers the existing `ai_gpt_veo_v.js` workflow.

Use this flow when the reference scene images are already available, for example:

```text
1.png
2.png
3.png
e1.jpg
```

The script uploads those images, asks GPT to generate video prompts, submits image-to-video tasks, polls the tasks, and downloads MP4 files.

## Quick Start

```powershell
cd E:\Z\CodexProject\ai_p_v
$env:LK888_API_KEY = "YOUR_LK888_API_KEY"
node ai_gpt_veo_v.js dir:D:\Backup\Downloads\cs
```

Start from a later group:

```powershell
node ai_gpt_veo_v.js dir:D:\Backup\Downloads\cs start:3
```

Pass a custom prompt description:

```powershell
node ai_gpt_veo_v.js dir:D:\Backup\Downloads\cs prompt:"custom prompt text"
```

Send MP4 outputs to a custom folder:

```powershell
node ai_gpt_veo_v.js dir:D:\Backup\Downloads\cs outdir:D:\Backup\Downloads\06.10\auto_1435\01
```

Syntax check:

```powershell
node --check ai_gpt_veo_v.js
```

## Inputs And Naming

Supported image extensions:

- `.jpg`
- `.jpeg`
- `.png`
- `.webp`

Normal images are sorted by the leading number in the filename, then chunked every 3 images:

```text
1.png
2.png
3.png
e1.jpg
```

This creates group 1 and generates up to 3 videos.

For multiple groups:

```text
1.png
2.png
3.png
4.png
5.png
6.png
e1.jpg
e2.jpg
```

Tail images are intended to be named `eN.ext`, where `N` is the group number:

- `e1.jpg` belongs to group 1.
- `e2.jpg` belongs to group 2.

Important limitation:

- The current code does not match tail images by exact group number. It sorts tail files and uses array position (`tailFiles[groupNum - 1]`).
- If `e4` is missing but `e5`, `e6`, etc. exist, later tail images silently shift to the wrong groups.
- Names like `1_01.png`, `1_03.png`, `1_04.png` work because grouping sorts by leading number and slices every 3 files.
- Missing or irregular numbering can silently change group composition.

Safer future input formats:

- Per-group folders.
- Explicit names such as `g1_1`, `g1_2`, `g1_3`, `g1_e`.

## Current Config

Hardcoded config in `ai_gpt_veo_v.js`:

- `apiBase`: `https://api.lk888.ai`
- `uploadEndpoint`: `https://api.lk888.ai/api/v1/media/upload`
- `gptModel`: `gpt-5.5`
- `videoModel`: `grok-video-3.5`
- `aspectRatio`: `9:16`
- `duration`: `6`
- `resolution`: `720p`
- `pollInterval`: `10000` ms
- `pollTimeout`: `600000` ms
- Optional CLI `outdir:`: overrides the default video download folder.

## API Flow

### Upload

Local files are uploaded to LK888:

```text
POST https://api.lk888.ai/api/v1/media/upload
Authorization: Bearer $LK888_API_KEY
multipart/form-data field: file
```

Observed successful response:

```json
{
  "url": "https://cos.lingkeai.vip/uploads/..."
}
```

The script reads the public image URL from one of:

- `url`
- `downloadLink`
- `link`

Earlier versions used `tmpfile.link`, but it frequently produced `ECONNRESET`, `UND_ERR_SOCKET`, and upload timeouts. LK888 upload is now the primary provider for this script.

Current retry status:

- Normal group images use `uploadImageWithRetry(filePath, retries = 2)`.
- The tail image still uses `uploadImage(grp.tail)` directly and does not retry.

### GPT Image Analysis

Endpoint:

```text
POST https://api.lk888.ai/v1/chat/completions
```

Model:

```text
gpt-5.5
```

Request shape:

```json
{
  "model": "gpt-5.5",
  "messages": [
    {
      "role": "user",
      "content": [
        { "type": "text", "text": "prompt instructions..." },
        { "type": "image_url", "image_url": { "url": "tail image URL" } },
        { "type": "image_url", "image_url": { "url": "reference image 1 URL" } },
        { "type": "image_url", "image_url": { "url": "reference image 2 URL" } },
        { "type": "image_url", "image_url": { "url": "reference image 3 URL" } },
        { "type": "text", "text": "Output exactly as Shot 1, Shot 2, Shot 3" }
      ]
    }
  ],
  "max_tokens": 2000
}
```

Current default prompt rules:

- Preserve identity, face, facial features, skin tone, age perception, temperament, hairstyle, and hair color.
- Do not change clothing, clothing color, or clothing details.
- Preserve handbag details exactly.
- Each shot must include person action, bag action, and camera movement.
- No audio, no text, no watermark.
- Output exactly `Shot 1:`, `Shot 2:`, `Shot 3:` in English.

Important behavior:

- The LK888 front-end/history view may show only the text part of this multimodal request and not render image URLs.
- Confirm image sending through local upload logs and GPT response quality.
- Each group is analyzed independently.
- Tested OpenAI-style continuation endpoints such as `POST /v1/chat/completions/{chat_id}` returned `404`.
- GPT occasionally returns fewer than 3 parseable shots. The script only submits the shots it can parse.

### Video Generation

Endpoint:

```text
POST https://api.lk888.ai/api/v1/media/generate
```

Model:

```text
grok-video-3.5
```

Request shape:

```json
{
  "model": "grok-video-3.5",
  "prompt": "Shot prompt text",
  "count": 1,
  "params": {
    "prompt": "Shot prompt text",
    "aspectRatio": "9:16",
    "duration": "6",
    "resolution": "720p",
    "images": ["reference image URL"]
  }
}
```

This model requires `params.images` for image-to-video. Text-to-video requests fail with an invalid-parameter error.

### Polling

Endpoint:

```text
GET https://api.lk888.ai/api/v1/skills/task-status?task_id=...
```

Final success requires:

- `state === "success"`
- `result_url` exists

If downloading fails but the task reached success, do not resubmit the video job just to download again. Poll the same `task_id` and download `result_url` manually or with a helper.

## Output

Downloaded videos are saved to:

```text
D:\Backup\Downloads\MM.DD
```

Examples:

```text
D:\Backup\Downloads\06.08
D:\Backup\Downloads\06.09
```

File naming:

```text
01_shot1.mp4
01_shot2.mp4
01_shot3.mp4
02_shot1.mp4
...
```

Important:

- Different runs on the same day can overwrite the same `XX_shotY.mp4` names.
- There is an old local `output/` folder in the repo from earlier runs, but current downloads go to `D:\Backup\Downloads\MM.DD`.

## Pricing Notes

The script does not calculate model pricing locally. It reads the `cost` field returned by LK888 task status and logs it.

Observed costs:

- `grok-video-3.5`, 6s, 9:16, 720p image-to-video: usually `0.58` per video in recent runs.
- Older successful runs before the 720p/config changes often logged `0.59` per video.
- 3 videos at `0.58`: `1.74`.
- 21 videos at `0.58`: `12.18`.

Special behavior:

- Failed text-to-video attempts for `grok-video-3.5` were refunded by LK888.
- Failed media tasks with `state === "failed"` and `is_final === true` are documented by LK888 as automatically refunded.
- GPT image analysis returns token usage, but no local cost calculation is implemented.
- If LK888 returns an insufficient quota/disabled key message, do not log the real key while debugging.

## Recent Issues

### Base64 Images

Base64 image inputs are not reliable for this LK888 workflow. Upload local files and pass public URLs.

### Upload Instability

Observed errors include:

- `ECONNRESET`
- `UND_ERR_SOCKET`
- `UND_ERR_HEADERS_TIMEOUT`
- `fetch failed`

The current script retries normal reference image uploads, but GPT calls, video submit calls, tail uploads, polling calls, and downloads still need stronger retry handling.

### Orphaned Submitted Jobs

If the script crashes after submitting video tasks but before polling/downloading, those tasks may still complete and cost credits. Do not blindly rerun the same group if the goal is only to download outputs.

Manual recovery pattern:

```powershell
GET https://api.lk888.ai/api/v1/skills/task-status?task_id=TASK_ID
```

### Download Failures

Downloads can fail with `fetch failed` or local `EPERM` on Windows. `EPERM` may happen when a file is locked or a stale partial output exists. Clean up the specific output file only when the user approves or when it is clearly a failed partial.

### Process Stopping

To stop a running job safely, look only for Node processes running this script:

```powershell
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
  Where-Object { $_.CommandLine -match 'ai_gpt_veo_v\.js' }
```

Then stop only those PIDs. Avoid matching every PowerShell command line containing the script name, because the stop command can accidentally match itself.
