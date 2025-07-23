/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import fsPromises from 'fs/promises';
import * as fs from 'fs';
import * as nodePath from 'path';
import { getFolderStructure } from './getFolderStructure.js';
import * as gitUtils from './gitUtils.js';
import { FileDiscoveryService } from '../services/fileDiscoveryService.js';

vi.mock('path', async (importOriginal) => {
  const original = (await importOriginal()) as typeof nodePath;
  return {
    ...original,
    resolve: vi.fn((str) => str),
    // Other path functions (basename, join, normalize, etc.) will use original implementation
  };
});

vi.mock('fs/promises');
vi.mock('fs');
vi.mock('./gitUtils.js');

// Import 'path' again here, it will be the mocked version
import * as path from 'path';

// Platform-agnostic path constants
const TESTROOT = path.join('/', 'testroot');
const TESTROOT_SUBFOLDER_A = path.join(TESTROOT, 'subfolderA');
const TESTROOT_SUBFOLDER_B = path.join(TESTROOT_SUBFOLDER_A, 'subfolderB');
const TESTROOT_EMPTY_FOLDER = path.join(TESTROOT, 'emptyFolder');
const TESTROOT_NODE_MODULES = path.join(TESTROOT, 'node_modules');
const TESTROOT_MANY_FILES = path.join(TESTROOT, 'manyFilesFolder');
const TESTROOT_MANY_FOLDERS = path.join(TESTROOT, 'manyFolders');
const TESTROOT_DEEP_FOLDERS = path.join(TESTROOT, 'deepFolders');
const TESTROOT_DEEP_LEVEL1 = path.join(TESTROOT_DEEP_FOLDERS, 'level1');
const TESTROOT_DEEP_LEVEL2 = path.join(TESTROOT_DEEP_LEVEL1, 'level2');
const TESTROOT_DEEP_LEVEL3 = path.join(TESTROOT_DEEP_LEVEL2, 'level3');

// Test project paths for gitignore tests
const TEST_PROJECT = path.join('/', 'test', 'project');
const TEST_PROJECT_NODE_MODULES = path.join(TEST_PROJECT, 'node_modules');
const TEST_PROJECT_GEMINI = path.join(TEST_PROJECT, '.gemini');
const TEST_PROJECT_GITIGNORE = path.join(TEST_PROJECT, '.gitignore');
const TEST_PROJECT_GEMINIIGNORE = path.join(TEST_PROJECT, '.geminiignore');

interface TestDirent {
  name: string;
  isFile: () => boolean;
  isDirectory: () => boolean;
  isBlockDevice: () => boolean;
  isCharacterDevice: () => boolean;
  isSymbolicLink: () => boolean;
  isFIFO: () => boolean;
  isSocket: () => boolean;
  path: string;
  parentPath: string;
}

// Helper to create Dirent-like objects for mocking fs.readdir
const createDirent = (name: string, type: 'file' | 'dir'): TestDirent => ({
  name,
  isFile: () => type === 'file',
  isDirectory: () => type === 'dir',
  isBlockDevice: () => false,
  isCharacterDevice: () => false,
  isSymbolicLink: () => false,
  isFIFO: () => false,
  isSocket: () => false,
  path: '',
  parentPath: '',
});

