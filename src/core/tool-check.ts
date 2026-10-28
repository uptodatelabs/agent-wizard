import * as fs from 'fs';
import * as path from 'path';

/**
 * Cross-platform PATH lookup for tool binaries.
 *
 * `status` uses this to decide whether a tool is actually *installed* (i.e.
 * its CLI is on the PATH) rather than guessing from config-file presence
 * alone. On Windows the PATHEXT extension list is honoured.
 *
 * Results are memoised per (PATH, PATHEXT, names) triple: `status list` probes
 * the whole PATH for six tools, and the dashboard re-fetches every 30s, so the
 * synchronous directory walk used to repeat needlessly. The cache key includes
 * PATH/PATHEXT so a changed environment still re-probes.
 */
const executableCache = new Map<string, string | null>();

/** Clear the memoised PATH lookups (used by tests that rewrite PATH). */
export function clearExecutableCache(): void {
  executableCache.clear();
}

export function findExecutable(names: string[]): string | null {
  const pathVar = process.env.PATH || '';
  const pathExt = process.env.PATHEXT || '';
  const cacheKey = `${pathVar}\u0000${pathExt}\u0000${names.join(',')}`;
  const cached = executableCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const pathVarDirs = pathVar.split(path.delimiter).filter(Boolean);
  const isWindows = process.platform === 'win32';
  const exts = isWindows
    ? (pathExt || '.EXE;.CMD;.BAT;.COM').split(';').filter(Boolean)
    : [''];

  const found = ((): string | null => {
    for (const name of names) {
      for (const dir of pathVarDirs) {
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
  })();

  executableCache.set(cacheKey, found);
  return found;
}
