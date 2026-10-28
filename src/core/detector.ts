import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { CopilotAdapter } from '../adapters/copilot';

export interface ProjectInfo {
  name: string;
  type: ProjectType;
  frameworks: string[];
  languages: string[];
  hasOpenClaw: boolean;
  hasHermes: boolean;
  hasClaudeCode: boolean;
  hasCursor: boolean;
  hasCopilot: boolean;
  hasAider: boolean;
}

export type ProjectType = 'web' | 'mobile' | 'cli' | 'library' | 'api' | 'unknown';

/**
 * Scoped npm packages whose real name differs from the framework we report.
 * Previously the detector looked up bare `nestjs` / `angular` / `tauri`, which
 * never match (`@nestjs/core`, `@angular/core`, `@tauri-apps/api`), so those
 * frameworks were always reported as "not detected".
 */
const SCOPED_FRAMEWORK_PACKAGES: Array<{ pkg: string; framework: string }> = [
  { pkg: '@nestjs/core', framework: 'nestjs' },
  { pkg: '@angular/core', framework: 'angular' },
  { pkg: '@tauri-apps/api', framework: 'tauri' },
  { pkg: '@tauri-apps/cli', framework: 'tauri' },
];

const BARE_FRAMEWORK_PACKAGES: Array<{ pkg: string; framework: string }> = [
  { pkg: 'react', framework: 'react' },
  { pkg: 'vue', framework: 'vue' },
  { pkg: 'next', framework: 'nextjs' },
  { pkg: 'nuxt', framework: 'nuxtjs' },
  { pkg: 'express', framework: 'express' },
  { pkg: 'fastify', framework: 'fastify' },
  { pkg: 'electron', framework: 'electron' },
  { pkg: 'tauri', framework: 'tauri' },
];

/** How deep to walk when collecting files for language detection. */
const MAX_SCAN_DEPTH = 3;

/** Directories never worth walking for language detection. */
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  'out',
  'coverage',
  'vendor',
  'target',
  '__pycache__',
]);

export class ProjectDetector {
  private copilotAdapter = new CopilotAdapter();

  async detect(): Promise<ProjectInfo> {
    const projectInfo: ProjectInfo = {
      name: await this.getProjectName(),
      type: await this.getProjectType(),
      frameworks: await this.detectFrameworks(),
      languages: await this.detectLanguages(),
      hasOpenClaw: await this.detectOpenClaw(),
      hasHermes: await this.detectHermes(),
      hasClaudeCode: await this.detectClaudeCode(),
      hasCursor: await this.detectCursor(),
      hasCopilot: await this.detectCopilot(),
      hasAider: await this.detectAider(),
    };

    return projectInfo;
  }

  private async getProjectName(): Promise<string> {
    try {
      const packageJsonPath = path.join(process.cwd(), 'package.json');
      const content = await fs.readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(content);
      return packageJson.name || path.basename(process.cwd());
    } catch {
      return path.basename(process.cwd());
    }
  }

  private async getProjectType(): Promise<ProjectType> {
    // Check for mobile
    if (await this.fileExists('ios')) return 'mobile';
    if (await this.fileExists('android')) return 'mobile';
    if (await this.fileExists('pubspec.yaml')) return 'mobile';

    // Check for CLI
    if (await this.fileExists('bin')) return 'cli';
    if (await this.hasBinInPackageJson()) return 'cli';

    // Check for library
    if ((await this.fileExists('lib')) && !(await this.fileExists('src'))) return 'library';

    // Check for API
    if (await this.fileExists('server')) return 'api';
    if (await this.fileExists('api')) return 'api';

    // Check for web
    if (await this.fileExists('public')) return 'web';
    if (await this.fileExists('src')) return 'web';

    return 'unknown';
  }

  private async hasBinInPackageJson(): Promise<boolean> {
    try {
      const packageJsonPath = path.join(process.cwd(), 'package.json');
      const content = await fs.readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(content);
      return !!packageJson.bin;
    } catch {
      return false;
    }
  }

  private async detectFrameworks(): Promise<string[]> {
    const frameworks: string[] = [];
    const found = (name: string): boolean => frameworks.includes(name);
    const add = (name: string): void => {
      if (!found(name)) frameworks.push(name);
    };

    // Check package.json dependencies
    try {
      const packageJsonPath = path.join(process.cwd(), 'package.json');
      const content = await fs.readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(content);

      const allDeps: Record<string, unknown> = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      };

      for (const { pkg, framework } of BARE_FRAMEWORK_PACKAGES) {
        if (allDeps[pkg]) add(framework);
      }
      for (const { pkg, framework } of SCOPED_FRAMEWORK_PACKAGES) {
        if (allDeps[pkg]) add(framework);
      }
    } catch {
      // No package.json
    }

