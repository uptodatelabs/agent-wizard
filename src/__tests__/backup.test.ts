import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { backupFile } from '../core/backup';

describe('backupFile', () => {
  const dir = path.join(process.env.HOME || '/tmp', '.aw-backup-test');

  beforeEach(async () => {
    await fs.mkdir(dir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('creates a timestamped backup before overwriting and preserves original content', async () => {
    const file = path.join(dir, 'conf.json');
    await fs.writeFile(file, '{"a":1}');

    const backup = await backupFile(file);
    expect(backup).not.toBeNull();
    expect(backup!.startsWith(file + '.bak-')).toBe(true);

    // original content preserved in the backup
    const bakContent = await fs.readFile(backup!, 'utf-8');
    expect(bakContent).toBe('{"a":1}');

    // simulate an overwrite of the live file
    await fs.writeFile(file, '{"a":2}');

    // a second backup captures the new pre-overwrite state
    const backup2 = await backupFile(file);
    expect(backup2).not.toBeNull();
    expect(backup2).not.toBe(backup);
    expect(await fs.readFile(backup2!, 'utf-8')).toBe('{"a":2}');
  });

  it('returns null (no throw) when the file does not exist', async () => {
    const missing = path.join(dir, 'nope.json');
    const result = await backupFile(missing);
    expect(result).toBeNull();
  });
});
