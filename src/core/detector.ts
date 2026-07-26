import * as fs from 'fs/promises';
import * as path from 'path';

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

export class ProjectDetector {
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
    if (await this.fileExists('ios') || await this.fileExists('android')) {
      return 'mobile';
    }
    if (await this.fileExists('pubspec.yaml')) {
      return 'mobile';
    }

    // Check for CLI
    if (await this.fileExists('bin') || await this.hasBinInPackageJson()) {
      return 'cli';
    }

    // Check for library
    if (await this.fileExists('lib') && !await this.fileExists('src')) {
      return 'library';
    }

    // Check for API
    if (await this.fileExists('server') || await this.fileExists('api')) {
      return 'api';
    }

    // Check for web
    if (await this.fileExists('public') || await this.fileExists('src')) {
      return 'web';
    }

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

    // Check package.json dependencies
    try {
      const packageJsonPath = path.join(process.cwd(), 'package.json');
      const content = await fs.readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(content);
      
      const allDeps = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      };

      if (allDeps['react']) frameworks.push('react');
      if (allDeps['vue']) frameworks.push('vue');
      if (allDeps['angular']) frameworks.push('angular');
      if (allDeps['next']) frameworks.push('nextjs');
      if (allDeps['nuxt']) frameworks.push('nuxtjs');
      if (allDeps['express']) frameworks.push('express');
      if (allDeps['fastify']) frameworks.push('fastify');
      if (allDeps['nestjs']) frameworks.push('nestjs');
      if (allDeps['electron']) frameworks.push('electron');
      if (allDeps['tauri']) frameworks.push('tauri');
    } catch {
      // No package.json
    }

    // Check for Python frameworks
    if (await this.fileExists('requirements.txt') || await this.fileExists('pyproject.toml')) {
      try {
        const requirementsPath = await this.fileExists('requirements.txt') 
          ? 'requirements.txt' 
          : 'pyproject.toml';
        const content = await fs.readFile(requirementsPath, 'utf-8');
        
        if (content.includes('django')) frameworks.push('django');
        if (content.includes('flask')) frameworks.push('flask');
        if (content.includes('fastapi')) frameworks.push('fastapi');
      } catch {
        // Error reading file
      }
    }

    // Check for Rust frameworks
    if (await this.fileExists('Cargo.toml')) {
      try {
        const content = await fs.readFile('Cargo.toml', 'utf-8');
        if (content.includes('actix')) frameworks.push('actix');
        if (content.includes('axum')) frameworks.push('axum');
        if (content.includes('rocket')) frameworks.push('rocket');
      } catch {
        // Error reading file
      }
    }

    return frameworks;
  }

  private async detectLanguages(): Promise<string[]> {
    const languages: string[] = [];

    // Check file extensions
    const files = await this.getFiles();
    const extensions = new Set(files.map(f => path.extname(f).toLowerCase()));

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
    if (await this.fileExists('pyproject.toml') || await this.fileExists('setup.py')) {
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

  private async getFiles(): Promise<string[]> {
    const files: string[] = [];
    
    try {
      const items = await fs.readdir(process.cwd(), { withFileTypes: true });
      
      for (const item of items) {
        if (item.isFile() && !item.name.startsWith('.')) {
          files.push(item.name);
        }
      }
    } catch {
      // Error reading directory
    }

    return files;
  }

  private async detectOpenClaw(): Promise<boolean> {
    try {
      const os = await import('os');
      const path = await import('path');
      const fs = await import('fs/promises');
      const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
      await fs.access(configPath);
      return true;
    } catch {
      return false;
    }
  }

  private async detectHermes(): Promise<boolean> {
    try {
      const os = await import('os');
      const path = await import('path');
      const fs = await import('fs/promises');
      const configPath = path.join(os.homedir(), '.hermes', 'config.yaml');
      await fs.access(configPath);
      return true;
    } catch {
      return false;
    }
  }

  private async detectClaudeCode(): Promise<boolean> {
    try {
      const os = await import('os');
      const path = await import('path');
      const fs = await import('fs/promises');
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

  private async detectCopilot(): Promise<boolean> {
    try {
      const configPath = path.join(process.cwd(), '.github', 'copilot-instructions.md');
      await fs.access(configPath);
      return true;
    } catch {
      return false;
    }
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