    // Check for Python frameworks
    if ((await this.fileExists('requirements.txt')) || (await this.fileExists('pyproject.toml'))) {
      try {
        const requirementsPath = (await this.fileExists('requirements.txt'))
          ? 'requirements.txt'
          : 'pyproject.toml';
        const content = await fs.readFile(path.join(process.cwd(), requirementsPath), 'utf-8');

        if (content.includes('django')) add('django');
        if (content.includes('flask')) add('flask');
        if (content.includes('fastapi')) add('fastapi');
      } catch {
        // Error reading file
      }
    }

    // Check for Rust frameworks
    if (await this.fileExists('Cargo.toml')) {
      try {
        const content = await fs.readFile(path.join(process.cwd(), 'Cargo.toml'), 'utf-8');
        if (content.includes('actix')) add('actix');
        if (content.includes('axum')) add('axum');
        if (content.includes('rocket')) add('rocket');
      } catch {
        // Error reading file
      }
    }

    return frameworks;
  }

  private async detectLanguages(): Promise<string[]> {
    const languages: string[] = [];

    // Check file extensions (bounded recursive walk — a single readdir of the
    // project root missed every source file in `src/`, so TypeScript projects
    // without a tsconfig.json were reported as JavaScript only).
    const files = await this.getFiles();
    const extensions = new Set(files.map((f) => path.extname(f).toLowerCase()));

    if (extensions.has('.ts') || extensions.has('.tsx')) languages.push('typescript');
    if (extensions.has('.js') || extensions.has('.jsx')) languages.push('javascript');
    if (extensions.has('.py')) languages.push('python');
    if (extensions.has('.rs')) languages.push('rust');
    if (extensions.has('.go')) languages.push('go');
    if (extensions.has('.java')) languages.push('java');
    if (extensions.has('.kt')) languages.push('kotlin');
    if (extensions.has('.swift')) languages.push('swift');
    if (extensions.has('.rb')) languages.push('ruby');
    if (extensions.has('.php')) languages.push('php');
    if (extensions.has('.cs')) languages.push('csharp');

    // Check config files
    if (await this.fileExists('tsconfig.json')) {
      if (!languages.includes('typescript')) languages.push('typescript');
    }
    if (await this.fileExists('package.json')) {
      if (!languages.includes('javascript')) languages.push('javascript');
    }
    if ((await this.fileExists('pyproject.toml')) || (await this.fileExists('setup.py'))) {
      if (!languages.includes('python')) languages.push('python');
    }
    if (await this.fileExists('Cargo.toml')) {
      if (!languages.includes('rust')) languages.push('rust');
    }
    if (await this.fileExists('go.mod')) {
      if (!languages.includes('go')) languages.push('go');
    }

    return languages;
  }

  /** Collect relative file names down to MAX_SCAN_DEPTH, skipping vendor dirs. */
  private async getFiles(): Promise<string[]> {
    const files: string[] = [];

    const walk = async (dir: string, depth: number): Promise<void> => {
      if (depth > MAX_SCAN_DEPTH) return;
      let items: Array<{ name: string; isFile(): boolean; isDirectory(): boolean }>;
      try {
        items = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const item of items) {
        if (item.name.startsWith('.')) continue;
        if (item.isFile()) {
          files.push(item.name);
        } else if (item.isDirectory()) {
          if (SKIP_DIRS.has(item.name)) continue;
          await walk(path.join(dir, item.name), depth + 1);
        }
      }
    };

    await walk(process.cwd(), 1);
    return files;
  }

  private async detectOpenClaw(): Promise<boolean> {
    try {
      const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
      await fs.access(configPath);
      return true;
    } catch {
      return false;
    }
  }

  private async detectHermes(): Promise<boolean> {
    try {
      const configPath = path.join(os.homedir(), '.hermes', 'config.yaml');
      await fs.access(configPath);
      return true;
    } catch {
      return false;
    }
  }

  private async detectClaudeCode(): Promise<boolean> {
    try {
      const userConfigPath = path.join(os.homedir(), '.claude', 'settings.json');
      try {
        await fs.access(userConfigPath);
        return true;
      } catch {
        const projectConfigPath = path.join(process.cwd(), '.claude', 'settings.json');
        try {
          await fs.access(projectConfigPath);
          return true;
        } catch {
          return false;
        }
      }
    } catch {
      return false;
    }
  }

  private async detectCursor(): Promise<boolean> {
    try {
      const configPath = path.join(process.cwd(), '.cursor');
      await fs.access(configPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delegate to the adapter so detection and configuration agree.
   * Previously this only looked for `.github/copilot-instructions.md` while
   * `CopilotAdapter.detect()` also accepted `.github/instructions/`, so the
   * same tool was reported as configured / not configured depending on the
   * code path.
   */
  private async detectCopilot(): Promise<boolean> {
    return this.copilotAdapter.detect();
  }

  private async detectAider(): Promise<boolean> {
    try {
      const configPath = path.join(process.cwd(), '.aider.conf.yml');
      await fs.access(configPath);
      return true;
    } catch {
      return false;
    }
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(path.join(process.cwd(), filePath));
      return true;
    } catch {
      return false;
    }
  }
}
