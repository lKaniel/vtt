import { describe, expect, it } from 'vitest';
import { FolderStore, S3Store } from './object-store.ts';
import { offsiteFromEnv } from './offsite-config.ts';

describe('where the nightly backups go, from the environment', () => {
  it('nowhere when nothing is set', () => {
    expect(offsiteFromEnv({})).toBeUndefined();
  });

  it('an S3 bucket from its endpoint, bucket and keys', () => {
    const got = offsiteFromEnv({
      VTT_BACKUP_S3_ENDPOINT: 'https://fsn1.your-objectstorage.com',
      VTT_BACKUP_S3_BUCKET: 'vtt-backups',
      VTT_BACKUP_S3_KEY: 'AK',
      VTT_BACKUP_S3_SECRET: 'SK',
      VTT_BACKUP_KEEP: '14',
      VTT_BACKUP_HOUR: '5',
    });
    expect(got?.store).toBeInstanceOf(S3Store);
    expect(got?.store.describe()).toBe('https://fsn1.your-objectstorage.com/vtt-backups');
    expect(got).toMatchObject({ keep: 14, hour: 5 });
  });

  it('a folder, e.g. a mounted volume', () => {
    const got = offsiteFromEnv({ VTT_BACKUP_DIR: '/mnt/backups' });
    expect(got?.store).toBeInstanceOf(FolderStore);
    expect(got).toMatchObject({ keep: undefined, hour: undefined });
  });

  it('refuses half a bucket, or numbers that are not', () => {
    expect(() => offsiteFromEnv({ VTT_BACKUP_S3_BUCKET: 'vtt-backups' })).toThrow(/VTT_BACKUP_S3_ENDPOINT/);
    expect(() => offsiteFromEnv({ VTT_BACKUP_DIR: '/x', VTT_BACKUP_HOUR: '25' })).toThrow(/VTT_BACKUP_HOUR/);
  });
});
