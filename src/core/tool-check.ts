import * as fs from 'fs';
import * as path from 'path';

/**
 * Cross-platform PATH lookup for tool binaries.
 *
 * `status` uses this to decide whether a tool is actually *installed* (i.e.
 * its CLI is on the PATH) rather than guessing from config-file presence
 * alone. On Windows the PATHEXT extension list is honoured.
 */
export function findExecutable(names: string[]): string | null {
  const pathVar = process.env.PATH || '';
  const dirs = pathVar.split(path.delimiter).filter(Boolean);

  const isWindows = process.platform === 'win32';
  const exts = isWindows ? (process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';').filter(Boolean) : [''];

  for (const name of names) {
    for (const dir of dirs) {
      for (const ext of exts) {
        const candidate = path.join(dir, name + ext);
        try {
          fs.accessSync(candidate, fs.constants.X_OK);
          return candidate;
        } catch {
          // Not executable here — keep looking
        }
      }
    }
  }
  return null;
}
