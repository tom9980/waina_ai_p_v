# Full-Auto Workflow

This document covers the prototype `ai_full_auto.js` workflow.

Use this flow when the user wants to provide only:

- one product white-background image for a woven handbag
- one fixed model image

The script should generate 3 marketing/lifestyle reference images with GPT Image 2, then call the existing video-only pipeline. In batch mode it loops over numeric product images in the same folder while reusing one model image.

## Quick Start

Single product:

```powershell
cd E:\Z\CodexProject\ai_p_v
$env:LK888_API_KEY = "YOUR_LK888_API_KEY"
node ai_full_auto.js product:"D:\Backup\Downloads\cs\1.jpg" model:"D:\Backup\Downloads\cs\m1.png"
```

Batch folder, with model image named `m1.jpg`, `m1.png`, `m1.jpeg`, or `m1.webp`:

```powershell
cd E:\Z\CodexProject\ai_p_v
$env:LK888_API_KEY = "YOUR_LK888_API_KEY"
node ai_full_auto.js dir:"D:\Backup\Downloads\cs"
```

Batch folder with an explicit model image:

```powershell
node ai_full_auto.js dir:"D:\Backup\Downloads\cs" model:"D:\Backup\Downloads\cs\0.png"
```

Syntax check:

```powershell
node --check ai_full_auto.js
```

Argument rules:

- `product:` must point to a specific product image file, not a folder.
- `model:` must point to a specific model image file.
- `dir:` enables batch mode. The directory should contain a model image named `m1.jpg`, `m1.jpeg`, `m1.png`, or `m1.webp`.
- Batch product images should be named as positive numbers: `1.jpg`, `2.jpg`, `3.png`, etc.
- Batch mode also works with `product:<folder>`.
- Batch mode can override the model with `model:<specific_model_path>`.
- Historical mistake: `product:D:\Backup\Downloads\cs` used to fail because it was a directory; it now starts batch mode.
- Example mistake: `product:"D:\Backup\Downloads\cs\1.png"` failed because the actual file was `1.jpg`.

Working command from the test run:

```powershell
node ai_full_auto.js product:"D:\Backup\Downloads\cs\1.jpg" model:"D:\Backup\Downloads\cs\m1.png"
```

## Current Flow

1. Upload product image and model image to `tmpfile.link`.
2. Randomly select 1 complete story arc from a 12-item story pool.
3. Ask `gpt-5.5` to write 3 English GPT Image 2 prompts based on:
   - the product image
   - the model image
   - the selected story arc and its 3 beats
4. Submit 3 GPT Image 2 tasks (`gpt-image-2`) with both reference image URLs.
5. Poll image tasks through `/v1/media/status`.
6. Keep the GPT Image 2 `result_url`s in memory; do not download `1.png`, `2.png`, or `3.png`.
7. Send those generated image URLs plus the model image URL to `gpt-5.5` to create 3 video prompts.
8. Submit 3 direct image-to-video tasks with `grok-video-3.5`.
9. Download only final MP4 files to the model-name output folder.

Historical limitation:

- `ai_full_auto.js` used to contain duplicate appended function blocks and two `main().catch(...)` calls. Running it once launched two concurrent workflows. This was fixed on 2026-06-10; current checks show one `buildSceneSystem`, one `main`, and one `main().catch(...)`.

## Current Config

Hardcoded config in `ai_full_auto.js`:

- `apiBase`: `https://api.lk888.ai`
- `uploadEndpoint`: `https://tmpfile.link/api/upload`
- `gptModel`: `gpt-5.5`
- `imgModel`: `gpt-image-2`
- `imgSize`: `1088x1920`
- `imgQuality`: `high`
- `imgPollInterval`: `5000` ms
- `imgPollTimeout`: `600000` ms

Note:

- `ai_full_auto.js` still uses `tmpfile.link`, while `ai_gpt_veo_v.js` uses LK888 upload. `tmpfile.link` worked during the 2026-06-09 full-auto test, but it has been unstable in larger batch runs.

## GPT Image 2 API

Docs page used in this session:

```text
https://lingwuai.ai/apidoc#model/gpt-image-2
```

The docs page is a SPA and may require login before the detailed model docs are visible.

Model:

```text
gpt-image-2
```

Generation endpoint:

```text
POST https://api.lk888.ai/v1/media/generate
```

Working text-to-image test body:

```json
{
  "model": "gpt-image-2",
  "prompt": "A stylish young woman holding a woven straw handbag...",
  "n": 1,
  "size": "1024x1536",
  "quality": "high"
}
```

Working image-to-image body shape used by `ai_full_auto.js`:

```json
{
  "model": "gpt-image-2",
  "prompt": "Photorealistic fashion/lifestyle scene prompt...",
  "n": 1,
  "size": "1088x1920",
  "quality": "high",
  "images": [
    "model image URL",
    "product image URL"
  ]
}
```

Docs list these relevant parameters:

