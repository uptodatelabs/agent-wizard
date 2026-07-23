import { AgentConfig, Agent } from '../core/types';

export interface CopilotInstructions {
  repositoryWide: string;
  pathSpecific: CopilotPathInstruction[];
}

export interface CopilotPathInstruction {
  name: string;
  applyTo: string;
  content: string;
  excludeAgent?: string;
}

export interface CopilotConfig {
  instructions: string;
  pathInstructions: CopilotPathInstruction[];
}

export class CopilotAdapter {
  name = 'copilot';
  configPath = '.github/copilot-instructions.md';
  format = 'markdown';

  private readonly instructionsDir = '.github/instructions';
  private readonly instructionsFile = '.github/copilot-instructions.md';

  async detect(): Promise<boolean> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      
      const instructionsPath = path.join(process.cwd(), '.github', 'copilot-instructions.md');
      try {
        await fs.access(instructionsPath);
        return true;
      } catch {
        // Check for instructions directory
        const instructionsDir = path.join(process.cwd(), '.github', 'instructions');
        try {
          await fs.access(instructionsDir);
          return true;
        } catch {
          return false;
        }
      }
    } catch {
      return false;
    }
  }

  async read(): Promise<AgentConfig> {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    let instructions = '';
    const pathInstructions: CopilotPathInstruction[] = [];

    // Read repository-wide instructions
    try {
      const instructionsPath = path.join(process.cwd(), '.github', 'copilot-instructions.md');
      instructions = await fs.readFile(instructionsPath, 'utf-8');
    } catch {
      // File doesn't exist
    }

    // Read path-specific instructions
    try {
      const instructionsDir = path.join(process.cwd(), '.github', 'instructions');
      const files = await fs.readdir(instructionsDir);
      
      for (const file of files) {
        if (file.endsWith('.instructions.md')) {
          const filePath = path.join(instructionsDir, file);
          const content = await fs.readFile(filePath, 'utf-8');
          const parsed = this.parsePathInstruction(file, content);
          if (parsed) {
            pathInstructions.push(parsed);
          }
        }
      }
    } catch {
      // Directory doesn't exist
    }

    return this.toAgentConfig({ instructions, pathInstructions });
  }

  async write(config: AgentConfig): Promise<void> {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    const copilotConfig = this.fromAgentConfig(config);
    
    // Write repository-wide instructions
    const instructionsPath = path.join(process.cwd(), '.github', 'copilot-instructions.md');
    await fs.mkdir(path.dirname(instructionsPath), { recursive: true });
    await fs.writeFile(instructionsPath, copilotConfig.instructions);

    // Write path-specific instructions
    if (copilotConfig.pathInstructions.length > 0) {
      const instructionsDir = path.join(process.cwd(), '.github', 'instructions');
      await fs.mkdir(instructionsDir, { recursive: true });
      
      for (const instruction of copilotConfig.pathInstructions) {
        const fileName = `${instruction.name}.instructions.md`;
        const filePath = path.join(instructionsDir, fileName);
        const content = this.toPathInstructionFile(instruction);
        await fs.writeFile(filePath, content);
      }
    }
  }

  async validate(): Promise<{ valid: boolean; errors: string[] }> {
    try {
      await this.read();
      return { valid: true, errors: [] };
    } catch (error) {
      return { 
        valid: false, 
        errors: [error instanceof Error ? error.message : 'Unknown error'] 
      };
    }
  }

  private parsePathInstruction(fileName: string, content: string): CopilotPathInstruction | null {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    
    if (!frontmatterMatch) {
      return null;
    }

    const frontmatter = frontmatterMatch[1];
    const body = frontmatterMatch[2].trim();
    
    const applyToMatch = frontmatter.match(/applyTo:\s*"?([^"\n]+)"?\s*$/m);
    const excludeAgentMatch = frontmatter.match(/excludeAgent:\s*"?([^"\n]+)"?\s*$/m);
    
    const name = fileName.replace('.instructions.md', '');
    
    return {
      name,
      applyTo: applyToMatch?.[1] || '**/*',
      content: body,
      excludeAgent: excludeAgentMatch?.[1],
    };
  }

  private toPathInstructionFile(instruction: CopilotPathInstruction): string {
    let frontmatter = `applyTo: "${instruction.applyTo}"`;
    if (instruction.excludeAgent) {
      frontmatter += `\nexcludeAgent: "${instruction.excludeAgent}"`;
    }
    
    return `---
${frontmatter}
---

${instruction.content}
`;
  }

  private toAgentConfig(copilotConfig: CopilotConfig): AgentConfig {
    const agents: Agent[] = [];
    
    // Combine all instructions into agent instructions
    const allInstructions = [copilotConfig.instructions];
    
    for (const pathInstruction of copilotConfig.pathInstructions) {
      allInstructions.push(`## ${pathInstruction.name} (${pathInstruction.applyTo})\n\n${pathInstruction.content}`);
    }

    const combinedInstructions = allInstructions.filter(i => i).join('\n\n');

    if (combinedInstructions) {
      agents.push({
        id: 'copilot-agent',
        name: 'GitHub Copilot Agent',
        role: 'coder',
        model: 'copilot-default',
        instructions: combinedInstructions,
        tools: [],
        guardrails: [],
      });
    }

    return {
      project: {
        name: 'copilot-project',
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

  private fromAgentConfig(config: AgentConfig): CopilotConfig {
    let instructions = '';
    const pathInstructions: CopilotPathInstruction[] = [];
    
    for (const agent of config.agents) {
      if (agent.instructions) {
        instructions += `# ${agent.name}\n\n${agent.instructions}\n\n`;
      }
    }

    if (!instructions) {
      instructions = '# AgentWizard Rules\n\nThis file was generated by AgentWizard.';
    }

    return { instructions, pathInstructions };
  }

  async readInstructions(): Promise<string> {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    const instructionsPath = path.join(process.cwd(), '.github', 'copilot-instructions.md');
    
    try {
      return await fs.readFile(instructionsPath, 'utf-8');
    } catch {
      return '';
    }
  }

  async writeInstructions(content: string): Promise<void> {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    const instructionsPath = path.join(process.cwd(), '.github', 'copilot-instructions.md');
    await fs.mkdir(path.dirname(instructionsPath), { recursive: true });
    await fs.writeFile(instructionsPath, content);
  }

  async readPathInstructions(): Promise<CopilotPathInstruction[]> {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    const instructions: CopilotPathInstruction[] = [];
    
    try {
      const instructionsDir = path.join(process.cwd(), '.github', 'instructions');
      const files = await fs.readdir(instructionsDir);
      
      for (const file of files) {
        if (file.endsWith('.instructions.md')) {
          const filePath = path.join(instructionsDir, file);
          const content = await fs.readFile(filePath, 'utf-8');
          const parsed = this.parsePathInstruction(file, content);
          if (parsed) {
            instructions.push(parsed);
          }
        }
      }
    } catch {
      // Directory doesn't exist
    }

    return instructions;
  }

  async writePathInstruction(name: string, instruction: CopilotPathInstruction): Promise<void> {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    const instructionsDir = path.join(process.cwd(), '.github', 'instructions');
    await fs.mkdir(instructionsDir, { recursive: true });
    
    const fileName = `${name}.instructions.md`;
    const filePath = path.join(instructionsDir, fileName);
    const content = this.toPathInstructionFile(instruction);
    await fs.writeFile(filePath, content);
  }

  async deletePathInstruction(name: string): Promise<void> {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    const filePath = path.join(process.cwd(), '.github', 'instructions', `${name}.instructions.md`);
    await fs.unlink(filePath);
  }
}
