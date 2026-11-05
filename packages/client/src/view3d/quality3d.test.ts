import { describe, expect, it } from 'vitest';
import { levelFor, QUALITY, quality3d, qualityOf, shrunkSize } from './quality3d.ts';

// How good the 3D view looks against how fast it runs: Low for weak or
// software graphics, Medium for laptop graphics, High for a graphics card;
// "auto" picks one from the graphics the browser reports.

describe('graphics quality', () => {
  it('picks Low for software drawing and phone graphics', () => {
    expect(levelFor({ gpu: 'Google SwiftShader' })).toBe('low');
    expect(levelFor({ gpu: 'llvmpipe (LLVM 15.0.7, 256 bits)' })).toBe('low');
    expect(levelFor({ gpu: 'Mali-G52' })).toBe('low');
    expect(levelFor({ gpu: 'ANGLE (Intel, Intel(R) HD Graphics 4000 Direct3D11)' })).toBe('low');
  });

  it('picks Medium for built-in laptop graphics', () => {
    expect(levelFor({ gpu: 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11)' })).toBe('medium');
    expect(levelFor({ gpu: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11)' })).toBe('medium');
    expect(levelFor({ gpu: 'ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11)' })).toBe('medium');
  });

  it('picks High for a graphics card', () => {
    expect(levelFor({ gpu: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Ti Direct3D11)' })).toBe('high');
    expect(levelFor({ gpu: 'Apple M2 Pro' })).toBe('high');
  });

  it('picks Low with little memory, whatever the graphics', () => {
    expect(levelFor({ gpu: 'NVIDIA GeForce GTX 1060', memory: 2 })).toBe('low');
  });

  it('keeps a chosen level, and "auto" follows the graphics', () => {
    expect(qualityOf('low', { gpu: 'NVIDIA GeForce RTX 4090' })).toBe(QUALITY.low);
    expect(qualityOf('auto', { gpu: 'NVIDIA GeForce RTX 4090' })).toBe(QUALITY.high);
  });

  it('asks less of the graphics at each lower level', () => {
    const { low, medium, high } = QUALITY;
    for (const k of ['pixelRatio', 'groundPixels', 'groundRefresh', 'lights', 'textureMax'] as const) {
      expect(low[k]).toBeLessThan(medium[k]);
      expect(medium[k]).toBeLessThanOrEqual(high[k]);
    }
    expect(low.tiny).toBeGreaterThan(high.tiny);
  });
});

describe('the quality the view runs with', () => {
  it('follows the graphics this browser has, with no choice made', () => {
    expect(Object.values(QUALITY)).toContain(quality3d());
  });
});

describe('textures shrunk to fit', () => {
  it('keeps a picture that fits', () => {
    expect(shrunkSize(512, 256, 1024)).toBeUndefined();
  });
  it('halves a picture until its longer side fits, keeping its shape', () => {
    expect(shrunkSize(4096, 2048, 1024)).toEqual([1024, 512]);
    expect(shrunkSize(2048, 2048, 512)).toEqual([512, 512]);
  });
});
