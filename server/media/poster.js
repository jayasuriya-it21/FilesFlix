'use strict';

// Poster & banner search for movies and shows.
// Uses free, reliable IMDb suggestion service with zero API keys required.
// Results are cached on disk in data/cache/posters/<clean_name>.json.

const https = require('https');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const config = require('../config');

// Clean movie/show release garbage from filenames
// e.g. "Oppenheimer (2023) [1080p] [BluRay] [5.1] [YTS.MX]" -> "Oppenheimer"
function cleanTitle(rawName) {
  if (!rawName) return { title: '', year: null };
  let base = path.basename(rawName, path.extname(rawName));

  // Extract year if present, e.g. (2023) or .2023.
  let year = null;
  const yearMatch = base.match(/[\(\.\s_\[](19\d{2}|20\d{2})[\)\.\s_\]]/);
  if (yearMatch) {
    year = parseInt(yearMatch[1], 10);
  }

  // Remove release groups, resolutions, audio specs, brackets
  base = base
    .replace(/\[.*?\]|\(.*?\)/g, ' ')
    .replace(/(1080p|720p|2160p|4k|uhd|bluray|blu-ray|web-dl|webrip|brrip|dvdrip|x264|x265|hevc|h264|aac|ac3|dts|ddp|dd\+?|eac3|esub|yts|yify|torrent galaxy|tgx|rarbg|galaxy)/gi, ' ')
    .replace(/[._\-+]/g, ' ')
    .trim();

  // If year matched, remove trailing digits or text after year
  if (year) {
    const idx = base.indexOf(String(year));
    if (idx !== -1) {
      base = base.slice(0, idx).trim();
    }
  }

  // Final trim of double spaces
  base = base.replace(/\s+/g, ' ').trim();
  return { title: base, year };
}

function queryImdb(query) {
  return new Promise((resolve) => {
    if (!query) return resolve(null);
    const q = query.toLowerCase().replace(/[^a-z0-9]/g, '_');
    if (!q) return resolve(null);
    const firstChar = q[0];
    const url = `https://v2.sg.media-imdb.com/suggestion/${firstChar}/${encodeURIComponent(q)}.json`;

    const req = https.get(url, { timeout: 4000 }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return resolve(null);
      }
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { raw += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(raw);
          resolve(parsed && Array.isArray(parsed.d) ? parsed.d : null);
        } catch (_) {
          resolve(null);
        }
      });
    });

    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
  });
}

/**
 * Find poster URL for a movie or file.
 * Returns { posterUrl, title, year, overview } or null.
 */
async function findPoster(fileName) {
  const { title, year } = cleanTitle(fileName);
  if (!title || title.length < 2) return null;

  const cacheKey = title.toLowerCase().replace(/[^a-z0-9]/g, '_') + (year ? '_' + year : '');
  const cacheFile = path.join(config.cacheDir('posters'), `${cacheKey}.json`);

  try {
    const cached = JSON.parse(await fsp.readFile(cacheFile, 'utf8'));
    return cached;
  } catch (_) {
    // Not in cache, fetch
  }

  let items = await queryImdb(title + (year ? ' ' + year : ''));
  if (!items || items.length === 0) {
    items = await queryImdb(title);
  }

  if (!items || items.length === 0) {
    const emptyResult = { title, year, posterUrl: null, matched: false };
    await fsp.writeFile(cacheFile, JSON.stringify(emptyResult)).catch(() => {});
    return emptyResult;
  }

  // Filter for feature films or TV movies / series with images
  let best = items.find((i) => i.i && i.i.imageUrl && (i.q === 'feature' || i.q === 'TV series'));
  if (!best) best = items.find((i) => i.i && i.i.imageUrl);

  let posterUrl = null;
  if (best && best.i && best.i.imageUrl) {
    // Request clean high-res variant by trimming IMDb thumbnail downsizing parameters
    // e.g. "._V1_QL75_UX380_CR0,0,380,562_.jpg" -> "._V1_.jpg" or use high UX
    posterUrl = best.i.imageUrl.replace(/\._V1_.*(\.[a-zA-Z]+)$/, '._V1_QL75_UX600_$1');
  }

  const result = {
    title: best ? (best.l || title) : title,
    year: best && best.y ? best.y : year,
    type: best && best.q ? best.q : 'movie',
    actors: best && best.s ? best.s : null,
    posterUrl,
    matched: !!posterUrl
  };

  await fsp.writeFile(cacheFile, JSON.stringify(result)).catch(() => {});
  return result;
}

module.exports = {
  cleanTitle,
  findPoster
};
