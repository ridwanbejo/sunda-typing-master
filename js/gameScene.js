(function (global) {
  'use strict';

  const BLOCK_PALETTE = [
    0xff595e, // Coral Red
    0xff924c, // Tangerine
    0xffca3a, // Sunflower Gold
    0x2ec4b6, // Turquoise
    0x1982c4, // Azure Blue
    0x8b5cf6, // Electric Violet
    0xf72585, // Vivid Magenta
    0x06b6d4, // Bright Cyan
    0x84cc16, // Lime Green
  ];

  const FONT_SUNDA = '"Noto Sans Sundanese", "Sundanese Unicode", "Arial Unicode MS", sans-serif';
  const FONT_UI = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const FONT_MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

  const VISIBLE_ROWS = 6;

  const SFX_PATHS = {
    'sfx-success':
      'assets/sfx/vadim_makes_sound-modern-success-confirmation-notification-566072.mp3',
    'sfx-fail':
      'assets/sfx/lesiakower-error-mistake-sound-effect-incorrect-answer-437420.mp3',
  };

  function createSfxPool(src, volume, size = 4) {
    const pool = Array.from({ length: size }, () => {
      const audio = new Audio(src);
      audio.preload = 'auto';
      audio.volume = volume;
      return audio;
    });
    let idx = 0;

    return {
      play(overrideVolume) {
        const audio = pool[idx];
        idx = (idx + 1) % pool.length;
        if (typeof overrideVolume === 'number') {
          audio.volume = overrideVolume;
        }
        try {
          audio.currentTime = 0;
        } catch (_err) {
          // Ignore seek errors before metadata is loaded
        }
        const promise = audio.play();
        if (promise && typeof promise.catch === 'function') {
          promise.catch(() => {});
        }
      },
    };
  }

  class SundaGameScene extends Phaser.Scene {
    constructor() {
      super({ key: 'SundaGameScene' });

      this.isPlaying = false;
      this.config = null;
      this.callbacks = {};

      this.wordQueue = [];
      this.totalWords = 0;
      this.nextWordIdx = 0;
      this.rowItems = []; // index 0 = active bottom row, index 1..N = stacked above

      this.score = 0;
      this.wordsCleared = 0;
      this.mistakes = 0;
      this.streak = 0;
      this.sessionStartMs = 0;
      this.durationMs = 120000;
      this.remainingMs = 120000;
      this.lastDisplayedSec = -1;

      this.timerEvent = null;
      this.errorResetTimer = null;
      this.bgShapes = [];
      this.colorCursor = 0;

      this.sfxPools = {
        'sfx-success': createSfxPool(SFX_PATHS['sfx-success'], 0.8),
        'sfx-fail': createSfxPool(SFX_PATHS['sfx-fail'], 0.85),
      };
    }

    preload() {}

    create() {
      this.createProceduralTextures();
      this.createBackground();
      this.createPlayfieldRails();
      this.createHUD();
      this.setHUDVisible(false);

      this.scale.on('resize', this.handleResize, this);

      if (global.onPhaserSceneReady) {
        global.onPhaserSceneReady(this);
      }
    }

    update(_time, delta) {
      const w = this.scale.width;
      const h = this.scale.height;
      const dt = delta / 1000;
      for (const shape of this.bgShapes) {
        shape.obj.y -= shape.speed * dt;
        shape.obj.rotation += shape.rotSpeed * dt;
        if (shape.obj.y < -60) {
          shape.obj.y = h + 60;
          shape.obj.x = Phaser.Math.Between(40, Math.max(80, w - 40));
        }
      }
    }

    /**
     * Pure procedural particle textures (zero external image assets).
     */
    createProceduralTextures() {
      if (!this.textures.exists('particle-square')) {
        const g = this.make.graphics({ x: 0, y: 0, add: false });
        g.fillStyle(0xffffff, 1);
        g.fillRoundedRect(0, 0, 14, 14, 3);
        g.generateTexture('particle-square', 14, 14);
        g.destroy();
      }

      if (!this.textures.exists('particle-spark')) {
        const g = this.make.graphics({ x: 0, y: 0, add: false });
        g.fillStyle(0xffffff, 1);
        g.fillPoints(
          [
            { x: 7, y: 0 },
            { x: 14, y: 7 },
            { x: 7, y: 14 },
            { x: 0, y: 7 },
          ],
          true
        );
        g.generateTexture('particle-spark', 14, 14);
        g.destroy();
      }
    }

    /**
     * Vibrant arcade background using Phaser Graphics only.
     */
    createBackground() {
      this.bgGraphics = this.add.graphics().setDepth(0);
      this.drawBackgroundGrid();

      // Floating subtle Sundanese emerald/gold tiles in background
      const bgPalette = [0x22c55e, 0x4ade80, 0x10b981, 0xfacc15, 0x16a34a];
      this.bgShapes = [];
      for (let i = 0; i < 18; i++) {
        const size = Phaser.Math.Between(18, 44);
        const color = bgPalette[i % bgPalette.length];
        const rect = this.add
          .rectangle(
            Phaser.Math.Between(40, Math.max(80, this.scale.width - 40)),
            Phaser.Math.Between(0, this.scale.height),
            size,
            size,
            color,
            0.09
          )
          .setStrokeStyle(1.5, color, 0.22)
          .setDepth(1);
        this.bgShapes.push({
          obj: rect,
          speed: Phaser.Math.FloatBetween(12, 34),
          rotSpeed: Phaser.Math.FloatBetween(-0.35, 0.35),
        });
      }
    }

    drawBackgroundGrid() {
      const w = this.scale.width;
      const h = this.scale.height;
      const g = this.bgGraphics;
      g.clear();

      // Sundanese flag deep emerald-green gradient backdrop
      g.fillGradientStyle(0x0f5132, 0x146c43, 0x062415, 0x0a3622, 1);
      g.fillRect(0, 0, w, h);

      // Subtle emerald arcade grid
      g.lineStyle(1, 0x4ade80, 0.09);
      const step = 48;
      for (let x = 0; x < w; x += step) {
        g.lineBetween(x, 0, x, h);
      }
      for (let y = 0; y < h; y += step) {
        g.lineBetween(0, y, w, y);
      }

      // Centre spotlight column for the Sundanese brick tower
      const colW = Math.min(900, w - 80);
      g.fillStyle(0x052e16, 0.36);
      g.fillRoundedRect((w - colW) / 2, 92, colW, Math.max(220, h - 272), 24);
      g.lineStyle(1.5, 0x4ade80, 0.28);
      g.strokeRoundedRect((w - colW) / 2, 92, colW, Math.max(220, h - 272), 24);
    }

    /**
     * Active target rail + pulsing arrows framing the bottom active row.
     */
    createPlayfieldRails() {
      this.railGraphics = this.add.graphics().setDepth(4);

      this.leftPointer = this.add
        .text(0, 0, '▶', {
          fontFamily: FONT_UI,
          fontSize: '26px',
          color: '#ffca3a',
          stroke: '#1e1b4b',
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setDepth(12);

      this.rightPointer = this.add
        .text(0, 0, '◀', {
          fontFamily: FONT_UI,
          fontSize: '26px',
          color: '#ffca3a',
          stroke: '#1e1b4b',
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setDepth(12);

      this.tweens.add({
        targets: [this.leftPointer, this.rightPointer],
        scale: 1.18,
        duration: 460,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });

      this.stackLayer = this.add.container(0, 0).setDepth(10);
    }

    /**
     * Build the 4-corner colorful HUD directly in Phaser:
     * - Top-Left: Time remaining + word progress
     * - Top-Right: Score (+10 per word) + streak / mistakes
     * - Bottom-Left: Active word full Aksara Sunda preview + category tags
     * - Bottom-Right: Alphabet transliteration + syllable guide
     */
    createHUD() {
      this.hudContainer = this.add.container(0, 0).setDepth(20);

      // --- TOP LEFT: TIME ---
      this.timePanelBg = this.add.graphics();
      this.timeTitleText = this.add.text(0, 0, 'TIME', {
        fontFamily: FONT_UI,
        fontSize: '12px',
        fontStyle: 'bold',
        color: '#7dd3fc',
        letterSpacing: 2,
      });
      this.timeValueText = this.add.text(0, 0, '02:00', {
        fontFamily: FONT_MONO,
        fontSize: '34px',
        fontStyle: 'bold',
        color: '#ffffff',
      });
      this.progressText = this.add.text(0, 0, 'Words: 0 / 0', {
        fontFamily: FONT_UI,
        fontSize: '13px',
        fontStyle: '600',
        color: '#bae6fd',
      });

      // --- TOP RIGHT: SCORE ---
      this.scorePanelBg = this.add.graphics();
      this.scoreTitleText = this.add
        .text(0, 0, 'SCORE', {
          fontFamily: FONT_UI,
          fontSize: '12px',
          fontStyle: 'bold',
          color: '#fde047',
          letterSpacing: 2,
        })
        .setOrigin(1, 0);
      this.scoreValueText = this.add
        .text(0, 0, '0', {
          fontFamily: FONT_MONO,
          fontSize: '34px',
          fontStyle: 'bold',
          color: '#ffca3a',
        })
        .setOrigin(1, 0);
      this.streakText = this.add
        .text(0, 0, 'Streak: 0', {
          fontFamily: FONT_UI,
          fontSize: '13px',
          fontStyle: '600',
          color: '#fed7aa',
        })
        .setOrigin(1, 0);

      // --- BOTTOM LEFT: ACTIVE WORD AKSARA PREVIEW ---
      this.aksaraPanelBg = this.add.graphics();
      this.aksaraHeaderText = this.add.text(0, 0, 'AKSARA SUNDA', {
        fontFamily: FONT_UI,
        fontSize: '12px',
        fontStyle: 'bold',
        color: '#f9a8d4',
        letterSpacing: 2,
      });
      this.countBadgeBg = this.add.graphics();
      this.countBadgeText = this.add
        .text(0, 0, '3', {
          fontFamily: FONT_MONO,
          fontSize: '11px',
          fontStyle: 'bold',
          color: '#ffffff',
        })
        .setOrigin(0.5);
      this.aksaraValueText = this.add.text(0, 0, '', {
        fontFamily: FONT_SUNDA,
        fontSize: '28px',
        fontStyle: 'bold',
        color: '#ffffff',
        padding: { left: 2, right: 2, top: 8, bottom: 8 },
      });
      this.aksaraSyllablesText = this.add.text(0, 0, '', {
        fontFamily: FONT_MONO,
        fontSize: '12px',
        fontStyle: '600',
        color: '#38bdf8',
      });
      this.aksaraTagsText = this.add.text(0, 0, '', {
        fontFamily: FONT_UI,
        fontSize: '11px',
        fontStyle: '600',
        color: '#c4b5fd',
      });

      // --- BOTTOM RIGHT: SUNDANESE ALPHABET + INDONESIAN & ENGLISH MEANINGS ---
      this.meaningPanelBg = this.add.graphics();
      this.meaningHeaderText = this.add.text(0, 0, 'WORD & MEANING', {
        fontFamily: FONT_UI,
        fontSize: '12px',
        fontStyle: 'bold',
        color: '#6ee7b7',
        letterSpacing: 2,
      });
      this.sundaWordText = this.add.text(0, 0, '', {
        fontFamily: FONT_UI,
        fontSize: '22px',
        fontStyle: 'bold',
        color: '#fde047',
      });
      this.idMeaningText = this.add.text(0, 0, '', {
        fontFamily: FONT_UI,
        fontSize: '13px',
        fontStyle: '600',
        color: '#a7f3d0',
        lineSpacing: 2,
        wordWrap: { width: 290, useAdvancedWrap: true },
      });
      this.enMeaningText = this.add.text(0, 0, '', {
        fontFamily: FONT_UI,
        fontSize: '13px',
        fontStyle: '600',
        color: '#bae6fd',
        lineSpacing: 2,
        wordWrap: { width: 290, useAdvancedWrap: true },
      });

      this.hudContainer.add([
        this.timePanelBg,
        this.timeTitleText,
        this.timeValueText,
        this.progressText,
        this.scorePanelBg,
        this.scoreTitleText,
        this.scoreValueText,
        this.streakText,
        this.aksaraPanelBg,
        this.aksaraHeaderText,
        this.countBadgeBg,
        this.countBadgeText,
        this.aksaraValueText,
        this.aksaraSyllablesText,
        this.aksaraTagsText,
        this.meaningPanelBg,
        this.meaningHeaderText,
        this.sundaWordText,
        this.idMeaningText,
        this.enMeaningText,
      ]);

      this.layoutHUD();
    }

    setHUDVisible(visible) {
      this.hudContainer.setVisible(visible);
      this.railGraphics.setVisible(visible);
      this.leftPointer.setVisible(visible);
      this.rightPointer.setVisible(visible);
    }

    /**
     * Responsive desktop layout metrics for 4-corner HUD and centre brick stack.
     */
    getLayoutMetrics() {
      const w = this.scale.width;
      const h = this.scale.height;

      const margin = 22;
      const topCardW = 215;
      const topCardH = 88;
      // Reserve central space for Keyman Sunda SNI IME dock at the bottom
      const sideCardW = Phaser.Math.Clamp(Math.floor((w - 530) / 2), 255, 400);
      const sideCardH = 148;

      const playTop = 108;
      const playBottom = h - 182;
      const playHeight = Math.max(250, playBottom - playTop);
      const rowPitch = Phaser.Math.Clamp(Math.floor((playHeight - 24) / VISIBLE_ROWS), 56, 82);
      const baseBrickHeight = Phaser.Math.Clamp(rowPitch - 12, 46, 68);
      const baseY = playBottom - Math.round(baseBrickHeight / 2) - 10;

      return {
        w,
        h,
        margin,
        topCardW,
        topCardH,
        sideCardW,
        sideCardH,
        centerX: Math.round(w / 2),
        baseY,
        rowPitch,
        baseBrickHeight,
        maxRowWidth: Math.min(860, w - 110),
      };
    }

    layoutHUD() {
      const m = this.getLayoutMetrics();

      // Top-Left: TIME
      this.drawHudCard(this.timePanelBg, m.margin, m.margin, m.topCardW, m.topCardH, 0x38bdf8);
      this.timeTitleText.setPosition(m.margin + 16, m.margin + 10);
      this.timeValueText.setPosition(m.margin + 16, m.margin + 26);
      this.progressText.setPosition(m.margin + 16, m.margin + 65);

      // Top-Right: SCORE
      const scoreX = m.w - m.margin - m.topCardW;
      this.drawHudCard(this.scorePanelBg, scoreX, m.margin, m.topCardW, m.topCardH, 0xffca3a);
      this.scoreTitleText.setPosition(m.w - m.margin - 16, m.margin + 10);
      this.scoreValueText.setPosition(m.w - m.margin - 16, m.margin + 26);
      this.streakText.setPosition(m.w - m.margin - 16, m.margin + 65);

      // Bottom-Left: AKSARA SUNDA PREVIEW
      const bottomY = m.h - m.margin - m.sideCardH;
      this.drawHudCard(this.aksaraPanelBg, m.margin, bottomY, m.sideCardW, m.sideCardH, 0xf72585);
      this.aksaraHeaderText.setPosition(m.margin + 16, bottomY + 12);
      this.aksaraValueText.setPosition(m.margin + 16, bottomY + 34);
      this.aksaraSyllablesText.setPosition(m.margin + 16, bottomY + 96);
      this.aksaraTagsText.setPosition(m.margin + 16, bottomY + 118);
      this.drawCountBadge(m.margin + m.sideCardW - 44, bottomY + 20);

      // Bottom-Right: SUNDANESE ALPHABET + INDONESIAN & ENGLISH MEANINGS
      const rightX = m.w - m.margin - m.sideCardW;
      this.drawHudCard(this.meaningPanelBg, rightX, bottomY, m.sideCardW, m.sideCardH, 0x2ec4b6);
      this.meaningHeaderText.setPosition(rightX + 16, bottomY + 12);
      this.sundaWordText.setPosition(rightX + 16, bottomY + 30);
      this.idMeaningText.setWordWrapWidth(m.sideCardW - 32, true);
      this.enMeaningText.setWordWrapWidth(m.sideCardW - 32, true);
      this.positionMeaningLines(rightX + 16, bottomY);

      this.updateActiveRailPosition();
    }

    positionMeaningLines(x, bottomY) {
      const idY = bottomY + 62;
      this.idMeaningText.setPosition(x, idY);
      const idHeight = Math.max(20, this.idMeaningText.height);
      const enY = Math.min(bottomY + 108, idY + idHeight + 6);
      this.enMeaningText.setPosition(x, enY);
    }

    drawHudCard(g, x, y, width, height, borderColor) {
      g.clear();
      g.fillStyle(0x072b1a, 0.92);
      g.fillRoundedRect(x, y, width, height, 14);
      g.lineStyle(2, borderColor, 0.85);
      g.strokeRoundedRect(x, y, width, height, 14);
      // Top accent highlight bar
      g.fillStyle(borderColor, 0.25);
      g.fillRoundedRect(x + 2, y + 2, width - 4, 4, 2);
    }

    drawCountBadge(cx, cy) {
      const active = this.rowItems[0];
      const count = active ? active.vocab.syllables.length : 0;
      const label = count === 1 ? '1 char' : `${count} chars`;

      this.countBadgeBg.clear();
      this.countBadgeBg.fillStyle(0x8b5cf6, 1);
      this.countBadgeBg.fillRoundedRect(cx - 30, cy - 11, 60, 22, 8);
      this.countBadgeText.setText(label).setPosition(cx, cy);
    }

    updateActiveRailPosition() {
      const m = this.getLayoutMetrics();
      const active = this.rowItems[0];
      const activeWidth = active ? active.rowWidth : 280;
      const railHalfW = Math.min(m.maxRowWidth / 2, activeWidth / 2 + 26);

      this.railGraphics.clear();
      if (this.isPlaying && active) {
        const railY = m.baseY + Math.round(active.brickHeight / 2) + 8;
        this.railGraphics.fillStyle(0xffca3a, 0.22);
        this.railGraphics.fillRoundedRect(m.centerX - railHalfW, railY - 2, railHalfW * 2, 10, 5);
        this.railGraphics.fillStyle(0xffca3a, 0.95);
        this.railGraphics.fillRoundedRect(m.centerX - railHalfW + 6, railY, railHalfW * 2 - 12, 4, 2);

        this.leftPointer.setPosition(m.centerX - railHalfW - 22, m.baseY).setVisible(true);
        this.rightPointer.setPosition(m.centerX + railHalfW + 22, m.baseY).setVisible(true);
      } else {
        this.leftPointer.setVisible(false);
        this.rightPointer.setVisible(false);
      }
    }

    handleResize() {
      this.drawBackgroundGrid();
      this.layoutHUD();
      this.relayoutStackImmediate();
    }

    playSfx(key, volume) {
      const pool = this.sfxPools[key];
      if (!pool) return;
      pool.play(volume);
    }

    /**
     * Start a new typing session with the generated Sundanese word list and user config.
     */
    startSession(words, config, callbacks) {
      this.cleanupSession();

      this.config = config;
      this.callbacks = callbacks || {};
      this.wordQueue = words.slice();
      this.totalWords = this.wordQueue.length;
      this.nextWordIdx = 0;

      this.score = 0;
      this.wordsCleared = 0;
      this.mistakes = 0;
      this.streak = 0;
      this.colorCursor = 0;

      this.durationMs = config.minutes * 60 * 1000;
      this.remainingMs = this.durationMs;
      this.lastDisplayedSec = -1;
      this.sessionStartMs = performance.now();
      this.isPlaying = true;

      if (this.sound.context && this.sound.context.state === 'suspended') {
        this.sound.context.resume().catch(() => {});
      }

      this.setHUDVisible(true);
      this.layoutHUD();

      const initialCount = Math.min(VISIBLE_ROWS, this.wordQueue.length);
      for (let slot = 0; slot < initialCount; slot++) {
        const vocab = this.wordQueue[this.nextWordIdx++];
        const row = this.createWordRow(vocab, slot);
        this.rowItems.push(row);

        const targetY = row.container.y;
        row.container.y = targetY - 90 - slot * 20;
        row.container.alpha = 0;
        this.tweens.add({
          targets: row.container,
          y: targetY,
          alpha: this.getSlotAlpha(slot),
          duration: 320 + slot * 45,
          ease: 'Back.easeOut',
        });
      }

      this.updateHUDValues();
      this.updateActiveWordDisplay();
      this.updateTimerDisplay(true);

      this.timerEvent = this.time.addEvent({
        delay: 100,
        loop: true,
        callback: () => this.tickTimer(),
      });
    }

    cleanupSession() {
      this.isPlaying = false;

      if (this.timerEvent) {
        this.timerEvent.remove(false);
        this.timerEvent = null;
      }
      if (this.errorResetTimer) {
        this.errorResetTimer.remove(false);
        this.errorResetTimer = null;
      }

      for (const row of this.rowItems) {
        if (row.container && row.container.active) {
          row.container.destroy();
        }
      }
      this.rowItems = [];
      this.stackLayer.removeAll(true);
    }

    getSlotAlpha(slot) {
      if (slot === 0) return 1;
      return Math.max(0.56, 0.92 - slot * 0.08);
    }

    getSlotScale(slot) {
      return slot === 0 ? 1.0 : 0.9;
    }

    /**
     * Build a horizontal row of colorful 3D Sundanese character blocks.
     * Each block holds one valid Sundanese syllable cluster (base + attached rarangkén).
     */
    createWordRow(vocab, slot) {
      const m = this.getLayoutMetrics();
      const blocks = vocab.syllables;
      const gap = blocks.length >= 8 ? 6 : 8;

      const idealBrickW = Math.round(m.baseBrickHeight * 1.12);
      const maxBrickFromWidth = Math.floor(
        (m.maxRowWidth - gap * (blocks.length - 1)) / Math.max(1, blocks.length)
      );
      const brickW = Phaser.Math.Clamp(Math.min(idealBrickW, maxBrickFromWidth), 46, idealBrickW);
      const brickH = Phaser.Math.Clamp(Math.min(m.baseBrickHeight, Math.round(brickW * 0.96)), 46, m.baseBrickHeight);
      const totalWidth = blocks.length * brickW + (blocks.length - 1) * gap;

      const rowY = m.baseY - slot * m.rowPitch;
      const container = this.add.container(m.centerX, rowY);
      container.setScale(this.getSlotScale(slot));
      container.setAlpha(this.getSlotAlpha(slot));

      const bricks = [];
      const startX = -totalWidth / 2 + brickW / 2;
      const rowColorOffset = this.colorCursor;
      this.colorCursor = (this.colorCursor + 2) % BLOCK_PALETTE.length;

      blocks.forEach((syl, idx) => {
        const bx = startX + idx * (brickW + gap);
        const colorHex = BLOCK_PALETTE[(rowColorOffset + idx) % BLOCK_PALETTE.length];

        const brickContainer = this.add.container(bx, 0);
        const bg = this.add.graphics();
        this.paintBrick(bg, brickW, brickH, colorHex, false, slot === 0);

        const baseFontSize = Math.round(brickH * 0.44);
        const isLightTile = colorHex === 0xffca3a || colorHex === 0x84cc16;
        const label = this.add
          .text(0, -1, syl.text, {
            fontFamily: FONT_SUNDA,
            fontSize: `${baseFontSize}px`,
            fontStyle: 'bold',
            color: isLightTile ? '#1e1b4b' : '#ffffff',
            stroke: isLightTile ? '#fef9c3' : '#0f172a',
            strokeThickness: isLightTile ? 1 : 3,
            padding: { left: 6, right: 6, top: 10, bottom: 10 },
          })
          .setOrigin(0.5);

        // Auto-fit wide/tall rarangkén glyphs cleanly within the brick bounds
        const maxInnerW = brickW - 10;
        const maxInnerH = brickH - 8;
        const rawW = Math.max(1, label.width - 12);
        const rawH = Math.max(1, label.height - 20);
        const fitScale = Math.min(1, maxInnerW / rawW, maxInnerH / rawH);
        if (fitScale < 1) {
          label.setScale(fitScale);
        }

        brickContainer.add([bg, label]);
        container.add(brickContainer);

        bricks.push({
          container: brickContainer,
          bg,
          label,
          text: syl.text,
          baseColor: colorHex,
          isLightTile,
          width: brickW,
          height: brickH,
          localX: bx,
        });
      });

      this.stackLayer.add(container);

      return {
        vocab,
        container,
        bricks,
        brickWidth: brickW,
        brickHeight: brickH,
        rowWidth: totalWidth,
        isErrorHighlighted: false,
      };
    }

    /**
     * Draw a single glossy 3D Sundanese character brick with Phaser Graphics.
     */
    paintBrick(g, width, height, fillHex, isError, isActive) {
      g.clear();
      const halfW = width / 2;
      const halfH = height / 2;
      const radius = Math.max(8, Math.round(Math.min(width, height) * 0.16));

      const mainColor = isError ? 0xdc2626 : fillHex;
      const colorObj = Phaser.Display.Color.IntegerToColor(mainColor);
      const darkBevel = Phaser.Display.Color.GetColor(
        Math.max(0, colorObj.red - 55),
        Math.max(0, colorObj.green - 55),
        Math.max(0, colorObj.blue - 55)
      );

      // Drop shadow
      g.fillStyle(0x050312, 0.45);
      g.fillRoundedRect(-halfW + 2, -halfH + 5, width, height, radius);

      // Outer crimson glow on error
      if (isError) {
        g.fillStyle(0xef4444, 0.35);
        g.fillRoundedRect(-halfW - 5, -halfH - 5, width + 10, height + 10, radius + 4);
      }

      // Main brick body
      g.fillStyle(mainColor, 1);
      g.fillRoundedRect(-halfW, -halfH, width, height, radius);

      // Bottom 3D bevel lip
      g.fillStyle(darkBevel, 0.9);
      g.fillRoundedRect(-halfW + 1, halfH - 8, width - 2, 8, {
        tl: 0,
        tr: 0,
        bl: radius,
        br: radius,
      });

      // Top glossy highlight strip
      g.fillStyle(0xffffff, isError ? 0.25 : 0.3);
      g.fillRoundedRect(
        -halfW + 5,
        -halfH + 4,
        width - 10,
        Math.max(6, Math.round(height * 0.16)),
        4
      );

      // Crisp border
      if (isError) {
        g.lineStyle(3, 0xfca5a5, 1);
      } else if (isActive) {
        g.lineStyle(2.5, 0xffffff, 0.92);
      } else {
        g.lineStyle(1.5, 0xffffff, 0.35);
      }
      g.strokeRoundedRect(-halfW, -halfH, width, height, radius);
    }

    relayoutStackImmediate() {
      const m = this.getLayoutMetrics();
      this.rowItems.forEach((row, slot) => {
        row.container.setPosition(m.centerX, m.baseY - slot * m.rowPitch);
        row.container.setScale(this.getSlotScale(slot));
        row.container.setAlpha(this.getSlotAlpha(slot));
      });
      this.updateActiveRailPosition();
    }

    /**
     * Evaluate submitted Keyman Sunda SNI input against the active bottom row.
     * @param {string} rawInput
     * @returns {'correct' | 'incorrect' | 'ignored'}
     */
    submitAnswer(rawInput) {
      if (!this.isPlaying || this.rowItems.length === 0) return 'ignored';

      const normalise = global.SundaVocabLoader.normalizeSundaneseInput;
      const typed = normalise(rawInput);
      if (!typed) return 'ignored';

      const activeRow = this.rowItems[0];
      const expected = normalise(activeRow.vocab.word);

      if (typed === expected) {
        this.handleCorrectWord(activeRow);
        return 'correct';
      }

      this.handleIncorrectWord(activeRow);
      return 'incorrect';
    }

    /**
     * Success: play confirmation SFX, explode blocks with colorful particles, award +10, drop stack down.
     */
    handleCorrectWord(activeRow) {
      if (this.errorResetTimer) {
        this.errorResetTimer.remove(false);
        this.errorResetTimer = null;
      }

      this.playSfx('sfx-success', 0.75);

      this.score += 10;
      this.wordsCleared += 1;
      this.streak += 1;

      const rowWorldX = activeRow.container.x;
      const rowWorldY = activeRow.container.y;

      activeRow.bricks.forEach((brick, idx) => {
        const wx = rowWorldX + brick.localX;
        const wy = rowWorldY;

        const burst = this.add.particles(wx, wy, 'particle-square', {
          speed: { min: 110, max: 340 },
          angle: { min: 0, max: 360 },
          scale: { start: 1.05, end: 0 },
          alpha: { start: 1, end: 0 },
          lifespan: { min: 400, max: 760 },
          gravityY: 440,
          rotate: { min: -240, max: 240 },
          tint: brick.baseColor,
          emitting: false,
        });
        burst.setDepth(18);
        burst.explode(14);
        this.time.delayedCall(820, () => burst.destroy());

        const sparks = this.add.particles(wx, wy, 'particle-spark', {
          speed: { min: 160, max: 380 },
          angle: { min: 0, max: 360 },
          scale: { start: 0.85, end: 0 },
          alpha: { start: 1, end: 0 },
          lifespan: { min: 280, max: 520 },
          tint: 0xffca3a,
          emitting: false,
        });
        sparks.setDepth(19);
        sparks.explode(6);
        this.time.delayedCall(580, () => sparks.destroy());

        activeRow.container.remove(brick.container, false);
        this.add.existing(brick.container);
        brick.container.setPosition(wx, wy);
        brick.container.setDepth(16);

        const spread = idx - (activeRow.bricks.length - 1) / 2;
        const targetX = wx + spread * Phaser.Math.Between(55, 95) + Phaser.Math.Between(-35, 35);
        const targetY = wy - Phaser.Math.Between(70, 150);

        this.tweens.add({
          targets: brick.container,
          x: targetX,
          y: targetY,
          angle: Phaser.Math.Between(-150, 150),
          scale: 0.15,
          alpha: 0,
          duration: 460,
          ease: 'Cubic.easeOut',
          onComplete: () => brick.container.destroy(),
        });
      });

      activeRow.container.destroy();

      // Floating "+10" score burst
      const plusTen = this.add
        .text(rowWorldX, rowWorldY - 12, '+10', {
          fontFamily: FONT_MONO,
          fontSize: '34px',
          fontStyle: 'bold',
          color: '#fde047',
          stroke: '#1e1b4b',
          strokeThickness: 6,
        })
        .setOrigin(0.5)
        .setDepth(25);

      this.tweens.add({
        targets: plusTen,
        y: rowWorldY - 96,
        scale: 1.3,
        alpha: 0,
        duration: 680,
        ease: 'Cubic.easeOut',
        onComplete: () => plusTen.destroy(),
      });

      this.cameras.main.shake(95, 0.0032);

      // Advance stack
      this.rowItems.shift();

      if (this.nextWordIdx < this.wordQueue.length) {
        const nextVocab = this.wordQueue[this.nextWordIdx++];
        const topSlot = this.rowItems.length;
        const newRow = this.createWordRow(nextVocab, topSlot);
        const m = this.getLayoutMetrics();
        newRow.container.y = m.baseY - (topSlot + 1) * m.rowPitch - 30;
        newRow.container.alpha = 0;
        this.rowItems.push(newRow);
      }

      const m = this.getLayoutMetrics();
      this.rowItems.forEach((row, slot) => {
        const isNowActive = slot === 0;
        if (isNowActive) {
          row.bricks.forEach((b) =>
            this.paintBrick(b.bg, b.width, b.height, b.baseColor, false, true)
          );
        }

        this.tweens.add({
          targets: row.container,
          y: m.baseY - slot * m.rowPitch,
          scale: this.getSlotScale(slot),
          alpha: this.getSlotAlpha(slot),
          duration: 320,
          ease: 'Bounce.easeOut',
        });
      });

      this.updateHUDValues();
      this.tweens.add({
        targets: this.scoreValueText,
        scale: 1.28,
        duration: 110,
        yoyo: true,
        ease: 'Quad.easeOut',
      });

      if (this.rowItems.length === 0) {
        this.updateActiveWordDisplay();
        this.time.delayedCall(420, () => {
          if (this.isPlaying) {
            this.endSession('completed');
          }
        });
        return;
      }

      this.updateActiveWordDisplay();
    }

    /**
     * Failure: play error SFX, flash blocks red, shake horizontally, allow retry.
     */
    handleIncorrectWord(activeRow) {
      this.playSfx('sfx-fail', 0.78);

      this.mistakes += 1;
      this.streak = 0;
      this.updateHUDValues();

      activeRow.isErrorHighlighted = true;
      activeRow.bricks.forEach((brick) => {
        this.paintBrick(brick.bg, brick.width, brick.height, brick.baseColor, true, true);
        brick.label.setColor('#ffffff');
        brick.label.setStroke('#7f1d1d', 3);
      });

      const m = this.getLayoutMetrics();
      this.tweens.killTweensOf(activeRow.container);
      activeRow.container.x = m.centerX;
      this.tweens.add({
        targets: activeRow.container,
        x: m.centerX + 14,
        duration: 45,
        yoyo: true,
        repeat: 4,
        ease: 'Sine.easeInOut',
        onComplete: () => {
          if (activeRow.container && activeRow.container.active) {
            activeRow.container.x = m.centerX;
          }
        },
      });

      const errLabel = this.add
        .text(m.centerX, m.baseY - activeRow.brickHeight / 2 - 22, '✗ Incorrect', {
          fontFamily: FONT_UI,
          fontSize: '18px',
          fontStyle: 'bold',
          color: '#fca5a5',
          stroke: '#450a0a',
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setDepth(25);

      this.tweens.add({
        targets: errLabel,
        y: errLabel.y - 26,
        alpha: 0,
        duration: 700,
        ease: 'Cubic.easeOut',
        onComplete: () => errLabel.destroy(),
      });

      if (this.errorResetTimer) {
        this.errorResetTimer.remove(false);
      }
      this.errorResetTimer = this.time.delayedCall(850, () => {
        if (!activeRow.container || !activeRow.container.active) return;
        activeRow.isErrorHighlighted = false;
        activeRow.bricks.forEach((brick) => {
          this.paintBrick(brick.bg, brick.width, brick.height, brick.baseColor, false, true);
          brick.label.setColor(brick.isLightTile ? '#1e1b4b' : '#ffffff');
          brick.label.setStroke(
            brick.isLightTile ? '#fef9c3' : '#0f172a',
            brick.isLightTile ? 1 : 3
          );
        });
      });
    }

    updateHUDValues() {
      this.scoreValueText.setText(String(this.score));
      this.progressText.setText(`Words: ${this.wordsCleared} / ${this.totalWords}`);
      this.streakText.setText(
        this.streak > 1 ? `Streak: x${this.streak}` : `Mistakes: ${this.mistakes}`
      );
    }

    /**
     * Refresh bottom-left Aksara Sunda preview and bottom-right Alphabet + Indonesian/English meanings.
     */
    updateActiveWordDisplay() {
      const active = this.rowItems[0];
      const m = this.getLayoutMetrics();

      if (!active) {
        this.aksaraValueText.setText('');
        this.aksaraSyllablesText.setText('');
        this.aksaraTagsText.setText('');
        this.sundaWordText.setText('');
        this.idMeaningText.setText('');
        this.enMeaningText.setText('');
        this.updateActiveRailPosition();
        return;
      }

      const { word, syllables, sunda, syllableBreakdown, indonesia, english, tags } = active.vocab;
      const maxCardInnerW = m.sideCardW - 32;

      // Bottom-left continuous Aksara Sunda word + syllable breakdown
      const blockCount = syllables.length;
      const aksaraFontSize = blockCount > 7 ? 20 : blockCount > 4 ? 24 : 28;
      this.aksaraValueText.setFontSize(`${aksaraFontSize}px`).setText(word);
      this.aksaraValueText.setScale(1);
      if (this.aksaraValueText.width > maxCardInnerW) {
        this.aksaraValueText.setScale(maxCardInnerW / this.aksaraValueText.width);
      }

      this.aksaraSyllablesText.setText(syllableBreakdown);
      this.aksaraSyllablesText.setScale(1);
      if (this.aksaraSyllablesText.width > maxCardInnerW) {
        this.aksaraSyllablesText.setScale(maxCardInnerW / this.aksaraSyllablesText.width);
      }
      this.aksaraTagsText.setText(tags.join(' · '));

      // Bottom-right Sundanese alphabet word + Indonesian & English meanings
      const wordFontSize = sunda.length > 18 ? 17 : sunda.length > 13 ? 19 : 22;
      this.sundaWordText.setFontSize(`${wordFontSize}px`).setText(sunda);
      this.sundaWordText.setScale(1);
      if (this.sundaWordText.width > maxCardInnerW) {
        this.sundaWordText.setScale(maxCardInnerW / this.sundaWordText.width);
      }

      const clip = (txt, maxLen) => (txt && txt.length > maxLen ? `${txt.slice(0, maxLen - 1)}…` : txt || '—');
      this.idMeaningText.setText(`ID: ${clip(indonesia, 68)}`);
      this.enMeaningText.setText(`EN: ${clip(english, 68)}`);

      const bottomY = m.h - m.margin - m.sideCardH;
      const rightX = m.w - m.margin - m.sideCardW;
      this.positionMeaningLines(rightX + 16, bottomY);
      this.drawCountBadge(m.margin + m.sideCardW - 44, bottomY + 20);
      this.updateActiveRailPosition();
    }

    tickTimer() {
      if (!this.isPlaying) return;

      const elapsed = performance.now() - this.sessionStartMs;
      this.remainingMs = Math.max(0, this.durationMs - elapsed);
      this.updateTimerDisplay(false);

      if (this.remainingMs <= 0) {
        this.endSession('timeout');
      }
    }

    updateTimerDisplay(force) {
      const totalSec = Math.ceil(this.remainingMs / 1000);
      if (!force && totalSec === this.lastDisplayedSec) return;
      this.lastDisplayedSec = totalSec;

      const mins = Math.floor(totalSec / 60);
      const secs = totalSec % 60;
      const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      this.timeValueText.setText(formatted);

      if (totalSec <= 15) {
        this.timeValueText.setColor('#f87171');
        this.tweens.add({
          targets: this.timeValueText,
          scale: 1.12,
          duration: 130,
          yoyo: true,
        });
      } else if (totalSec <= 30) {
        this.timeValueText.setColor('#fbbf24');
      } else {
        this.timeValueText.setColor('#ffffff');
      }
    }

    /**
     * Stop gameplay and report Score, WPM, Accuracy, and Elapsed Time.
     * @param {'timeout' | 'completed' | 'quit'} reason
     */
    endSession(reason) {
      if (!this.isPlaying) return;
      this.isPlaying = false;

      if (this.timerEvent) {
        this.timerEvent.remove(false);
        this.timerEvent = null;
      }

      const elapsedMs =
        reason === 'timeout'
          ? this.durationMs
          : Math.max(1000, performance.now() - this.sessionStartMs);
      const elapsedSeconds = elapsedMs / 1000;
      const elapsedMinutes = Math.max(elapsedSeconds / 60, 1 / 60);

      const wpm = this.wordsCleared / elapsedMinutes;
      const totalAttempts = this.wordsCleared + this.mistakes;
      const accuracy = totalAttempts > 0 ? Math.round((this.wordsCleared / totalAttempts) * 100) : 0;

      this.updateActiveRailPosition();

      if (this.callbacks && typeof this.callbacks.onGameOver === 'function') {
        this.callbacks.onGameOver({
          reason,
          score: this.score,
          wordsCleared: this.wordsCleared,
          totalWords: this.totalWords,
          mistakes: this.mistakes,
          elapsedSeconds,
          wpm,
          accuracy,
        });
      }
    }
  }

  global.SundaGameScene = SundaGameScene;
})(window);
