import { AgentConfig, Agent } from '../core/types';
import { cursorMdcFrontmatterSchema, validateWithSchema } from '../schemas/tool-schemas';
import { backupFile } from '../core/backup';

export interface CursorRule {
  description: string;
  globs: string | string[];
  alwaysApply: boolean;
  content: string;
}

export interface CursorConfig {
  rules: CursorRule[];
}

export class CursorAdapter {
  name = 'cursor';
  configPath = '.cursor/rules/';
  format = 'mdc';

  async detect(): Promise<boolean> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      
      const rulesDir = path.join(process.cwd(), '.cursor', 'rules');
      await fs.access(rulesDir);
      return true;
    } catch {
      return false;
    }
  }

  async read(): Promise<AgentConfig> {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    const rulesDir = path.join(process.cwd(), '.cursor', 'rules');
    const rules: CursorRule[] = [];
    
    try {
      const files = await fs.readdir(rulesDir);
      
      for (const file of files) {
        if (file.endsWith('.mdc')) {
          const filePath = path.join(rulesDir, file);
          const content = await fs.readFile(filePath, 'utf-8');
          const rule = this.parseMdcFile(content);
          if (rule) {
            rules.push(rule);
          }
        }
      }
    } catch {
      // Rules directory doesn't exist
    }

    return this.toAgentConfig({ rules });
  }

  async write(config: AgentConfig): Promise<void> {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    const cursorConfig = this.fromAgentConfig(config);
    const rulesDir = path.join(process.cwd(), '.cursor', 'rules');
    
    await fs.mkdir(rulesDir, { recursive: true });
    
    for (let i = 0; i < cursorConfig.rules.length; i++) {
      const rule = cursorConfig.rules[i];
      const fileName = `agent-wizard-${i + 1}.mdc`;
      const filePath = path.join(rulesDir, fileName);
      const content = this.toMdcFile(rule);
      // Never overwrite an existing rule without a restore point.
      await backupFile(filePath);
      await fs.writeFile(filePath, content);
    }
  }

  async validate(): Promise<{ valid: boolean; errors: string[] }> {
    try {
      const path = await import('path');
      const fs = await import('fs/promises');
      const rulesDir = path.join(process.cwd(), '.cursor', 'rules');
      let files: string[];
      try {
        files = await fs.readdir(rulesDir);
      } catch {
        return { valid: false, errors: ['No .cursor/rules directory found'] };
      }
      const mdcFiles = files.filter(f => f.endsWith('.mdc'));
      if (mdcFiles.length === 0) {
        return { valid: false, errors: ['No .mdc rule files found in .cursor/rules'] };
      }
      const errors: string[] = [];
      for (const file of mdcFiles) {
        const content = await fs.readFile(path.join(rulesDir, file), 'utf-8');
        const rule = this.parseMdcFile(content);
        if (!rule) {
          errors.push(`${file}: invalid frontmatter (expected --- ... --- block)`);
          continue;
        }
        // Validate the frontmatter fields (description/globs/alwaysApply types).
        const frontmatter = this.parseFrontmatter(content);
        if (frontmatter) {
          const check = validateWithSchema(cursorMdcFrontmatterSchema, frontmatter);
          for (const err of check.errors) {
            errors.push(`${file}: ${err}`);
          }
        }
      }
      return { valid: errors.length === 0, errors };
    } catch (error) {
      return {
        valid: false,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
      };
    }
  }

  /**
   * Parse a single `.mdc` file. Exposed so status reporting reuses this parser
   * instead of keeping its own copy of the frontmatter regex.
   */
  parseRule(content: string): CursorRule | null {
    return this.parseMdcFile(content);
  }

  /** Extract the raw frontmatter block as key/value pairs for schema checks. */
  private parseFrontmatter(content: string): Record<string, unknown> | null {
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) {
      return null;
    }
    const frontmatter: Record<string, unknown> = {};
    for (const line of match[1].split('\n')) {
      const idx = line.indexOf(':');
      if (idx < 0) continue;
      const key = line.slice(0, idx).trim();
      if (!key) continue;
      let raw = line.slice(idx + 1).trim();
      raw = raw.replace(/^"|"$/g, '');
      if (key === 'alwaysApply') {
        frontmatter.alwaysApply = raw === 'true';
      } else if (key === 'globs') {
        frontmatter.globs = raw.includes(',') ? raw.split(',').map((s) => s.trim()) : raw;
      } else {
        frontmatter[key] = raw;
      }
    }
    return frontmatter;
  }

  private parseMdcFile(content: string): CursorRule | null {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    
    if (!frontmatterMatch) {
      return null;
    }

    const frontmatter = frontmatterMatch[1];
    const body = frontmatterMatch[2].trim();
    
    const descriptionMatch = frontmatter.match(/description:\s*"?(.*?)"?\s*$/m);
    const globsMatch = frontmatter.match(/globs:\s*(.*?)$/m);
    const alwaysApplyMatch = frontmatter.match(/alwaysApply:\s*(true|false)$/m);
    
    return {
      description: descriptionMatch?.[1] || '',
      globs: globsMatch?.[1] || '**/*',
      alwaysApply: alwaysApplyMatch?.[1] === 'true',
      content: body,
    };
  }

  private toMdcFile(rule: CursorRule): string {
    const globsStr = Array.isArray(rule.globs) ? rule.globs.join(', ') : rule.globs;
    
    return `---
description: "${rule.description}"
globs: ${globsStr}
alwaysApply: ${rule.alwaysApply}
---

${rule.content}
`;
  }

  private toAgentConfig(cursorConfig: CursorConfig): AgentConfig {
    const agents: Agent[] = [];
    
    // Combine all rules into agent instructions
    const instructions = cursorConfig.rules
      .map(rule => `## ${rule.description}\n\n${rule.content}`)
      .join('\n\n');

    if (instructions) {
      agents.push({
        id: 'cursor-agent',
        name: 'Cursor Agent',
        role: 'coder',
        model: 'cursor-default',
        instructions,
        tools: [],
        guardrails: [],
      });
    }

    return {
      project: {
        name: 'cursor-project',
        type: 'web',
        framework: [],
        language: [],
      },
      agents,
      skills: [],
      permissions: {
        allow: [],
        deny: [],
      },
      hooks: {},
      mcp: [],
    };
  }

  private fromAgentConfig(config: AgentConfig): CursorConfig {
    const rules: CursorRule[] = [];
    
    for (const agent of config.agents) {
      if (agent.instructions) {
        rules.push({
          description: agent.name,
          globs: '**/*',
          alwaysApply: false,
          content: agent.instructions,
        });
      }
    }

    if (rules.length === 0) {
      rules.push({
        description: 'AgentWizard generated rule',
        globs: '**/*',
        alwaysApply: false,
        content: '# AgentWizard Rules\n\nThis file was generated by AgentWizard.',
      });
    }

    return { rules };
  }

  async readRules(): Promise<CursorRule[]> {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    const rulesDir = path.join(process.cwd(), '.cursor', 'rules');
    const rules: CursorRule[] = [];
    
    try {
      const files = await fs.readdir(rulesDir);
      
      for (const file of files) {
        if (file.endsWith('.mdc')) {
          const filePath = path.join(rulesDir, file);
          const content = await fs.readFile(filePath, 'utf-8');
          const rule = this.parseMdcFile(content);
          if (rule) {
            rules.push(rule);
          }
        }
      }
    } catch {
      // Rules directory doesn't exist
    }

    return rules;
  }

  async writeRule(name: string, rule: CursorRule): Promise<void> {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    const rulesDir = path.join(process.cwd(), '.cursor', 'rules');
    await fs.mkdir(rulesDir, { recursive: true });
    
    const fileName = `${name}.mdc`;
    const filePath = path.join(rulesDir, fileName);
    const content = this.toMdcFile(rule);
    await backupFile(filePath);
    await fs.writeFile(filePath, content);
  }

  async deleteRule(name: string): Promise<void> {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    const filePath = path.join(process.cwd(), '.cursor', 'rules', `${name}.mdc`);
    await fs.unlink(filePath);
  }
}
