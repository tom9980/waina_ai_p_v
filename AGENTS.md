# AGENTS.md — ai_p_v 项目手册

## 项目概览

编织女包短视频全自动生成流水线。输入产品白底图 + 模特图 → GPT-5.5 生成场景提示词 → GPT Image 2 生图 → grok-video-3.5 生成 9:16 竖屏带货视频（6秒，720p，带口播）。

**目标人群**：20-35 岁女性  
**价格锚点**：$100 划线 / $43.99  
**发布平台**：TikTok / Instagram

## 核心文件

| 文件 | 用途 |
|------|------|
| `ai_full_auto.js` | 全自动流水线（当前主力） |
| `ai_gpt_veo_v.js` | 旧版视频-only 流水线（保留备用） |

## 常用命令

```powershell
cd E:\Z\CodexProject\ai_p_v
$env:LK888_API_KEY = "你的KEY"

# 批量跑（推荐）
node ai_full_auto.js dir:D:\Backup\Downloads\m1

# 精准补跑
node ai_full_auto.js dir:D:\Backup\Downloads\m1 start:3 end:3

# 干跑（只生图不生视频）
node ai_full_auto.js dir:D:\Backup\Downloads\m1 dry:1
```

## 输入规范

源文件夹结构（如 `D:\Backup\Downloads\m1`）：
```
m1.png          ← 模特图（必须 m + 数字）
1.png, 2.png... ← 产品图（数字命名）
```

输出：`D:\Backup\Downloads\MM.DD\m1\v01_shot1.mp4` 等 27 个文件。

## 定时任务

| 任务 | 时间 | 命令 |
|------|------|------|
| m1 | 每天 19:00 | `scheduled\run_m1.bat` |
| m2 | 每天 20:30 | `scheduled\run_m2.bat` |
| m3 | 每天 22:00 | `scheduled\run_m3.bat` |
| 睡眠 | 每天 23:30 | `scheduled\sleep_pc.bat` |

周一至周六运行，周日休息。

## API 配置

- Base URL: `https://api.lk888.ai`
- 模型：`gpt-5.5` / `gpt-image-2` / `grok-video-3.5`
- 图片尺寸：2160×3840（9:16 竖屏）
- Key 通过环境变量 `LK888_API_KEY` 传入，不要写进文件

## 剧本库（29个）

价格吊牌系列（14）：boutique_sale_reveal, limited_sale_unboxing, friend_price_reveal, factory_craft, warehouse_sale, popup_store, design_studio, livestream_sale, sample_room, packing_station, trade_show, wait_how_much, bf_buys_me_bag, sale_alert_countdown

生活方式系列（15）：cafe_to_street, travel_ready, date_night_ready, summer_boardwalk, unboxing_to_outfit, fitting_room_mirror, bookstore_browse, girls_brunch, whats_in_my_bag, work_to_dinner, ootd_check, five_ways_to_style, pov_you_got_the_bag, beach_to_brunch, conversation_starter

已删除：steal_or_splurge, dupe_the_luxury

## 关键优化规则

- 服装：夏季性感休闲风，50/50 短裤长裤，黑色至少 2/9，粉色最多 1/5
- 颜色：不能连续 3 个同色系，白色系最多 1/3，颜色组轮替
- 滤镜：禁止暖色滤镜，自然日光 5500K-6500K
- 包包：肩带不裂不脱、不瞬移、不漂浮、一手锁定
- 吊牌：$100 划线 / $43.99 必须全帧清晰
- 口播：温暖年轻美式女声，中等偏快，无 BGM
- 视频速度：自然中快，不拖沓

## 费用参考

- GPT Image 2：¥0.06/张
- grok-video-3.5：¥0.58/个
- 单产品 ≈ ¥1.92，9 产品 ≈ ¥17.28
- m1+m2+m3 全套 ≈ ¥54

## 最近踩坑

- `ai_full_auto.js` 不要用 JSON.stringify 修改 STORY_ARCS，会破坏 JS 格式
- 文件编辑用 node 脚本而非 PowerShell，避免转义问题
- LK888 GPT-5.5 偶发 502/DNS 超时，重试就行
- gpt-image-2 偶发 `fetch failed` 或 `违反平台政策`，换剧本重试
- 定时任务检查输出：`D:\Backup\Downloads\当天日期\m1|m2|m3`，每个文件夹 27 个 MP4 即完成
- 额度耗尽时所有 API 返回错误，需充值后重跑