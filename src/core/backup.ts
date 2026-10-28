import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Timestamped backups of configuration files.
 *
 * Contract (v1.1 — hardened):
 *  - Returns `null` when there is nothing to back up (file does not exist yet).
 *  - **Throws** when the file exists but the backup could not be created
 *    (permissions, disk full, ...). Callers must NOT continue and overwrite the
 *    original in that case — a silent `null` previously allowed exactly that,
 *    which could destroy the user's config without a restore point.
 *
 * Backup path: `<file>.bak-YYYYMMDD-HHMMSS` (a new timestamp each call so
 * history is preserved). Same-second collisions get a `-N` suffix.
 *
 * Retention: at most `keep` backups are retained per file (default 10, set
 * `AGENT_WIZARD_BACKUP_KEEP=0` to disable pruning). Only files matching our own
 * `.bak-<timestamp>[-N]` pattern are ever pruned.
 */

/** Default number of backups retained per file. */
export const DEFAULT_BACKUP_KEEP = 10;

export interface BackupOptions {
  /** Retained backups per file. `0` disables pruning. */
  keep?: number;
}

function resolveKeep(options: BackupOptions): number {
  if (typeof options.keep === 'number') return options.keep;
  const raw = process.env.AGENT_WIZARD_BACKUP_KEEP;
  if (raw !== undefined) {
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isNaN(parsed) && parsed >= 0) return parsed;
  }
  return DEFAULT_BACKUP_KEEP;
}

function timestampSuffix(): string {
  return new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\..+/, '')
    .replace('T', '-')
    .slice(0, 15); // YYYYMMDD-HHMMSS
}

/** `true` when `name` looks like a backup we created for `baseName`. */
function isBackupOf(name: string, baseName: string): boolean {
  return new RegExp(`^${escapeRegExp(baseName)}\\.bak-\\d{8}-\\d{6}(-\\d+)?$`).test(name);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Create a timestamped backup of a file before modifying it.
 *
 * @throws when the file exists but copying it fails.
 */
export async function backupFile(
  filePath: string,
  options: BackupOptions = {},
): Promise<string | null> {
  try {
    await fs.access(filePath);
  } catch {
    // Nothing to back up (file does not exist yet)
    return null;
  }

  const ts = timestampSuffix();
  let backupPath = `${filePath}.bak-${ts}`;
  // Guard against same-second collisions: append -N if the name already exists
  let n = 1;
  while (true) {
    try {
      await fs.access(backupPath);
      // already exists -> try next suffix
      backupPath = `${filePath}.bak-${ts}-${n}`;
      n++;
    } catch {
      // does not exist -> use this path
      break;
    }
  }

  // Let copy failures propagate: writing over the original without a restore
  // point is worse than failing loudly.
  await fs.copyFile(filePath, backupPath);

  const keep = resolveKeep(options);
  if (keep > 0) {
    await pruneBackups(filePath, keep).catch(() => {
      // Pruning is best-effort; never fail a write because cleanup failed.
    });
  }

  return backupPath;
}

/**
 * Delete older backups of `filePath`, keeping the newest `keep` ones.
 * Returns the removed paths. Never touches files that do not match our own
 * `.bak-<timestamp>[-N]` naming.
 */
export async function pruneBackups(filePath: string, keep: number): Promise<string[]> {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }

  const backups = entries.filter((name) => isBackupOf(name, base)).sort().reverse();
  const remove = backups.slice(Math.max(0, keep));
  const removed: string[] = [];
  for (const name of remove) {
    const target = path.join(dir, name);
    try {
      await fs.unlink(target);
      removed.push(target);
    } catch {
      // Ignore: retention is best-effort
    }
  }
  return removed;
}
