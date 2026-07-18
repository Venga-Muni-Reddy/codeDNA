import { Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { Project } from '../models/Project';
import { FileNode } from '../models/FileNode';
import { AuthenticatedRequest } from '../middlewares/auth';
import { AppError } from '../utils/errors';
import { extractZip, cloneGit } from '../utils/file';
import { scanProject } from '../services/scanner';
import { generateProjectDocs } from '../services/documentation';
import { askGemini } from '../services/ai';

const PROJECTS_ROOT = path.join(__dirname, '..', '..', 'projects');

const triggerScanner = async (projectId: string, projectPath: string) => {
  scanProject(projectId, projectPath).catch((err) => {
    console.error(`[scanner-trigger] Failed async scan for ${projectId}:`, err);
  });
};

export const importGit = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { name, repoUrl, branch } = req.body;
    const userId = req.user?.userId;

    if (!name || !repoUrl) {
      throw new AppError('Project name and repoUrl are required fields', 400);
    }

    const projectId = new Project({
      owner: userId,
      name,
      sourceType: 'github',
      repoUrl,
      branch: branch || 'main',
      status: 'processing',
    });

    const projectDir = path.join(PROJECTS_ROOT, projectId._id.toString());
    await projectId.save();

    res.status(202).json({
      success: true,
      message: 'Git cloning process initiated',
      data: {
        project: projectId,
      },
      errors: null,
      meta: {},
    });

    // Run cloning in the background
    cloneGit(repoUrl, projectDir)
      .then(async (commitHash) => {
        projectId.currentCommit = commitHash;
        projectId.status = 'processing';
        await projectId.save();
        triggerScanner(projectId._id.toString(), projectDir);
      })
      .catch(async (error) => {
        projectId.status = 'failed';
        projectId.errorMessage = error.message;
        await projectId.save();
      });

  } catch (error) {
    next(error);
  }
};

export const uploadZip = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const file = req.file;
    const { name } = req.body;
    const userId = req.user?.userId;

    if (!file) {
      throw new AppError('ZIP file is required', 400);
    }
    if (!name) {
      // Clean up uploaded file if name is missing
      fs.unlinkSync(file.path);
      throw new AppError('Project name is required', 400);
    }

    const projectId = new Project({
      owner: userId,
      name,
      sourceType: 'zip',
      status: 'processing',
    });

    const projectDir = path.join(PROJECTS_ROOT, projectId._id.toString());
    await projectId.save();

    res.status(202).json({
      success: true,
      message: 'ZIP upload accepted, extracting files...',
      data: {
        project: projectId,
      },
      errors: null,
      meta: {},
    });

    // Run extraction in the background
    extractZip(file.path, projectDir)
      .then(async () => {
        // Clean up temporary ZIP file
        fs.unlinkSync(file.path);
        triggerScanner(projectId._id.toString(), projectDir);
      })
      .catch(async (error) => {
        // Clean up temporary ZIP file if extraction fails
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
        projectId.status = 'failed';
        projectId.errorMessage = error.message;
        await projectId.save();
      });

  } catch (error) {
    next(error);
  }
};

export const listProjects = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const projects = await Project.find({ owner: userId }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      message: 'Projects retrieved successfully',
      data: {
        projects,
      },
      errors: null,
      meta: {},
    });
  } catch (error) {
    next(error);
  }
};

export const getProject = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    const project = await Project.findOne({ _id: id, owner: userId });
    if (!project) {
      throw new AppError('Project not found', 404);
    }

    res.status(200).json({
      success: true,
      message: 'Project retrieved successfully',
      data: {
        project,
      },
      errors: null,
      meta: {},
    });
  } catch (error) {
    next(error);
  }
};

