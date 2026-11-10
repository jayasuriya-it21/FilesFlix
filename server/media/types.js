'use strict';

// File-type classification shared by the browser and thumbnails/metadata logic.

const CATS = {
  video: ['mp4', 'mkv', 'avi', 'mov', 'webm', 'm4v', 'mpg', 'mpeg', 'wmv', 'flv', 'ts', 'm2ts', 'mts', '3gp', 'ogv', 'vob', 'divx', 'f4v'],
  audio: ['mp3', 'm4a', 'aac', 'flac', 'wav', 'ogg', 'oga', 'opus', 'wma', 'aiff', 'alac'],
  image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'avif', 'ico', 'tif', 'tiff', 'heic'],
  doc: ['pdf', 'txt', 'md', 'rtf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'ppt', 'pptx', 'epub', 'odt', 'html', 'htm'],
  subtitle: ['srt', 'vtt', 'ass', 'ssa', 'sub']
};

const CAT_OF = {};
for (const [cat, exts] of Object.entries(CATS)) {
  for (const e of exts) CAT_OF[e] = cat;
}

const MIME = {
  // video
  mp4: 'video/mp4', m4v: 'video/mp4', mkv: 'video/x-matroska', webm: 'video/webm',
  avi: 'video/x-msvideo', mov: 'video/quicktime', mpg: 'video/mpeg', mpeg: 'video/mpeg',
  wmv: 'video/x-ms-wmv', flv: 'video/x-flv', ts: 'video/mp2t', m2ts: 'video/mp2t',
  ogv: 'video/ogg',
  // audio
  mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac',
  wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/opus', wma: 'audio/x-ms-wma',
  // image
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', avif: 'image/avif', ico: 'image/x-icon',
  tif: 'image/tiff', tiff: 'image/tiff', heic: 'image/heic',
  // docs
  pdf: 'application/pdf', txt: 'text/plain; charset=utf-8',
  md: 'text/plain; charset=utf-8', csv: 'text/csv; charset=utf-8',
  html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8',
  srt: 'application/x-subrip', vtt: 'text/vtt', ass: 'text/plain; charset=utf-8',
  // archives / other
  zip: 'application/zip', rar: 'application/vnd.rar', '7z': 'application/x-7z-compressed',
  exe: 'application/octet-stream'
};

const DEFAULT_MIME = 'application/octet-stream';

function extOf(name) {
  const i = name.lastIndexOf('.');
  if (i <= 0 || i === name.length - 1) return '';
  return name.slice(i + 1).toLowerCase();
}

/** 'video' | 'audio' | 'image' | 'doc' | 'subtitle' | 'other' */
function categorize(name) {
  return CAT_OF[extOf(name)] || 'other';
}

function mimeOf(name) {
  return MIME[extOf(name)] || DEFAULT_MIME;
}

module.exports = { categorize, mimeOf, extOf };
