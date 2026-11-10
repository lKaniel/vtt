import { FolderStore, type ObjectStore, S3Store } from './object-store.ts';

// Where the nightly off-server backups go, from the server's environment
// (/opt/vtt/.env on the VPS, see docs/deploy.md): an S3 bucket
// (VTT_BACKUP_S3_*) or a folder (VTT_BACKUP_DIR). Neither: no nightly copies.

export interface OffsiteConfig {
  store: ObjectStore;
  keep?: number;
  hour?: number;
}

type Env = Record<string, string | undefined>;

const S3_VARS = ['ENDPOINT', 'BUCKET', 'KEY', 'SECRET'] as const;

/** The backup storage the environment names; throws when it names one by halves. */
export function offsiteFromEnv(env: Env): OffsiteConfig | undefined {
  const store = s3From(env) ?? (env.VTT_BACKUP_DIR?.trim() ? new FolderStore(env.VTT_BACKUP_DIR) : undefined);
  if (!store) return undefined;
  return {
    store,
    keep: numberFrom(env, 'VTT_BACKUP_KEEP', 1, 365),
    hour: numberFrom(env, 'VTT_BACKUP_HOUR', 0, 23),
  };
}

function s3From(env: Env): S3Store | undefined {
  const value = (name: string) => env[`VTT_BACKUP_S3_${name}`]?.trim() ?? '';
  if (!S3_VARS.some((v) => value(v))) return undefined;
  const missing = S3_VARS.filter((v) => !value(v));
  const names = missing.map((v) => 'VTT_BACKUP_S3_' + v).join(', ');
  if (missing.length) throw new Error(`Backups to a bucket also need ${names}`);
  return new S3Store({
    endpoint: value('ENDPOINT'),
    bucket: value('BUCKET'),
    key: value('KEY'),
    secret: value('SECRET'),
    region: value('REGION') || 'us-east-1',
  });
}

function numberFrom(env: Env, name: string, min: number, max: number): number | undefined {
  const text = env[name]?.trim();
  if (!text) return undefined;
  const n = Number(text);
  if (!Number.isInteger(n) || n < min || n > max)
    throw new Error(`${name} must be a whole number from ${min} to ${max}`);
  return n;
}
