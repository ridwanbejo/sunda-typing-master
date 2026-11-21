(function (global) {
  'use strict';

  const VOWEL_SWARA = {
    a: '\u1B83',  // ᮃ
    i: '\u1B84',  // ᮄ
    u: '\u1B85',  // ᮅ
    é: '\u1B86',  // ᮆ
    o: '\u1B87',  // ᮇ
    e: '\u1B88',  // ᮈ
    eu: '\u1B89', // ᮉ
  };

  const VOWEL_SIGN = {
    a: '',
    i: '\u1BA4',  // ᮤ Panghulu
    u: '\u1BA5',  // ᮥ Panyuku
    é: '\u1BA6',  // ᮦ Panéléng
    o: '\u1BA7',  // ᮧ Panolong
    e: '\u1BA8',  // ᮨ Pamepet
    eu: '\u1BA9', // ᮩ Paneuleung
  };

  const CONSONANTS = {
    ng: '\u1B8D', // ᮍ
    ny: '\u1B91', // ᮑ
    kh: '\u1BAE', // ᮮ
    sy: '\u1BAF', // ᮯ
    k: '\u1B8A',  // ᮊ
    q: '\u1B8B',  // ᮋ
    g: '\u1B8C',  // ᮌ
    c: '\u1B8E',  // ᮎ
    j: '\u1B8F',  // ᮏ
    z: '\u1B90',  // ᮐ
    t: '\u1B92',  // ᮒ
    d: '\u1B93',  // ᮓ
    n: '\u1B94',  // ᮔ
    p: '\u1B95',  // ᮕ
    f: '\u1B96',  // ᮖ
    v: '\u1B97',  // ᮗ
    b: '\u1B98',  // ᮘ
    m: '\u1B99',  // ᮙ
    y: '\u1B9A',  // ᮚ
    r: '\u1B9B',  // ᮛ
    l: '\u1B9C',  // ᮜ
    w: '\u1B9D',  // ᮝ
    s: '\u1B9E',  // ᮞ
    x: '\u1B9F',  // ᮟ
    h: '\u1BA0',  // ᮠ
  };

  const MEDIAL_SIGN = {
    y: '\u1BA1', // ᮡ Pamingkal
    r: '\u1BA2', // ᮢ Panyakra
    l: '\u1BA3', // ᮣ Panyiku
  };

  const MEDIAL_DISALLOW = {
    y: new Set(['y', 'ny', 'sy']),
    r: new Set(['r']),
    l: new Set(['l']),
  };

  const FINAL_SIGN = {
    ng: '\u1B80', // ᮀ Panyecek
    r: '\u1B81',  // ᮁ Panglayar
    h: '\u1B82',  // ᮂ Pangwisad
  };

  const PAMAAEH = '\u1BAA'; // ᮪

  const EASINESS_RANGES = {
    easy: { min: 1, max: 3, label: 'Easy (1–3 chars)' },
    medium: { min: 4, max: 6, label: 'Medium (4–6 chars)' },
    hard: { min: 7, max: 10, label: 'Hard (7–10 chars)' },
    all: { min: 1, max: 99, label: 'All Lengths' },
  };

  /**
   * RFC 4180 compliant CSV parser (handles quoted fields, escaped quotes, embedded commas, CRLF/LF).
   */
  function parseCSV(text) {
    const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < clean.length; i++) {
      const ch = clean[i];

      if (inQuotes) {
        if (ch === '"') {
          if (clean[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(field);
        field = '';
      } else if (ch === '\r') {
        if (clean[i + 1] === '\n') i++;
        row.push(field);
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
        field = '';
      } else if (ch === '\n') {
        row.push(field);
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
        field = '';
      } else {
        field += ch;
      }
    }

    if (field.length > 0 || row.length > 0) {
      row.push(field);
      rows.push(row);
    }

    return rows;
  }

  /**
   * Tokenise a clean single Sundanese Latin word into consonant/vowel units.
   * Returns null if the word contains spaces, hyphens, or non-Sundanese punctuation.
   */
  function tokeniseSundanese(rawWord) {
    const w = (rawWord || '').trim().normalize('NFC').toLowerCase();
    if (!w) return null;

    const tokens = [];
    let i = 0;
    while (i < w.length) {
      const two = w.slice(i, i + 2);
      if (two === 'eu') {
        tokens.push({ kind: 'V', val: 'eu' });
        i += 2;
      } else if (two === 'ng' || two === 'ny' || two === 'kh' || two === 'sy') {
        tokens.push({ kind: 'C', val: two });
        i += 2;
      } else if (Object.prototype.hasOwnProperty.call(VOWEL_SWARA, w[i])) {
        tokens.push({ kind: 'V', val: w[i] });
        i += 1;
      } else if (Object.prototype.hasOwnProperty.call(CONSONANTS, w[i])) {
        tokens.push({ kind: 'C', val: w[i] });
        i += 1;
      } else {
        return null;
      }
    }
    return tokens;
  }

  /**
   * Convert a Latin Sundanese word into Aksara Sunda Baku syllable clusters.
   * Returns null if conversion is not applicable (e.g., multi-word phrase or punctuation).
   */
  function latinToAksaraSunda(rawWord) {
    const tokens = tokeniseSundanese(rawWord);
    if (!tokens || tokens.length === 0) return null;

    const syllables = [];
    let hasSwara = false;
    let hasNgalagena = false;
    let hasRarangken = false;

    let i = 0;
    const n = tokens.length;

    while (i < n) {
      const tok = tokens[i];

      if (tok.kind === 'V') {
        let text = VOWEL_SWARA[tok.val];
        let latin = tok.val;
        let sylHasRarangken = false;
        hasSwara = true;
        i += 1;

        // Attach coda consonant (ng, r, h) when not followed by a vowel
        if (
          i < n &&
          tokens[i].kind === 'C' &&
          Object.prototype.hasOwnProperty.call(FINAL_SIGN, tokens[i].val) &&
          (i + 1 === n || tokens[i + 1].kind !== 'V')
        ) {
          text += FINAL_SIGN[tokens[i].val];
          latin += tokens[i].val;
          sylHasRarangken = true;
          hasRarangken = true;
          i += 1;
        }

        syllables.push({
          text,
          latin,
          type: sylHasRarangken ? 'swara+rarangken' : 'swara',
          hasRarangken: sylHasRarangken,
        });
      } else {
        const baseC = tok.val;
        let text = CONSONANTS[baseC];
        let latin = baseC;
        let sylHasRarangken = false;
        hasNgalagena = true;
        i += 1;

        // Medial consonant (y/r/l) + vowel (respecting onset disallow rules)
        if (
          i + 1 < n &&
          tokens[i].kind === 'C' &&
          Object.prototype.hasOwnProperty.call(MEDIAL_SIGN, tokens[i].val) &&
          tokens[i + 1].kind === 'V' &&
          !MEDIAL_DISALLOW[tokens[i].val].has(baseC)
        ) {
          const med = tokens[i].val;
          const vow = tokens[i + 1].val;
          text += MEDIAL_SIGN[med] + VOWEL_SIGN[vow];
          latin += med + vow;
          sylHasRarangken = true;
          hasRarangken = true;
          i += 2;

          if (
            i < n &&
            tokens[i].kind === 'C' &&
            Object.prototype.hasOwnProperty.call(FINAL_SIGN, tokens[i].val) &&
            (i + 1 === n || tokens[i + 1].kind !== 'V')
          ) {
            text += FINAL_SIGN[tokens[i].val];
            latin += tokens[i].val;
            i += 1;
          }
        } else if (i < n && tokens[i].kind === 'V') {
          const vow = tokens[i].val;
          const vSign = VOWEL_SIGN[vow];
          text += vSign;
          latin += vow;
          if (vSign) {
            sylHasRarangken = true;
            hasRarangken = true;
          }
          i += 1;

          if (
            i < n &&
            tokens[i].kind === 'C' &&
            Object.prototype.hasOwnProperty.call(FINAL_SIGN, tokens[i].val) &&
            (i + 1 === n || tokens[i + 1].kind !== 'V')
          ) {
            text += FINAL_SIGN[tokens[i].val];
            latin += tokens[i].val;
            sylHasRarangken = true;
            hasRarangken = true;
            i += 1;
          }
        } else {
          // Bare consonant without vowel -> Pamaéh
          text += PAMAAEH;
          sylHasRarangken = true;
          hasRarangken = true;
        }

        syllables.push({
          text,
          latin,
          type: sylHasRarangken ? 'rarangken' : 'ngalagena',
          hasRarangken: sylHasRarangken,
        });
      }
    }

    const tags = [];
    if (hasSwara) tags.push('Swara');
    if (hasNgalagena) tags.push('Ngalagena');
    if (hasRarangken) tags.push('Rarangkén');

    return {
      word: syllables.map((s) => s.text).join(''),
      syllables,
      syllableBreakdown: syllables.map((s) => s.latin).join(' · '),
      hasSwara,
      hasNgalagena,
      hasRarangken,
      tags,
    };
  }

  /**
   * Load and parse the Sundanese-Indonesian-English CSV dictionary.
   * @param {string} csvPath
   * @returns {Promise<{items: Array<object>, totalRows: number, skippedRows: number}>}
   */
  async function loadDataset(csvPath) {
    const resp = await fetch(csvPath);
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }
    const text = await resp.text();
    const rows = parseCSV(text);
    if (rows.length < 2) {
      throw new Error('CSV dataset is empty');
    }

    const header = rows[0].map((h) => h.trim().toLowerCase());
    const idxSu = header.indexOf('sunda');
    const idxId = header.indexOf('indonesia');
    const idxEn = header.indexOf('english');
    if (idxSu === -1 || idxId === -1 || idxEn === -1) {
      throw new Error('Expected columns: sunda, indonesia, english');
    }

    const items = [];
    let skippedRows = 0;

    for (let r = 1; r < rows.length; r++) {
      const cols = rows[r];
      const sunda = (cols[idxSu] || '').trim();
      const indonesia = (cols[idxId] || '').trim();
      const english = (cols[idxEn] || '').trim();
      if (!sunda || !indonesia) {
        skippedRows += 1;
        continue;
      }

      const converted = latinToAksaraSunda(sunda);
      if (!converted) {
        skippedRows += 1;
        continue;
      }

      items.push({
        sunda,
        indonesia,
        english,
        word: converted.word,
        syllables: converted.syllables,
        syllableBreakdown: converted.syllableBreakdown,
        hasSwara: converted.hasSwara,
        hasNgalagena: converted.hasNgalagena,
        hasRarangken: converted.hasRarangken,
        tags: converted.tags,
      });
    }

    return {
      items,
      totalRows: rows.length - 1,
      skippedRows,
    };
  }

  /**
   * Filter dictionary entries by Aksara Sunda script mode and easiness (character block count).
   */
  function filterWords(items, config) {
    const range = EASINESS_RANGES[config.easiness] || EASINESS_RANGES.easy;
    const mode = config.aksaraMode || 'all';

    return items.filter((item) => {
      const len = item.syllables.length;
      if (len < range.min || len > range.max) return false;

      if (mode === 'swara') return item.hasSwara;
      if (mode === 'ngalagena') return !item.hasSwara && item.hasNgalagena && !item.hasRarangken;
      if (mode === 'rarangken') return item.hasRarangken;
      return true;
    });
  }

  /**
   * Randomly sample up to `count` unique entries using Fisher-Yates shuffle.
   */
  function sampleWords(pool, count) {
    const copy = pool.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy.slice(0, Math.min(count, copy.length));
  }

  /**
   * Canonicalise Sundanese combining diacritics within each syllable cluster so
   * visually identical Keyman Sunda SNI input orders match reliably.
   */
  function getMarkPriority(cp) {
    if (cp >= 0x1BA1 && cp <= 0x1BA3) return 1; // Medial consonant signs
    if (cp >= 0x1BA4 && cp <= 0x1BAB) return 2; // Vowel signs & Pamaéh / Virama
    if (cp >= 0x1B80 && cp <= 0x1B82) return 3; // Final consonant signs
    return 0;
  }

  function normalizeSundaneseInput(str) {
    const cleaned = (str || '')
      .normalize('NFC')
      .replace(/[\s\u200B-\u200D\uFEFF]/g, '');

    const chars = Array.from(cleaned);
    const out = [];
    let i = 0;

    while (i < chars.length) {
      const base = chars[i];
      if (getMarkPriority(base.codePointAt(0)) !== 0) {
        out.push(base);
        i += 1;
        continue;
      }

      const marks = [];
      let j = i + 1;
      while (j < chars.length) {
        const p = getMarkPriority(chars[j].codePointAt(0));
        if (p === 0) break;
        marks.push({ ch: chars[j], p });
        j += 1;
      }

      marks.sort((a, b) => a.p - b.p || a.ch.codePointAt(0) - b.ch.codePointAt(0));
      out.push(base, ...marks.map((m) => m.ch));
      i = j;
    }

    return out.join('');
  }

  global.SundaVocabLoader = {
    EASINESS_RANGES,
    loadDataset,
    filterWords,
    sampleWords,
    latinToAksaraSunda,
    normalizeSundaneseInput,
  };
})(window);