describe('getFolderStructure', () => {
  beforeEach(() => {
    vi.resetAllMocks();

    // path.resolve is now a vi.fn() due to the top-level vi.mock.
    // We ensure its implementation is set for each test (or rely on the one from vi.mock).
    // vi.resetAllMocks() clears call history but not the implementation set by vi.fn() in vi.mock.
    // If we needed to change it per test, we would do it here:
    (path.resolve as Mock).mockImplementation((str: string) => str);

    // Re-apply/define the mock implementation for fsPromises.readdir for each test
    (fsPromises.readdir as Mock).mockImplementation(
      async (dirPath: string | Buffer | URL) => {
        // path.normalize here will use the mocked path module.
        // Since normalize is spread from original, it should be the real one.
        const normalizedPath = path.normalize(dirPath.toString());
        if (mockFsStructure[normalizedPath]) {
          return mockFsStructure[normalizedPath];
        }
        throw Object.assign(
          new Error(
            `ENOENT: no such file or directory, scandir '${normalizedPath}'`,
          ),
          { code: 'ENOENT' },
        );
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks(); // Restores spies (like fsPromises.readdir) and resets vi.fn mocks (like path.resolve)
  });

  const mockFsStructure: Record<string, TestDirent[]> = {
    [TESTROOT]: [
      createDirent('file1.txt', 'file'),
      createDirent('subfolderA', 'dir'),
      createDirent('emptyFolder', 'dir'),
      createDirent('.hiddenfile', 'file'),
      createDirent('node_modules', 'dir'),
    ],
    [TESTROOT_SUBFOLDER_A]: [
      createDirent('fileA1.ts', 'file'),
      createDirent('fileA2.js', 'file'),
      createDirent('subfolderB', 'dir'),
    ],
    [TESTROOT_SUBFOLDER_B]: [createDirent('fileB1.md', 'file')],
    [TESTROOT_EMPTY_FOLDER]: [],
    [TESTROOT_NODE_MODULES]: [createDirent('somepackage', 'dir')],
    [TESTROOT_MANY_FILES]: Array.from({ length: 10 }, (_, i) =>
      createDirent(`file-${i}.txt`, 'file'),
    ),
    [TESTROOT_MANY_FOLDERS]: Array.from({ length: 5 }, (_, i) =>
      createDirent(`folder-${i}`, 'dir'),
    ),
    ...Array.from({ length: 5 }, (_, i) => ({
      [path.join(TESTROOT_MANY_FOLDERS, `folder-${i}`)]: [
        createDirent('child.txt', 'file'),
      ],
    })).reduce((acc, val) => ({ ...acc, ...val }), {}),
    [TESTROOT_DEEP_FOLDERS]: [createDirent('level1', 'dir')],
    [TESTROOT_DEEP_LEVEL1]: [createDirent('level2', 'dir')],
    [TESTROOT_DEEP_LEVEL2]: [createDirent('level3', 'dir')],
    [TESTROOT_DEEP_LEVEL3]: [
      createDirent('file.txt', 'file'),
    ],
  };

  it('should return basic folder structure', async () => {
    const structure = await getFolderStructure(TESTROOT_SUBFOLDER_A);
    const displayPath = TESTROOT_SUBFOLDER_A.replace(/\\/g, '/');
    const expected = `
Showing up to 200 items (files + folders).

${displayPath}/
├───fileA1.ts
├───fileA2.js
└───subfolderB/
    └───fileB1.md
`.trim();
    expect(structure.trim()).toBe(expected);
  });

  it('should handle an empty folder', async () => {
    const structure = await getFolderStructure(TESTROOT_EMPTY_FOLDER);
    const displayPath = TESTROOT_EMPTY_FOLDER.replace(/\\/g, '/');
    const expected = `
Showing up to 200 items (files + folders).

${displayPath}/
`.trim();
    expect(structure.trim()).toBe(expected.trim());
  });

  it('should ignore folders specified in ignoredFolders (default)', async () => {
    const structure = await getFolderStructure(TESTROOT);
    const displayPath = TESTROOT.replace(/\\/g, '/');
    const expected = `
Showing up to 200 items (files + folders). Folders or files indicated with ... contain more items not shown, were ignored, or the display limit (200 items) was reached.

${displayPath}/
├───.hiddenfile
├───file1.txt
├───emptyFolder/
├───node_modules/...
└───subfolderA/
    ├───fileA1.ts
    ├───fileA2.js
    └───subfolderB/
        └───fileB1.md
`.trim();
    expect(structure.trim()).toBe(expected);
  });

  it('should ignore folders specified in custom ignoredFolders', async () => {
    const structure = await getFolderStructure(TESTROOT, {
      ignoredFolders: new Set(['subfolderA', 'node_modules']),
    });
    const displayPath = TESTROOT.replace(/\\/g, '/');
    const expected = `
Showing up to 200 items (files + folders). Folders or files indicated with ... contain more items not shown, were ignored, or the display limit (200 items) was reached.

${displayPath}/
├───.hiddenfile
├───file1.txt
├───emptyFolder/
├───node_modules/...
└───subfolderA/...
`.trim();
    expect(structure.trim()).toBe(expected);
  });

  it('should filter files by fileIncludePattern', async () => {
    const structure = await getFolderStructure(TESTROOT_SUBFOLDER_A, {
      fileIncludePattern: /\.ts$/,
    });
    const displayPath = TESTROOT_SUBFOLDER_A.replace(/\\/g, '/');
    const expected = `
Showing up to 200 items (files + folders).

${displayPath}/
├───fileA1.ts
└───subfolderB/
`.trim();
    expect(structure.trim()).toBe(expected);
  });

  it('should handle maxItems truncation for files within a folder', async () => {
    const structure = await getFolderStructure(TESTROOT_SUBFOLDER_A, {
      maxItems: 3,
    });
    const displayPath = TESTROOT_SUBFOLDER_A.replace(/\\/g, '/');
    const expected = `
Showing up to 3 items (files + folders).

${displayPath}/
├───fileA1.ts
├───fileA2.js
└───subfolderB/
`.trim();
    expect(structure.trim()).toBe(expected);
  });

  it('should handle maxItems truncation for subfolders', async () => {
    const structure = await getFolderStructure(TESTROOT_MANY_FOLDERS, {
      maxItems: 4,
    });
    const displayPath = TESTROOT_MANY_FOLDERS.replace(/\\/g, '/');
    const expectedRevised = `
Showing up to 4 items (files + folders). Folders or files indicated with ... contain more items not shown, were ignored, or the display limit (4 items) was reached.

${displayPath}/
├───folder-0/
├───folder-1/
├───folder-2/
├───folder-3/
└───...
`.trim();
    expect(structure.trim()).toBe(expectedRevised);
  });

  it('should handle maxItems that only allows the root folder itself', async () => {
    const structure = await getFolderStructure(TESTROOT_SUBFOLDER_A, {
      maxItems: 1,
    });
    const displayPath = TESTROOT_SUBFOLDER_A.replace(/\\/g, '/');
    const expectedRevisedMax1 = `
Showing up to 1 items (files + folders). Folders or files indicated with ... contain more items not shown, were ignored, or the display limit (1 items) was reached.

${displayPath}/
├───fileA1.ts
├───...
└───...
`.trim();
    expect(structure.trim()).toBe(expectedRevisedMax1);
  });

  it('should handle nonexistent directory', async () => {
    // Temporarily make fsPromises.readdir throw ENOENT for this specific path
    const originalReaddir = fsPromises.readdir;
    (fsPromises.readdir as Mock).mockImplementation(
      async (p: string | Buffer | URL) => {
        if (p === '/nonexistent') {
          throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
        }
        return originalReaddir(p);
      },
    );

    const structure = await getFolderStructure('/nonexistent');
    expect(structure).toContain(
      'Error: Could not read directory "/nonexistent"',
    );
  });

  it('should handle deep folder structure within limits', async () => {
    const structure = await getFolderStructure(TESTROOT_DEEP_FOLDERS, {
      maxItems: 10,
    });
    const displayPath = TESTROOT_DEEP_FOLDERS.replace(/\\/g, '/');
    const expected = `
Showing up to 10 items (files + folders).

${displayPath}/
└───level1/
    └───level2/
        └───level3/
            └───file.txt
`.trim();
    expect(structure.trim()).toBe(expected);
  });

  it('should truncate deep folder structure if maxItems is small', async () => {
    const structure = await getFolderStructure(TESTROOT_DEEP_FOLDERS, {
      maxItems: 3,
    });
    const displayPath = TESTROOT_DEEP_FOLDERS.replace(/\\/g, '/');
    const expected = `
Showing up to 3 items (files + folders).

${displayPath}/
└───level1/
    └───level2/
        └───level3/
`.trim();
    expect(structure.trim()).toBe(expected);
  });
});

describe('getFolderStructure gitignore', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (path.resolve as Mock).mockImplementation((str: string) => str);

    (fsPromises.readdir as Mock).mockImplementation(async (p) => {
      const path = p.toString();
      if (path === TEST_PROJECT) {
        return [
          createDirent('file1.txt', 'file'),
          createDirent('node_modules', 'dir'),
          createDirent('ignored.txt', 'file'),
          createDirent('gem_ignored.txt', 'file'),
          createDirent('.gemini', 'dir'),
        ] as any;
      }
      if (path === TEST_PROJECT_NODE_MODULES) {
        return [createDirent('some-package', 'dir')] as any;
      }
      if (path === TEST_PROJECT_GEMINI) {
        return [
          createDirent('config.yaml', 'file'),
          createDirent('logs.json', 'file'),
        ] as any;
      }
      return [];
    });

    (fs.readFileSync as Mock).mockImplementation((p) => {
      const path = p.toString();
      if (path === TEST_PROJECT_GITIGNORE) {
        return 'ignored.txt\nnode_modules/\n.gemini/\n!/.gemini/config.yaml';
      }
      if (path === TEST_PROJECT_GEMINIIGNORE) {
        return 'gem_ignored.txt\nnode_modules/\n.gemini/\n!/.gemini/config.yaml';
      }
      return '';
    });

    vi.mocked(gitUtils.isGitRepository).mockReturnValue(true);
  });

  it('should ignore files and folders specified in .gitignore', async () => {
    const fileService = new FileDiscoveryService(TEST_PROJECT);
    const structure = await getFolderStructure(TEST_PROJECT, {
      fileService,
    });
    expect(structure).not.toContain('ignored.txt');
    expect(structure).toContain('node_modules/...');
    expect(structure).not.toContain('logs.json');
  });

  it('should not ignore files if respectGitIgnore is false', async () => {
    const fileService = new FileDiscoveryService(TEST_PROJECT);
    const structure = await getFolderStructure(TEST_PROJECT, {
      fileService,
      fileFilteringOptions: {
        respectGeminiIgnore: false,
        respectGitIgnore: false,
      },
    });
    expect(structure).toContain('ignored.txt');
    // node_modules is still ignored by default
    expect(structure).toContain('node_modules/...');
  });

  it('should ignore files and folders specified in .geminiignore', async () => {
    const fileService = new FileDiscoveryService(TEST_PROJECT);
    const structure = await getFolderStructure(TEST_PROJECT, {
      fileService,
    });
    expect(structure).not.toContain('gem_ignored.txt');
    expect(structure).toContain('node_modules/...');
    expect(structure).not.toContain('logs.json');
  });

  it('should not ignore files if respectGeminiIgnore is false', async () => {
    const fileService = new FileDiscoveryService(TEST_PROJECT);
    const structure = await getFolderStructure(TEST_PROJECT, {
      fileService,
      fileFilteringOptions: {
        respectGeminiIgnore: false,
        respectGitIgnore: true, // Explicitly disable gemini ignore only
      },
    });
    expect(structure).toContain('gem_ignored.txt');
    // node_modules is still ignored by default
    expect(structure).toContain('node_modules/...');
  });
});
