# 致谢 / Credits

游戏内可在「标题页脚」或「设置 → 致谢与许可」查看本页内容，以及字体（SIL OFL 1.1）、
Godot 引擎（MIT）和引擎内置第三方组件的许可全文。每个导出包旁也附有本文件和 `OFL.txt`。

In-game: click the title-screen footer or Settings → Credits & Licences for this text plus the full
font (SIL OFL 1.1), Godot (MIT) and third-party licence notices. Every build also ships this file
and `OFL.txt` next to the executable / index.html.

## 露珠守园人 Dewkeepers

### 美术 Art
所有图像（植物、虫子、花盆、背景、界面、图标）均为本项目原创，由 `tools/make_art.py` 以代码编写 SVG
并栅格化生成，不包含任何第三方或受版权保护的素材。

All sprites, backgrounds, UI and the icon are original work authored as code in
`tools/make_art.py` (SVG → PNG). No third-party art is used.

### 音效与音乐 Sound & Music
全部音效与背景音乐由 `tools/make_audio.py` 用 numpy 从零合成（正弦/三角/噪声振荡器 + 包络），
为本项目原创，不含任何采样。按 CC0 1.0 释出，可自由使用。

All sound effects and the music loop are synthesized from scratch by `tools/make_audio.py`
(oscillators + envelopes, no samples). Original to this project; released under CC0 1.0.

### 字体 Font
- **Noto Sans SC**（思源黑体同源字体）© 2014-2021 Adobe (http://www.adobe.com/), with Reserved
  Font Name 'Source'. 依据 **SIL Open Font License 1.1** 授权，许可证全文见
  `assets/fonts/OFL.txt`。
- 本项目内置的 `assets/fonts/NotoSansSC-Bold.ttf` 是由 `tools/make_font.py` 从
  [google/fonts](https://github.com/google/fonts/tree/main/ofl/notosanssc) 的可变字体生成的
  Bold 静态实例子集（仅含游戏用到的字符），按 OFL 1.1 再分发。

### 引擎 Engine
- [Godot Engine](https://godotengine.org) 4.7 — MIT License, © Juan Linietsky, Ariel Manzur and
  contributors. Godot bundles third-party components (FreeType, HarfBuzz, ICU, etc.) under their own
  permissive licenses; see https://godotengine.org/license/ .

### 隐私 Privacy
游戏不联网、不收集任何个人数据，进度只保存在本地设备。
The game does not connect to the internet or collect personal data; progress is stored locally.
