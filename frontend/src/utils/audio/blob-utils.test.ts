import { describe, it, expect, vi } from 'vitest';
import { blobToBase64, validateAudioBlob, createBlobURL, revokeBlobURL } from './blob-utils';

describe('validateAudioBlob', () => {
  it('returns false for null blob', () => {
    expect(validateAudioBlob(null)).toBe(false);
  });

  it('returns false for empty blob', () => {
    const blob = new Blob([], { type: 'audio/webm' });
    expect(validateAudioBlob(blob)).toBe(false);
  });

  it('returns true for valid audio blob', () => {
    const blob = new Blob(['audio-data'], { type: 'audio/webm' });
    expect(validateAudioBlob(blob)).toBe(true);
  });

  it('returns true for audio/ogg type', () => {
    const blob = new Blob(['audio-data'], { type: 'audio/ogg' });
    expect(validateAudioBlob(blob)).toBe(true);
  });

  it('returns true for audio/mp4 type', () => {
    const blob = new Blob(['audio-data'], { type: 'audio/mp4' });
    expect(validateAudioBlob(blob)).toBe(true);
  });

  it('returns true for audio/wav type', () => {
    const blob = new Blob(['audio-data'], { type: 'audio/wav' });
    expect(validateAudioBlob(blob)).toBe(true);
  });

  it('returns true for codec-specific MIME types', () => {
    const blob = new Blob(['audio-data'], { type: 'audio/webm;codecs=opus' });
    expect(validateAudioBlob(blob)).toBe(true);
  });

  it('returns true for blob with empty type', () => {
    const blob = new Blob(['audio-data']);
    expect(validateAudioBlob(blob)).toBe(true);
  });
});

describe('blobToBase64', () => {
  it('converts a blob to base64 string', async () => {
    const blob = new Blob(['hello world'], { type: 'audio/webm' });
    const base64 = await blobToBase64(blob);
    expect(base64).toBeTruthy();
    expect(typeof base64).toBe('string');
  });

  it('strips data URL prefix', async () => {
    const blob = new Blob(['test'], { type: 'text/plain' });
    const base64 = await blobToBase64(blob);
    // Should not contain "data:" prefix
    expect(base64).not.toContain('data:');
    expect(base64).not.toContain(',');
  });
});

describe('createBlobURL', () => {
  it('returns null for null blob', () => {
    expect(createBlobURL(null)).toBeNull();
  });

  it('returns null for empty blob', () => {
    const blob = new Blob([], { type: 'audio/webm' });
    expect(createBlobURL(blob)).toBeNull();
  });

  it('returns a blob URL for valid blob', () => {
    const blob = new Blob(['audio-data'], { type: 'audio/webm' });
    const url = createBlobURL(blob);
    expect(url).toBeTruthy();
    expect(url).toContain('blob:');
  });
});

describe('revokeBlobURL', () => {
  it('does not throw for null url', () => {
    expect(() => revokeBlobURL(null)).not.toThrow();
  });

  it('revokes a valid blob URL', () => {
    const spy = vi.spyOn(URL, 'revokeObjectURL');
    const blob = new Blob(['audio-data'], { type: 'audio/webm' });
    const url = URL.createObjectURL(blob);
    revokeBlobURL(url);
    expect(spy).toHaveBeenCalledWith(url);
    spy.mockRestore();
  });
});