- `images`: optional reference image URL array, 1-10 images.
- `size`: required. Recommended `auto`; supported values include `1024x1024`, `1024x1536`, `1536x1024`, `1088x1920`, `1920x1088`, `2160x3840`, etc.
- `quality`: optional. `auto`, `high`, `medium`, `low`.
- `n`: optional, only `1` was listed in docs.
- `response_format`: optional, `url`.
- `aspect_ratio`: optional, docs listed only `1:1`.
- `resolution`: optional, docs listed only `1K`.

Submit response:

```json
{
  "code": 200,
  "data": {
    "task_id": 123456,
    "任务ids": [123456],
    "对话组ID": "group_...",
    "成功数量": 1
  },
  "msg": "Task created successfully"
}
```

Polling endpoint:

```text
GET https://api.lk888.ai/v1/media/status?task_id={task_id}
```

Use `is_final === true` to detect terminal state. Use `state` for success/failure:

- `pending`
- `running`
- `success`
- `failed`

Do not use Chinese `status` or `status_group` fields for program logic.

Observed final response:

```json
{
  "cost": 0.0644,
  "error": "",
  "is_final": true,
  "progress": "100",
  "result_type": "image",
  "result_url": "https://oss.filenest.top/uploads/....png",
  "state": "success"
}
```

## Story Arc Pool

The full-auto script now uses a 12-item story arc pool for woven handbags. Each run picks one story, and that story contains 3 connected beats. This is designed so `01_shot1.mp4`, `01_shot2.mp4`, and `01_shot3.mp4` can be concatenated as one short ad.

- `boutique_sale_reveal`: boutique discovery, physical sale hangtag with `$100` crossed out and `$43.99`, confident exit.
- `limited_sale_unboxing`: home unboxing, physical sale hangtag with `$100` crossed out and `$43.99`, mirror/outfit exit.
- `friend_price_reveal`: shopping street social proof, friend notices the physical sale hangtag with `$100` crossed out and `$43.99`, happy walking ending.
- `cafe_to_street`: cafe table moment, capacity packing beat, street walk exit.
- `office_day`: office arrival, desk/product detail, elevator exit.
- `weekend_market_story`: market browsing, friend compliment/social proof, walking away with flowers.
- `travel_ready`: airport arrival, essentials in bag, boarding gate walk.
- `date_night_ready`: mirror prep, bag detail check, evening restaurant entrance.
- `summer_boardwalk`: sunny walk, woven texture close-up, sunset turn.
- `rainy_city_chic`: umbrella sidewalk, protected bag detail, cafe doorway exit.
- `unboxing_to_outfit`: premium unboxing, mirror outfit check, apartment exit.
- `garden_brunch`: brunch arrival, chair/table product beat, garden path ending.

Prompt rules that worked well:

- Keep the exact outfit from the model reference image.
- Treat reference image 2 as the authoritative handbag reference.
- Keep the exact bag color, shape, size, handle, weave texture, material, and design details from reference image 2.
- Make the bag the main subject in every generated image.
- Ask for a real fashion/lifestyle photo feel.
- Default rule: use no logos, no text, no readable words, and no watermarks.
- Exception: price-tag stories may include only the physical sale hangtag text `$100` crossed out and `$43.99`. No other readable text is allowed.
- Keep all 3 prompts in the same story world: consistent model, outfit, bag, lighting family, color palette, and time of day.
- Make the 3 prompts flow as opening -> product/detail beat -> closing/payoff.

## Full-Auto Test Run

### Test Run: 2026-06-10 Story Arc + Short Video Names

Command used:

```powershell
node ai_full_auto.js product:"D:\Backup\Downloads\cs\1.jpg" model:"D:\Backup\Downloads\cs\0.png"
```

Generated image folder:

```text
D:\Backup\Downloads\06.10\auto_1435
```

Selected story arc:

- `rainy_city_chic`

Generated image task IDs:

- `39937871`
- `39937882`
- `39937893`

Generated video task IDs:

- `39940626`
- `39940633`
- `39940642`

Results:

- `1.png`, `2.png`, `3.png`, `e1.png` generated in `D:\Backup\Downloads\06.10\auto_1435`.
- `01_shot1.mp4`, `01_shot2.mp4`, `01_shot3.mp4` downloaded to `D:\Backup\Downloads\06.10`.
- All 3 videos succeeded.

Observed costs:

- 3 GPT Image 2 images: `0.0644` each.
- 3 `grok-video-3.5` videos: `0.58` each.

### Test Run: 2026-06-10 Duplicate-Fix Validation

Command used:

```powershell
node ai_full_auto.js product:"D:\Backup\Downloads\cs\1.jpg" model:"D:\Backup\Downloads\cs\0.png"
```

Generated image folder:

```text
D:\Backup\Downloads\06.10\auto_1400
```

Selected creative scripts:

- `summer_vibe`
- `cafe_glance`
- `garden_party`

Generated image task IDs:

- `39890865`
- `39890868`
- `39890870`

