import * as fs from 'fs/promises';

/**
 * Create a timestamped backup of a file before modifying it.
 *
 * Never throws: if the source cannot be read (e.g. does not exist yet), the
 * backup is simply skipped. This keeps write paths safe while guaranteeing a
 * restore point exists whenever an existing file is about to be overwritten.
 *
 * Backup path: `<file>.bak-YYYYMMDD-HHMMSS` (a new timestamp each call so
 * history is preserved). Returns the backup path, or null if skipped.
 */
export async function backupFile(filePath: string): Promise<string | null> {
  try {
    await fs.access(filePath);
  } catch {
    // Nothing to back up (file does not exist yet)
    return null;
  }

  const ts = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\..+/, '')
    .replace('T', '-')
    .slice(0, 15); // YYYYMMDD-HHMMSS
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

  try {
    await fs.copyFile(filePath, backupPath);
    return backupPath;
  } catch {
    return null;
  }
}