export const deleteProject = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    const project = await Project.findOneAndDelete({ _id: id, owner: userId });
    if (!project) {
      throw new AppError('Project not found', 404);
    }

    // Cascade delete project files
    const projectDir = path.join(PROJECTS_ROOT, id);
    if (fs.existsSync(projectDir)) {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }

    res.status(200).json({
      success: true,
      message: 'Project deleted successfully',
      data: {},
      errors: null,
      meta: {},
    });
  } catch (error) {
    next(error);
  }
};

const resolveRelativeImport = (importerPath: string, importTarget: string): string => {
  if (importTarget.startsWith('@/')) {
    return 'src/' + importTarget.substring(2);
  }
  
  const parentParts = importerPath.split('/').slice(0, -1);
  const targetParts = importTarget.split('/');

  for (const part of targetParts) {
    if (part === '.' || part === '') {
      continue;
    } else if (part === '..') {
      parentParts.pop();
    } else {
      parentParts.push(part);
    }
  }

  return parentParts.join('/');
};

export const getProjectDependencies = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    // Check project exists and belongs to user
    const project = await Project.findOne({ _id: id, owner: userId });
    if (!project) {
      throw new AppError('Project not found', 404);
    }

    const fileNodes = await FileNode.find({ project: id, type: 'file' });

    // Map path names to find references quickly
    const nodesMap = new Map<string, string>();
    const nodes: any[] = [];

    for (const node of fileNodes) {
      const fullPath = node.path;
      const ext = path.extname(fullPath);
      const pathWithoutExt = ext ? fullPath.slice(0, -ext.length) : fullPath;

      nodesMap.set(pathWithoutExt, fullPath);
      nodesMap.set(fullPath, fullPath);

      if (pathWithoutExt.endsWith('/index')) {
        const folderPath = pathWithoutExt.slice(0, -6); // remove '/index'
        nodesMap.set(folderPath, fullPath);
      }

      nodes.push({
        id: fullPath,
        label: node.name,
        type: 'file',
      });
    }

    const edges: any[] = [];
    const edgeKeySet = new Set<string>();

    for (const node of fileNodes) {
      for (const imp of node.imports) {
        let resolved = imp;
        if (imp.startsWith('.') || imp.startsWith('@/')) {
          resolved = resolveRelativeImport(node.path, imp);
        }

        const targetFullPath = nodesMap.get(resolved);
        if (targetFullPath && targetFullPath !== node.path) {
          const edgeKey = `${node.path}->${targetFullPath}`;
          if (!edgeKeySet.has(edgeKey)) {
            edgeKeySet.add(edgeKey);
            edges.push({
              source: node.path,
              target: targetFullPath,
            });
          }
        }
      }
    }

    res.status(200).json({
      success: true,
      message: 'Project dependency graph retrieved successfully',
      data: {
        nodes,
        edges,
      },
      errors: null,
      meta: {},
    });
  } catch (error) {
    next(error);
  }
};

