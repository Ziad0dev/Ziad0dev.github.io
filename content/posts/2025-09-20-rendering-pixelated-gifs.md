---
title: Rendering Pixelated GIFs Without Blurring
date: 2025-09-20
category: Tutorial
description: Keep pixel art crispy with CSS while honoring retro display vibes.
---

Browsers like to *smooth* your precious pixels. We reject this.

```css
.pixel-art {
  image-rendering: pixelated;
  width: 128px;
  height: 128px;
  border: 2px outset #66aaff;
  background:#002244;
}
```

### Bonus: CRT Frame

Combine a subtle inner shadow and scanlines layer for pseudo-monitor depth.

> Tip: Avoid scaling GIFs by non-integer ratios if you want perfect edges.
