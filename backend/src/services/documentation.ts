import path from 'path';
import { FileNode } from '../models/FileNode';
import { Project } from '../models/Project';
import { askGemini } from './ai';

/**
 * Automatically compiles codebase documentation.
 * Parses AST metadata to list APIs, classes, and folder maps, and requests a summary from Gemini.
 */
export const generateProjectDocs = async (
  projectId: string
): Promise<{ readme: string; apiDocs: string; folderDocs: string }> => {
  const project = await Project.findById(projectId);
  const fileNodes = await FileNode.find({ project: projectId }).sort({ path: 1 });

  const fileList = fileNodes.filter((n) => n.type === 'file');
  const dirList = fileNodes.filter((n) => n.type === 'directory');

  // File tree summary for AI context
  const fileTreeText = fileNodes.map((n) => ` - ${n.path} (${n.type})`).join('\n');

  const classesList: string[] = [];
  const functionsList: string[] = [];
  const apiRoutes: string[] = [];

  fileList.forEach((file) => {
    file.classes.forEach((cls) => {
      classesList.push(
        `Class \`${cls.name}\` in \`${file.path}\` (Methods: ${cls.methods.join(', ') || 'none'})`
      );
    });
    file.functions.forEach((fn) => {
      functionsList.push(`Function \`${fn.name}\` in \`${file.path}\``);
    });

    if (
      file.path.toLowerCase().includes('route') ||
      file.path.toLowerCase().includes('controller') ||
      file.path.toLowerCase().includes('api')
    ) {
      apiRoutes.push(`Module \`${file.name}\` located at \`${file.path}\``);
    }
  });

  // 1. REST API and constructs docs
  const apiDocs = `## REST API & Exported Modules
The following router/controller bindings were identified in this scanning:

${
  apiRoutes.map((route) => `* ${route}`).join('\n') ||
  '* No explicit backend api routes identified.'
}

### Extracted Code Constructs

#### Class Declarations
${classesList.map((cls) => `* ${cls}`).join('\n') || '* No exported classes detected.'}

#### Standalone Functions
${functionsList.map((fn) => `* ${fn}`).join('\n') || '* No standalone functions detected.'}
`;

  // 2. Folder maps
  const folderDocs = `## Directory Architecture
The repository contains **${dirList.length}** folders and **${fileList.length}** source files.

### Repository File Map
${
  fileNodes
    .map(
      (n) =>
        `${'  '.repeat(n.path.split('/').length - 1)}- \`${n.name}\` (${
          n.type === 'directory' ? 'folder' : 'file'
        })`
    )
    .join('\n') || '* Empty folder structure.'
}
`;

  // 3. AI Generated Codebase Summary README
  let readme = '';
  const prompt = `You are a senior developer writing onboarding docs.
Generate a comprehensive README.md developer onboarding guide for the project: "${
    project?.name || 'CodeAtlas scan'
  }" which runs on: ${project?.techStack?.join(', ') || 'Javascript'}.

Here is the file structure layout:
${fileTreeText}

Extracted Constructs:
- Classes count: ${classesList.length}
- Functions count: ${functionsList.length}
- API Controllers: ${apiRoutes.length}

Please explain:
1. High-level architecture design of this structure (e.g. monorepo, MVC, layered, etc.)
2. A developer onboarding walk ("Where to start, what files to read first")
Keep the tone professional, direct, and return markdown text directly.`;

  const aiSummary = await askGemini(prompt);

  if (aiSummary && !aiSummary.startsWith('Gemini API key not configured')) {
    readme = aiSummary;
  } else {
    // Elegant fallback template
    readme = `# ${project?.name || 'CodeAtlas AI Scan'}

Welcome to the automated documentation guide.

## Tech Stack Overview
This repository uses the **${
      project?.techStack?.join(', ') || 'HTML/CSS/JS'
    }** stack. We successfully parsed and indexed **${
      fileList.length
    }** source modules.

## Architectural Onboarding
Based on our static directory walker, here is where to start analyzing this codebase:
- **Base Folders**: Review the mapped directories in the "Directory Architecture" tab.
- **Visual Call Graph**: Go to the "Dependency Graph" tab to inspect the flow of imports and connections between controllers.

### Automated Stats
* Total Classes: ${classesList.length}
* Total Functions: ${functionsList.length}
* API Endpoints/Routers: ${apiRoutes.length}
`;
  }

  return { readme, apiDocs, folderDocs };
};
