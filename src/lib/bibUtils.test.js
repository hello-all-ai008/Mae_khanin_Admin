import { describe, it, expect } from 'vitest';
import { extractBibCandidates, normalizeScannedBib, smartFindRunner } from './bibUtils';

describe('bibUtils', () => {
  describe('normalizeScannedBib', () => {
    it('returns empty string for null/undefined/empty', () => {
      expect(normalizeScannedBib(null)).toBe('');
      expect(normalizeScannedBib(undefined)).toBe('');
      expect(normalizeScannedBib('')).toBe('');
    });

    it('preserves clean bibs including alphanumeric without altering', () => {
      expect(normalizeScannedBib('5106')).toBe('5106');
      expect(normalizeScannedBib('A101')).toBe('A101');
      expect(normalizeScannedBib('VIP-01')).toBe('VIP-01');
      expect(normalizeScannedBib('007')).toBe('007');
    });

    it('strips non-printable and invisible characters', () => {
      expect(normalizeScannedBib('\uFEFF5106\u200B\r\n')).toBe('5106');
    });

    it('extracts bib from URLs (e-slip, hash routing, query params, runner path)', () => {
      expect(normalizeScannedBib('https://rohn-runner.vercel.app/eslip/5106')).toBe('5106');
      expect(normalizeScannedBib('https://rohn-runner.vercel.app/#/eslip/5106')).toBe('5106');
      expect(normalizeScannedBib('http://localhost:5173/runner/1013')).toBe('1013');
      expect(normalizeScannedBib('http://192.168.1.100:5174/eslip/5106')).toBe('5106');
      expect(normalizeScannedBib('https://example.com/checkin?bib=5080')).toBe('5080');
      expect(normalizeScannedBib('https://example.com/eslip/5106?view=print')).toBe('5106');
    });

    it('extracts bib from category prefixed values', () => {
      expect(normalizeScannedBib('50K-5106')).toBe('5106');
      expect(normalizeScannedBib('100K-001')).toBe('001');
      expect(normalizeScannedBib('SR-5106')).toBe('5106');
    });

    it('extracts bib from JSON payload', () => {
      expect(normalizeScannedBib('{"bib":"5106"}')).toBe('5106');
      expect(normalizeScannedBib('{"runner_bib": "1013"}')).toBe('1013');
    });

    it('strips delimiters and prefixes like BIB:, No., Runner, asterisks', () => {
      expect(normalizeScannedBib('*5106*')).toBe('5106');
      expect(normalizeScannedBib('BIB: 5106')).toBe('5106');
      expect(normalizeScannedBib('BIB-5106')).toBe('5106');
      expect(normalizeScannedBib('No. 1013')).toBe('1013');
    });
  });

  describe('smartFindRunner', () => {
    const runners = [
      { id: '37a6e24a-32ae-47fb-806f-6255bfc07a44', bib: '5106', name: 'Pecharaporn', cat: '50K', rfid_tag: 'RFID_5106' },
      { id: 'uuid-2', bib: '1013', name: 'Adisorn', cat: '10K' },
      { id: 'uuid-3', bib: 'A101', name: 'Suda', cat: '10K' },
      { id: 'uuid-4', bib: '007', name: 'James', cat: '25K' }
    ];

    it('matches exact bib', () => {
      expect(smartFindRunner('5106', runners)?.name).toBe('Pecharaporn');
      expect(smartFindRunner('A101', runners)?.name).toBe('Suda');
    });

    it('matches URL qr code scans (standard, hash, ip/port)', () => {
      expect(smartFindRunner('https://rohn-runner.vercel.app/eslip/5106', runners)?.name).toBe('Pecharaporn');
      expect(smartFindRunner('https://rohn-runner.vercel.app/#/eslip/5106', runners)?.name).toBe('Pecharaporn');
      expect(smartFindRunner('http://192.168.1.100:5174/eslip/5106', runners)?.name).toBe('Pecharaporn');
      expect(smartFindRunner('https://example.com/checkin?bib=1013', runners)?.name).toBe('Adisorn');
    });

    it('matches barcode delimiters (*5106*, A5106B, ]C15106)', () => {
      expect(smartFindRunner('*5106*', runners)?.name).toBe('Pecharaporn');
      expect(smartFindRunner('A5106B', runners)?.name).toBe('Pecharaporn');
      expect(smartFindRunner(']C15106', runners)?.name).toBe('Pecharaporn');
    });

    it('matches category-prefixed bibs (50K-5106, 10K-A101, SR-5106)', () => {
      expect(smartFindRunner('50K-5106', runners)?.name).toBe('Pecharaporn');
      expect(smartFindRunner('SR-5106', runners)?.name).toBe('Pecharaporn');
      expect(smartFindRunner('HR1013', runners)?.name).toBe('Adisorn');
    });

    it('matches UUID (runner.id)', () => {
      expect(smartFindRunner('37a6e24a-32ae-47fb-806f-6255bfc07a44', runners)?.name).toBe('Pecharaporn');
    });

    it('matches RFID tag', () => {
      expect(smartFindRunner('RFID_5106', runners)?.name).toBe('Pecharaporn');
    });

    it('matches zero-padded barcodes (e.g. 05106 or 0005106)', () => {
      expect(smartFindRunner('05106', runners)?.name).toBe('Pecharaporn');
      expect(smartFindRunner('0005106', runners)?.name).toBe('Pecharaporn');
    });

    it('matches when DB has leading zeros and scan does not (007 vs 7)', () => {
      expect(smartFindRunner('7', runners)?.name).toBe('James');
    });

    it('matches EAN-13 padded barcodes with check digit', () => {
      expect(smartFindRunner('0000000051068', runners)?.name).toBe('Pecharaporn');
    });

    it('returns null when runner does not exist', () => {
      expect(smartFindRunner('9999', runners)).toBeNull();
    });
  });
});