Generated video task IDs:

- `39900304`
- `39900308`
- `39900311`

Results:

- `1.png`, `2.png`, `3.png`, `e1.png` generated in `D:\Backup\Downloads\06.10\auto_1400`.
- `group01_shot1.mp4`, `group01_shot2.mp4`, `group01_shot3.mp4` downloaded to `D:\Backup\Downloads\06.10` before the 2026-06-10 naming change.
- All 3 videos succeeded.

Observed costs:

- 3 GPT Image 2 images: `0.0644` each.
- 3 `grok-video-3.5` videos: `0.58` each.
- Observed media total: about `1.9332`, excluding GPT prompt-analysis token charges.

### Test Run: 2026-06-09

Command used:

```powershell
node ai_full_auto.js product:"D:\Backup\Downloads\cs\1.jpg" model:"D:\Backup\Downloads\cs\m1.png"
```

Generated image folder:

```text
D:\Backup\Downloads\06.09\auto_1512
```

Final visible generated image set came from:

- `office_arrival`
- `pov_selfie`
- `weekend_market`

Due to the duplicate `main()` bug, a second concurrent run also selected:

- `summer_vibe`
- `rainy_day`
- `travel_ready`

That duplicate run submitted extra GPT Image 2 tasks and extra video tasks, and may have caused overwrites. The final visible `1.png` shown in the conversation was the `office_arrival` scene.

## Output

Full-auto no longer downloads intermediate scene images. It only downloads final MP4 files.

When the model file is named `m1.png`, outputs go to:

```text
D:\Backup\Downloads\MM.DD\m1
```

Batch example:

```text
D:\Backup\Downloads\06.10\m1\01_shot1.mp4
D:\Backup\Downloads\06.10\m1\01_shot2.mp4
D:\Backup\Downloads\06.10\m1\01_shot3.mp4
D:\Backup\Downloads\06.10\m1\02_shot1.mp4
D:\Backup\Downloads\06.10\m1\02_shot2.mp4
D:\Backup\Downloads\06.10\m1\02_shot3.mp4
```

Important:

- Product number comes from the product filename. `1.jpg` produces `01_shot1.mp4`, `01_shot2.mp4`, `01_shot3.mp4`.
- `2.jpg` produces `02_shot1.mp4`, `02_shot2.mp4`, `02_shot3.mp4`.
- Re-running the same product/model on the same date can overwrite the existing MP4 files in that model folder.

## Pricing Notes

Observed costs:

- `gpt-image-2`, high quality image generation: `0.0644` per image in both text-to-image and image-to-image tests.
- 3 GPT Image 2 images at `0.0644`: `0.1932`.
- `grok-video-3.5`, 6s, 9:16, 720p image-to-video: usually `0.58` per video in recent runs.
- 3 videos at `0.58`: `1.74`.
- Expected non-duplicated full-auto cost for 3 images + 3 videos: about `1.9332`, excluding GPT prompt-analysis token charges.

Special behavior:

- Failed media tasks with `state === "failed"` and `is_final === true` are documented by LK888 as automatically refunded.
- The duplicate `main()` bug can double-submit paid tasks, so fix it before production use.

Model price logic:

- No local model-price lookup is implemented in this repo.
- Treat the `cost` field returned by each completed task status response as the actual charged amount.
- If adding price display later, do not hardcode prices; query LK888's current model price source if available and still prefer final `status.cost`.

## Current Bugs And Hardening Notes

### Duplicate Execution Fixed

`ai_full_auto.js` used to have two `main().catch(...)` calls and duplicated function definitions. `rg` previously found:

```text
main().catch(...)
...
main().catch(...)
```

Status:

- Fixed on 2026-06-10 by removing the duplicate appended block.
- `node --check ai_full_auto.js` passed after the fix.
- Current check showed only one `buildSceneSystem`, one `main`, and one `main().catch(...)`.
- Still consider adding a run lock or unique output folder with seconds/random suffix.

### Upload Provider

`tmpfile.link` worked in the full-auto test, but it has been unstable. Future hardening should switch to:

```text
POST https://api.lk888.ai/api/v1/media/upload
```

or add fallback providers.

### Persistence

Persist these per run:

- selected creative scripts
- generated GPT Image 2 prompts
- uploaded product/model URLs
- GPT Image 2 task IDs
- generated image URLs
- spawned video task IDs

Without this, crashes can orphan paid jobs and make recovery harder.

## Future Improvements

- Switch uploads to LK888 upload or add fallback.
- Add retry logic for GPT analysis, GPT Image 2 submit/poll/download, video submit/poll/download, and tail uploads.
- Add dry-run mode that only generates prompts and estimated task counts.
- Add an optional debug mode to download intermediate generated images when visual QA is needed.
- Add "download only from task IDs" helper.
- Save full prompts, image URLs, and task IDs to a run log in the model output folder.
- Add a run id if same-day reruns should not overwrite existing MP4 files.