export const getProjectArchitecture = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    const project = await Project.findOne({ _id: id, owner: userId });
    if (!project) {
      throw new AppError('Project not found', 404);
    }

    const fileNodes = await FileNode.find({ project: id, type: 'file' });

    // Group files by parent directory path
    const layersMap = new Map<string, any[]>();
    const nodesMap = new Map<string, string>();

    for (const node of fileNodes) {
      const parentDir = node.parentPath || 'root';
      if (!layersMap.has(parentDir)) {
        layersMap.set(parentDir, []);
      }
      layersMap.get(parentDir)!.push(node);

      const ext = path.extname(node.path);
      const pathWithoutExt = ext ? node.path.slice(0, -ext.length) : node.path;
      nodesMap.set(pathWithoutExt, node.path);
      nodesMap.set(node.path, node.path);
      if (pathWithoutExt.endsWith('/index')) {
        const folderPath = pathWithoutExt.slice(0, -6);
        nodesMap.set(folderPath, node.path);
      }
    }

    // Build Mermaid lines
    let mermaid = 'graph TD\n';
    
    // Add subgraphs (layers)
    let nodeIdCounter = 0;
    const mermaidNodeIds = new Map<string, string>(); // maps node.path -> unique simple ID (e.g. n1) to avoid special characters in Mermaid IDs
    
    for (const [layer, files] of layersMap.entries()) {
      mermaid += `  subgraph "${layer}"\n`;
      for (const file of files) {
        nodeIdCounter++;
        const idStr = `n${nodeIdCounter}`;
        mermaidNodeIds.set(file.path, idStr);
        mermaid += `    ${idStr}["${file.name}"]\n`;
      }
      mermaid += '  end\n';
    }

    // Add edges
    const edgeKeySet = new Set<string>();
    for (const node of fileNodes) {
      const sourceId = mermaidNodeIds.get(node.path);
      if (!sourceId) continue;

      for (const imp of node.imports) {
        let resolved = imp;
        if (imp.startsWith('.') || imp.startsWith('@/')) {
          resolved = resolveRelativeImport(node.path, imp);
        }

        const targetFullPath = nodesMap.get(resolved);
        if (targetFullPath && targetFullPath !== node.path) {
          const targetId = mermaidNodeIds.get(targetFullPath);
          if (targetId) {
            const edgeKey = `${sourceId}-->${targetId}`;
            if (!edgeKeySet.has(edgeKey)) {
              edgeKeySet.add(edgeKey);
              mermaid += `  ${sourceId} --> ${targetId}\n`;
            }
          }
        }
      }
    }

    res.status(200).json({
      success: true,
      message: 'Architecture layer diagram generated successfully',
      data: {
        mermaid,
      },
      errors: null,
      meta: {},
    });
  } catch (error) {
    next(error);
  }
};

export const getProjectDocumentation = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    const project = await Project.findOne({ _id: id, owner: userId });
    if (!project) {
      throw new AppError('Project not found', 404);
    }

    const docs = await generateProjectDocs(id);

    res.status(200).json({
      success: true,
      message: 'Codebase documentation generated successfully',
      data: docs,
      errors: null,
      meta: {},
    });
  } catch (error) {
    next(error);
  }
};

export const explainProjectNode = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const { filePath, query } = req.body;
    const userId = req.user?.userId;

    if (!query) {
      throw new AppError('Query is a required field', 400);
    }

    const project = await Project.findOne({ _id: id, owner: userId });
    if (!project) {
      throw new AppError('Project not found', 404);
    }

    let prompt = '';

    if (filePath) {
      const fileNode = await FileNode.findOne({ project: id, path: filePath, type: 'file' });
      if (!fileNode) {
        throw new AppError('Target file not found in database registry', 404);
      }

      const absoluteFilePath = path.join(PROJECTS_ROOT, id, filePath);
      if (!fs.existsSync(absoluteFilePath)) {
        throw new AppError('Target file not found on local storage', 404);
      }

      const fileContent = fs.readFileSync(absoluteFilePath, 'utf-8');
      
      prompt = `You are a software engineer assistant. Explain the following source file in the context of the project.
      
File Name: ${fileNode.name}
File Path: ${fileNode.path}

Code Content:
\`\`\`
${fileContent}
\`\`\`

User Query: ${query}

Provide a direct, helpful, and concise answer formatted in Markdown.`;
    } else {
      const fileNodes = await FileNode.find({ project: id });
      const structureText = fileNodes.map(n => ` - ${n.path} (${n.type})`).join('\n');

      prompt = `You are a software engineer assistant. Answer the user query about the architecture layout of this codebase.
      
Project Name: ${project.name}
Tech Stack: ${project.techStack.join(', ')}

Codebase structure:
${structureText}

User Query: ${query}

Provide a direct, helpful, and concise answer formatted in Markdown.`;
    }

    const explanation = await askGemini(prompt);

    res.status(200).json({
      success: true,
      message: 'Explanation generated successfully',
      data: {
        explanation,
      },
      errors: null,
      meta: {},
    });
  } catch (error) {
    next(error);
  }
};

