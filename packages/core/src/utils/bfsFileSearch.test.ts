/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import * as fsPromises from 'fs/promises';
import * as gitUtils from './gitUtils.js';
import { bfsFileSearch } from './bfsFileSearch.js';
import { FileDiscoveryService } from '../services/fileDiscoveryService.js';

vi.mock('fs');
vi.mock('fs/promises');
vi.mock('./gitUtils.js');

const createMockDirent = (name: string, isFile: boolean): fs.Dirent => {
  const dirent = new fs.Dirent();
  dirent.name = name;
  dirent.isFile = () => isFile;
  dirent.isDirectory = () => !isFile;
  return dirent;
};

// Type for the specific overload we're using
type ReaddirWithFileTypes = (
  path: fs.PathLike,
  options: { withFileTypes: true },
) => Promise<fs.Dirent[]>;

describe('bfsFileSearch', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should find a file in the root directory', async () => {
    const mockFs = vi.mocked(fsPromises);
    const mockReaddir = mockFs.readdir as unknown as ReaddirWithFileTypes;
    vi.mocked(mockReaddir).mockResolvedValue([
      createMockDirent('file1.txt', true),
      createMockDirent('file2.txt', true),
    ]);

    const testPath = path.join('/', 'test');
    const result = await bfsFileSearch(testPath, { fileName: 'file1.txt' });
    expect(result).toEqual([path.join(testPath, 'file1.txt')]);
  });

  it('should find a file in a subdirectory', async () => {
    const mockFs = vi.mocked(fsPromises);
    const mockReaddir = mockFs.readdir as unknown as ReaddirWithFileTypes;
    const testPath = path.join('/', 'test');
    const subdirPath = path.join(testPath, 'subdir');
    
    vi.mocked(mockReaddir).mockImplementation(async (dir) => {
      if (dir === testPath) {
        return [createMockDirent('subdir', false)];
      }
      if (dir === subdirPath) {
        return [createMockDirent('file1.txt', true)];
      }
      return [];
    });

    const result = await bfsFileSearch(testPath, { fileName: 'file1.txt' });
    expect(result).toEqual([path.join(subdirPath, 'file1.txt')]);
  });

  it('should ignore specified directories', async () => {
    const mockFs = vi.mocked(fsPromises);
    const mockReaddir = mockFs.readdir as unknown as ReaddirWithFileTypes;
    const testPath = path.join('/', 'test');
    const subdir1Path = path.join(testPath, 'subdir1');
    const subdir2Path = path.join(testPath, 'subdir2');
    
    vi.mocked(mockReaddir).mockImplementation(async (dir) => {
      if (dir === testPath) {
        return [
          createMockDirent('subdir1', false),
          createMockDirent('subdir2', false),
        ];
      }
      if (dir === subdir1Path) {
        return [createMockDirent('file1.txt', true)];
      }
      if (dir === subdir2Path) {
        return [createMockDirent('file1.txt', true)];
      }
      return [];
    });

    const result = await bfsFileSearch(testPath, {
      fileName: 'file1.txt',
      ignoreDirs: ['subdir2'],
    });
    expect(result).toEqual([path.join(subdir1Path, 'file1.txt')]);
  });

  it('should respect maxDirs limit', async () => {
    const mockFs = vi.mocked(fsPromises);
    const mockReaddir = mockFs.readdir as unknown as ReaddirWithFileTypes;
    const testPath = path.join('/', 'test');
    const subdir1Path = path.join(testPath, 'subdir1');
    const subdir2Path = path.join(testPath, 'subdir2');
    
    vi.mocked(mockReaddir).mockImplementation(async (dir) => {
      if (dir === testPath) {
        return [
          createMockDirent('subdir1', false),
          createMockDirent('subdir2', false),
        ];
      }
      if (dir === subdir1Path) {
        return [createMockDirent('file1.txt', true)];
      }
      if (dir === subdir2Path) {
        return [createMockDirent('file1.txt', true)];
      }
      return [];
    });

    const result = await bfsFileSearch(testPath, {
      fileName: 'file1.txt',
      maxDirs: 2,
    });
    expect(result).toEqual([path.join(subdir1Path, 'file1.txt')]);
  });

  it('should respect .gitignore files', async () => {
    const mockFs = vi.mocked(fsPromises);
    const mockGitUtils = vi.mocked(gitUtils);
    mockGitUtils.isGitRepository.mockReturnValue(true);
    const testPath = path.join('/', 'test');
    const subdir1Path = path.join(testPath, 'subdir1');
    const subdir2Path = path.join(testPath, 'subdir2');
    
    const mockReaddir = mockFs.readdir as unknown as ReaddirWithFileTypes;
    vi.mocked(mockReaddir).mockImplementation(async (dir) => {
      if (dir === testPath) {
        return [
          createMockDirent('.gitignore', true),
          createMockDirent('subdir1', false),
          createMockDirent('subdir2', false),
        ];
      }
      if (dir === subdir1Path) {
        return [createMockDirent('file1.txt', true)];
      }
      if (dir === subdir2Path) {
        return [createMockDirent('file1.txt', true)];
      }
      return [];
    });
    vi.mocked(fs).readFileSync.mockReturnValue('subdir2');

    const fileService = new FileDiscoveryService(testPath);
    const result = await bfsFileSearch(testPath, {
      fileName: 'file1.txt',
      fileService,
    });
    expect(result).toEqual([path.join(subdir1Path, 'file1.txt')]);
  });

  it('should respect .geminiignore files', async () => {
    const mockFs = vi.mocked(fsPromises);
    const mockGitUtils = vi.mocked(gitUtils);

    mockGitUtils.isGitRepository.mockReturnValue(false);

    const testPath = path.join('/', 'test');
    const subdir1Path = path.join(testPath, 'subdir1');
    const subdir2Path = path.join(testPath, 'subdir2');

    const mockReaddir = mockFs.readdir as unknown as ReaddirWithFileTypes;
    vi.mocked(mockReaddir).mockImplementation(async (dir) => {
      if (dir === testPath) {
        return [
          createMockDirent('.geminiignore', true),
          createMockDirent('subdir1', false),
          createMockDirent('subdir2', false),
        ];
      }
      if (dir === subdir1Path) {
        return [createMockDirent('file1.txt', true)];
      }
      if (dir === subdir2Path) {
        return [createMockDirent('file1.txt', true)];
      }
      return [];
    });

    vi.mocked(fs).readFileSync.mockReturnValue('subdir2');

    const fileService = new FileDiscoveryService(testPath);
    const result = await bfsFileSearch(testPath, {
      fileName: 'file1.txt',
      fileService,
      fileFilteringOptions: {
        respectGitIgnore: true,
        respectGeminiIgnore: true,
      },
    });

    expect(result).toEqual([path.join(subdir1Path, 'file1.txt')]);
  });
});
