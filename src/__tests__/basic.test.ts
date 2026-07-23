import { describe, it, expect } from 'vitest';
import { OpenClawAdapter } from '../adapters/openclaw';
import { HermesAdapter } from '../adapters/hermes';
import { ClaudeCodeAdapter } from '../adapters/claude-code';
import { CursorAdapter } from '../adapters/cursor';
import { CopilotAdapter } from '../adapters/copilot';
import { AiderAdapter } from '../adapters/aider';
import { ProjectDetector } from '../core/detector';
import { ProfileManagerImpl } from '../core/profile-manager';
import { StatusAdapter } from '../core/status-adapter';

describe('Adapters', () => {
  describe('OpenClawAdapter', () => {
    it('should have correct name', () => {
      const adapter = new OpenClawAdapter();
      expect(adapter.name).toBe('openclaw');
    });

    it('should have correct format', () => {
      const adapter = new OpenClawAdapter();
      expect(adapter.format).toBe('json5');
    });
  });

  describe('HermesAdapter', () => {
    it('should have correct name', () => {
      const adapter = new HermesAdapter();
      expect(adapter.name).toBe('hermes');
    });

    it('should have correct format', () => {
      const adapter = new HermesAdapter();
      expect(adapter.format).toBe('yaml');
    });
  });

  describe('ClaudeCodeAdapter', () => {
    it('should have correct name', () => {
      const adapter = new ClaudeCodeAdapter();
      expect(adapter.name).toBe('claude-code');
    });

    it('should have correct format', () => {
      const adapter = new ClaudeCodeAdapter();
      expect(adapter.format).toBe('json');
    });
  });

  describe('CursorAdapter', () => {
    it('should have correct name', () => {
      const adapter = new CursorAdapter();
      expect(adapter.name).toBe('cursor');
    });

    it('should have correct format', () => {
      const adapter = new CursorAdapter();
      expect(adapter.format).toBe('mdc');
    });
  });

  describe('CopilotAdapter', () => {
    it('should have correct name', () => {
      const adapter = new CopilotAdapter();
      expect(adapter.name).toBe('copilot');
    });

    it('should have correct format', () => {
      const adapter = new CopilotAdapter();
      expect(adapter.format).toBe('markdown');
    });
  });

  describe('AiderAdapter', () => {
    it('should have correct name', () => {
      const adapter = new AiderAdapter();
      expect(adapter.name).toBe('aider');
    });

    it('should have correct format', () => {
      const adapter = new AiderAdapter();
      expect(adapter.format).toBe('yaml');
    });
  });
});

describe('ProjectDetector', () => {
  it('should detect project', async () => {
    const detector = new ProjectDetector();
    const info = await detector.detect();
    
    expect(info).toHaveProperty('name');
    expect(info).toHaveProperty('type');
    expect(info).toHaveProperty('languages');
    expect(info).toHaveProperty('frameworks');
  });
});

describe('ProfileManager', () => {
  it('should list profiles', async () => {
    const manager = new ProfileManagerImpl();
    const profiles = await manager.listProfiles();
    
    expect(Array.isArray(profiles)).toBe(true);
  });
});

describe('StatusAdapter', () => {
  it('should get all statuses', async () => {
    const adapter = new StatusAdapter();
    const data = await adapter.getAllStatuses();
    
    expect(data).toHaveProperty('toolStatuses');
    expect(data).toHaveProperty('totalAgents');
    expect(data).toHaveProperty('activeTools');
    expect(data).toHaveProperty('lastUpdated');
    expect(Array.isArray(data.toolStatuses)).toBe(true);
    expect(data.toolStatuses.length).toBe(6);
  });
});
