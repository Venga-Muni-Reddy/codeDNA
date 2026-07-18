import fs from 'fs';
import path from 'path';
import { Project } from '../models/Project';
import { FileNode } from '../models/FileNode';
import { ScanResult, ISecurityIssue } from '../models/ScanResult';
import { detectTechStack } from './detector';
import { parseJsTsFile, parseFallbackFile } from './parser';
import { scanSecurity } from './security';

const IGNORED_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  '.github',
  'dist',
  'build',
  'venv',
  '.env',
  'uploads',
  'projects',
  'temp',
  '__pycache__',
  '.metadata',
]);

const PARSEABLE_JS_TS = new Set(['.js', '.jsx', '.ts', '.tsx']);
const PARSEABLE_FALLBACK = new Set(['.py', '.java']);

export const scanProject = async (projectId: string, projectDir: string): Promise<void> => {
  try {
    console.log(`[Scanner] Ingestion scan starting for Project ID: ${projectId}`);
    
    // 1. Detect Stack
    const techStack = await detectTechStack(projectDir);
    
    // 2. Walk directory tree
    let linesOfCode = 0;
    let fileCount = 0;
    let folderCount = 0;
    const securityIssues: ISecurityIssue[] = [];

    const fileNodesToSave: any[] = [];

    const walk = (currentDir: string, relativeParent = '') => {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        if (IGNORED_DIRECTORIES.has(entry.name)) {
          continue;
        }

        const fullPath = path.join(currentDir, entry.name);
        const relPath = relativeParent ? `${relativeParent}/${entry.name}` : entry.name;

        if (entry.isDirectory()) {
          folderCount++;
          
          fileNodesToSave.push({
            project: projectId,
            path: relPath,
            name: entry.name,
            type: 'directory',
            size: 0,
            parentPath: relativeParent,
            classes: [],
            functions: [],
            imports: [],
            exports: [],
          });

          walk(fullPath, relPath);
        } else if (entry.isFile()) {
          fileCount++;
          const stats = fs.statSync(fullPath);
          const ext = path.extname(entry.name).toLowerCase();
          
          let parsedData = {
            classes: [] as any[],
            functions: [] as any[],
            imports: [] as string[],
            exports: [] as string[],
          };

          let fileLines = 0;

          // Only parse content if file size is under 2MB
          if (stats.size < 2 * 1024 * 1024) {
            try {
              const content = fs.readFileSync(fullPath, 'utf-8');
              fileLines = content.split('\n').length;
              linesOfCode += fileLines;

              if (PARSEABLE_JS_TS.has(ext)) {
                parsedData = parseJsTsFile(fullPath);
              } else if (PARSEABLE_FALLBACK.has(ext)) {
                parsedData = parseFallbackFile(fullPath);
              }

              // Run security analysis
              const fileSecurityIssues = scanSecurity(relPath, content);
              securityIssues.push(...fileSecurityIssues);
            } catch (err) {
              console.error(`[Scanner] Error reading lines/parsing AST for ${entry.name}:`, err);
            }
          }

          fileNodesToSave.push({
            project: projectId,
            path: relPath,
            name: entry.name,
            type: 'file',
            size: stats.size,
            parentPath: relativeParent,
            classes: parsedData.classes,
            functions: parsedData.functions,
            imports: parsedData.imports,
            exports: parsedData.exports,
          });
        }
      }
    };

    walk(projectDir);

    // 3. Clear any existing scan nodes in DB (for clean re-scans)
    await FileNode.deleteMany({ project: projectId });
    await ScanResult.deleteMany({ project: projectId });

    // 4. Batch save FileNodes to MongoDB
    if (fileNodesToSave.length > 0) {
      await FileNode.insertMany(fileNodesToSave);
    }

    // 5. Calculate complexity score (Mock formula based on classes & functions density)
    let totalClassesAndFunctions = 0;
    fileNodesToSave.forEach(node => {
      totalClassesAndFunctions += (node.classes?.length || 0) + (node.functions?.length || 0);
    });
    // Base complexity is LOC combined with Class/Func weights
    const complexityScore = Math.round((linesOfCode * 0.1) + (totalClassesAndFunctions * 5));

    // 6. Create Scan Result Summary
    const scanResult = new ScanResult({
      project: projectId,
      linesOfCode,
      fileCount,
      folderCount,
      complexityScore,
      securityIssues: securityIssues,
      qualityIssues: [],  // Will populate in Phase 10
      summary: `Scan completed successfully. Detected ${techStack.join(', ')} tech stack.`,
    });
    await scanResult.save();

    // 7. Update Project
    const project = await Project.findById(projectId);
    if (project) {
      project.status = 'completed';
      project.techStack = techStack;
      await project.save();
    }

    console.log(`[Scanner] Scan successfully finished for Project: ${projectId}. LOC: ${linesOfCode}`);

  } catch (error) {
    console.error(`[Scanner] Scan task encountered critical failure for Project: ${projectId}:`, error);
    const project = await Project.findById(projectId);
    if (project) {
      project.status = 'failed';
      project.errorMessage = (error as Error).message;
      await project.save();
    }
  }
};
