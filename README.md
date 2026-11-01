# Vidit

<p align="center"><img src="assets/icon.png" width="120" alt="Vidit logo"></p>

A lightweight, local-first video editor for Windows. Built with Electron.

## Features

- Multi-track timeline (video, audio, text, stickers)
- Preview with live playback, effects, fades, transitions
- Keyframes for scale, position, rotation, opacity, volume
- Text overlay with fonts, shadows, strokes, backgrounds
- Library: media, audio, text templates, effects, transitions
- Export via FFmpeg (MP4 / WebM, H.264 / VP9)
- Project autosave and recovery
- Custom frameless UI with dark palette and coral accent

## Setup

Requires a local FFmpeg installation (or set `ffmpegPath` / `ffprobePath` in Settings). Uses Windows common-path / WinGet detection automatically.

```bash
npm install
npm run dev
```

Build installer:

```bash
npm run dist
```

## Export

Exports render locally — nothing leaves your computer. Text and sticker overlays are rasterized as transparent PNGs and composited by FFmpeg `filter_complex`.

## Contributors

- [Crishan-py](https://github.com/Crishan-py) (author / maintainer)

## License

MIT
