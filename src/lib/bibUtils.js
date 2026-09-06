/**
 * Escapes regex special characters in a string.
 */
function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extracts all viable candidate tokens/BIBs from raw text scanned by camera (1D barcode/2D QR) or entered manually.
 * Supports:
 * - Direct BIB (5106, A101, VIP-01)
 * - Code 39 asterisks (*5106*, *A101*)
 * - Codabar start/stop characters (A5106B, C1001D)
 * - AIM symbology identifiers (]C15106, ]Q1, ]A0)
 * - URLs (standard path /eslip/5106, hash routing /#/eslip/5106, query param ?bib=5106, /runner/5106)
 * - Formatted labels (BIB: 5106, No. 5106, Runner: 5106)
 * - Trail distance & category prefixes (50K-5106, 100K-001, 21K-2105, 10K1001, SR-5106, HR1013, 50K_5106, 50K/5106)
 * - Suffixes (5106-SR, 5106SR)
 * - Delimiters like quotes, brackets, parentheses ("5106", [5106], (5106))
 * - Leading zero padding (05106, 0005106, 007)
 * - EAN-13 padding & check-digit removal (0000000051068)
 * - JSON payloads ({"bib":"5106"})
 * - UUIDs and RFID tags
 *
 * @param {string|number} raw
 * @returns {string[]}
 */
export function extractBibCandidates(raw) {
  if (raw === null || raw === undefined) return [];
  const str = String(raw)
    .replace(/[\u200B-\u200D\uFEFF\x00-\x1F\x7F]/g, '')
    .trim();
  if (!str) return [];

  const candidates = new Set();
  candidates.add(str);

  // 1. JSON parsing
  if ((str.startsWith('{') && str.endsWith('}')) || (str.startsWith('[') && str.endsWith(']'))) {
    try {
      const parsed = JSON.parse(str);
      if (parsed && typeof parsed === 'object') {
        const val = parsed.bib || parsed.BIB || parsed.runner_bib || parsed.id || parsed.bib_number;
        if (val) {
          const sVal = String(val).trim();
          candidates.add(sVal);
          const noZeros = sVal.replace(/^0+/, '');
          if (noZeros) candidates.add(noZeros);
        }
      }
    } catch {}
  }

  // 2. URL parsing (including hash routes e.g. /#/eslip/5106, query ?bib=5106, path /eslip/5106)
  if (str.includes('/') || str.includes('?') || str.includes('#') || str.includes('://') || str.startsWith('http')) {
    // 2a. Check explicit query parameter: ?bib=5106 or &bib=5106
    const queryMatch = str.match(/[?&]bib=([^&#\s]+)/i);
    if (queryMatch && queryMatch[1]) {
      const qVal = decodeURIComponent(queryMatch[1]).trim();
      candidates.add(qVal);
      const noZeros = qVal.replace(/^0+/, '');
      if (noZeros) candidates.add(noZeros);
    }

    // 2b. Regex for /eslip/5106, /runner/5106, /checkin/5106, /results/5106
    const urlMatches = str.match(/(?:eslip|runner|checkin|bib|result|results)[/=]([a-zA-Z0-9_-]+)/gi);
    if (urlMatches) {
      for (const m of urlMatches) {
        const seg = m.split(/[/=]/)[1];
        if (seg) {
          candidates.add(seg);
          const noZeros = seg.replace(/^0+/, '');
          if (noZeros) candidates.add(noZeros);
        }
      }
    }

    // 2c. Last path segment of URL (excluding known route names)
    try {
      const cleanUrl = str.replace(/#\/?/, '/');
      const urlObj = new URL(cleanUrl.startsWith('http') ? cleanUrl : 'http://localhost/' + cleanUrl);
      const segments = urlObj.pathname.split('/').filter(Boolean);
      if (segments.length > 0) {
        const lastSeg = segments[segments.length - 1];
        const ignored = ['eslip', 'runner', 'results', 'checkin', 'checkpoint', 'finish', 'monitor', 'scanner', 'home'];
        if (lastSeg && !ignored.includes(lastSeg.toLowerCase())) {
          const cleanLast = decodeURIComponent(lastSeg).trim();
          candidates.add(cleanLast);
          const noZeros = cleanLast.replace(/^0+/, '');
          if (noZeros) candidates.add(noZeros);
        }
      }
    } catch {}
  }

  // 3. Strip barcode delimiters: asterisks (*5106*), quotes, brackets, parens, colons, hashtags
  const stripped = str.replace(/^[*'"()[\]{}\s#:]+|[*'"()[\]{}\s#:]+$/g, '');
  if (stripped && stripped !== str) {
    candidates.add(stripped);
    const noZeros = stripped.replace(/^0+/, '');
    if (noZeros) candidates.add(noZeros);
  }

  // 4. Strip AIM symbology identifier (]C1, ]Q1, ]A0, ]e0, etc.)
  const noAim = str.replace(/^\][a-zA-Z0-9]{2}/, '');
  if (noAim !== str) {
    const cleanAim = noAim.replace(/^[*'"()[\]{}\s#:]+|[*'"()[\]{}\s#:]+$/g, '');
    if (cleanAim) {
      candidates.add(cleanAim);
      const noZeros = cleanAim.replace(/^0+/, '');
      if (noZeros) candidates.add(noZeros);
    }
  }

  // 5. Codabar start/stop characters (A, B, C, D)
  const codabar = str.match(/^[A-Da-d]([a-zA-Z0-9_-]+)[A-Da-d]$/);
  if (codabar && codabar[1]) {
    candidates.add(codabar[1]);
    const noZeros = codabar[1].replace(/^0+/, '');
    if (noZeros) candidates.add(noZeros);
  }

  // 6. Prefix stripping: 'BIB: 5106', 'BIB-5106', 'No. 5106', 'Runner 5106', 'ID: 5106'
  const prefixMatch = str.match(/^(?:BIB|No\.?|Runner|ID|REF|Code)\s*[:#=\-\s]\s*([a-zA-Z0-9_-]+)$/i);
  if (prefixMatch && prefixMatch[1]) {
    candidates.add(prefixMatch[1]);
    const noZeros = prefixMatch[1].replace(/^0+/, '');
    if (noZeros) candidates.add(noZeros);
  }

  // 7. Distance & Category prefix stripping:
  // e.g. '50K-5106', '100K-001', '21K-2105', '10K1001', 'SR-5106', 'HR1013', '50K_5106', '50K/5106'
  const catPrefixMatch = str.match(/^(?:\d+[kKmM]|[A-Za-z]+)[-_/\s]?([a-zA-Z0-9]+)$/);
  if (catPrefixMatch && catPrefixMatch[1]) {
    candidates.add(catPrefixMatch[1]);
    const noZeros = catPrefixMatch[1].replace(/^0+/, '');
    if (noZeros) candidates.add(noZeros);
  }

  // 8. Suffix stripping: '5106-SR', '5106SR', '5106-50K'
  const catSuffixMatch = str.match(/^([a-zA-Z0-9]+)[-_/\s]?(?:\d+[kKmM]|[A-Za-z]+)$/);
  if (catSuffixMatch && catSuffixMatch[1]) {
    candidates.add(catSuffixMatch[1]);
    const noZeros = catSuffixMatch[1].replace(/^0+/, '');
    if (noZeros) candidates.add(noZeros);
  }

  // 9. Leading zeros stripping (e.g. 05106 -> 5106)
  if (/^0+\d+$/.test(str)) {
    const noLeadingZeros = str.replace(/^0+/, '');
    if (noLeadingZeros) candidates.add(noLeadingZeros);
  }

  // 10. EAN-13 / UPC check digit handling
  if (/^\d{11,14}$/.test(str)) {
    const withoutCheck = str.slice(0, -1).replace(/^0+/, '');
    if (withoutCheck) candidates.add(withoutCheck);
  }

  return Array.from(candidates).filter(Boolean);
}

/**
 * Normalizes a raw string to the primary cleaned BIB.
 * If raw is already a clean BIB (e.g. "5106", "A101", "VIP-01"), returns it directly without alteration.
 *
 * @param {string|number} raw
 * @returns {string}
 */
export function normalizeScannedBib(raw) {
  if (raw === null || raw === undefined) return '';
  const str = String(raw)
    .replace(/[\u200B-\u200D\uFEFF\x00-\x1F\x7F]/g, '')
    .trim();
  if (!str) return '';

  // 1. If it's already a clean bib like "5106", "A101", "007", "VIP-01" without URL/delimiters
  if (/^[a-zA-Z0-9_-]{1,10}$/.test(str) && !str.startsWith('*') && !str.endsWith('*')) {
    // Check if it has a distance or category prefix like '50K-5106', 'SR-5106', 'BIB-5106'
    const catMatch = str.match(/^(?:\d+[kKmM]|BIB|No\.?|[A-Za-z]{2,4})[-_/\s](\d{3,6})$/i);
    if (catMatch && catMatch[1]) {
      return catMatch[1];
    }
    const distMatch = str.match(/^(?:\d+[kKmM]|BIB|No\.?)[-_/\s]([a-zA-Z0-9]+)$/i);
    if (distMatch && distMatch[1]) {
      return distMatch[1];
    }
    return str;
  }

  const candidates = extractBibCandidates(raw);
  if (candidates.length === 0) return str;

  // 2. Check for URL extracted candidate first if raw is a URL
  if (str.includes('/') || str.includes('?') || str.includes('#')) {
    const urlMatch = str.match(/(?:eslip|runner|checkin|bib|result|results)[/=]([a-zA-Z0-9_-]+)/i);
    if (urlMatch && urlMatch[1]) return urlMatch[1];
  }

  // 3. Prefer stripped candidate over raw with delimiters
  for (const c of candidates) {
    if (c !== str && /^[a-zA-Z0-9_-]{1,10}$/.test(c)) {
      return c;
    }
  }

  return candidates[0] || str;
}

/**
 * Robust runner lookup using multi-stage candidate matching:
 * 1. Direct exact string match on runner.bib
 * 2. Case-insensitive match on runner.bib
 * 3. Exact match on runner.id (UUID), runner.rfid_tag, runner.user_id
 * 4. Multi-candidate matching (URL, delimiters, category prefix, Codabar, AIM, leading zeros)
 * 5. Numeric equality match on runner.bib (e.g. 5106 == 05106, 7 == 007)
 * 6. Word/non-alphanumeric boundary containment (if runner's BIB appears inside the raw string)
 *
 * @param {string|number} rawBib
 * @param {Array<object>} runners
 * @returns {object|null}
 */
export function smartFindRunner(rawBib, runners) {
  if (!rawBib || !Array.isArray(runners) || runners.length === 0) return null;

  const rawStr = String(rawBib)
    .replace(/[\u200B-\u200D\uFEFF\x00-\x1F\x7F]/g, '')
    .trim();
  if (!rawStr) return null;

  // Phase 1: Direct exact match on runner.bib
  let found = runners.find(r => String(r.bib || '').trim() === rawStr);
  if (found) return found;

  // Phase 2: Case-insensitive match on runner.bib
  const rawLower = rawStr.toLowerCase();
  found = runners.find(r => String(r.bib || '').trim().toLowerCase() === rawLower);
  if (found) return found;

  // Phase 3: Match on runner.id (UUID), runner.rfid_tag, runner.user_id
  found = runners.find(r =>
    (r.id && String(r.id).trim().toLowerCase() === rawLower) ||
    (r.rfid_tag && String(r.rfid_tag).trim().toLowerCase() === rawLower) ||
    (r.user_id && String(r.user_id).trim().toLowerCase() === rawLower)
  );
  if (found) return found;

  // Phase 4: Candidate-based lookup
  const candidates = extractBibCandidates(rawStr);
  for (const c of candidates) {
    if (c === rawStr) continue; // already checked in Phase 1 & 2

    // 4a. Exact match
    found = runners.find(r => String(r.bib || '').trim() === c);
    if (found) return found;

    // 4b. Case-insensitive match
    const cLower = c.toLowerCase();
    found = runners.find(r => String(r.bib || '').trim().toLowerCase() === cLower);
    if (found) return found;

    // 4c. Match UUID/RFID on candidate
    found = runners.find(r =>
      (r.id && String(r.id).trim().toLowerCase() === cLower) ||
      (r.rfid_tag && String(r.rfid_tag).trim().toLowerCase() === cLower)
    );
    if (found) return found;
  }

  // Phase 5: Numeric equality match (e.g. '05106' vs '5106', '007' vs '7')
  for (const c of candidates) {
    const numC = parseInt(c, 10);
    if (!isNaN(numC) && numC > 0 && /^\d+$/.test(c)) {
      found = runners.find(r => {
        const numR = parseInt(r.bib, 10);
        return !isNaN(numR) && numR === numC && /^\d+$/.test(String(r.bib || '').trim());
      });
      if (found) return found;
    }
  }

  // Phase 6: Substring / Word-boundary containment (runner.bib appears inside raw string)
  found = runners.find(r => {
    const b = String(r.bib || '').trim();
    if (!b || b.length < 1) return false;
    const escaped = escapeRegex(b);
    const regex = new RegExp(`(?:^|[^a-zA-Z0-9])${escaped}(?:[^a-zA-Z0-9]|$)`, 'i');
    return regex.test(rawStr);
  });
  if (found) return found;

  return null;
}
