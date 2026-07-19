import path from 'path';
import { FileNode, IFileNode } from '../models/FileNode';
import { ImpactReport, IImpactReport } from '../models/ImpactReport';

const BUSINESS_MAPPING: Record<string, string[]> = {
  auth: ['Authentication', 'Login Flow', 'Sign Up Flow', 'User Profile'],
  login: ['Authentication', 'Login Flow'],
  signup: ['Sign Up Flow', 'User Profile'],
  register: ['Sign Up Flow', 'User Profile'],
  jwt: ['Authentication', 'Session Authorization'],
  token: ['Authentication', 'Session Authorization'],
  session: ['Authentication', 'Session Authorization'],
  password: ['Authentication', 'Password Reset'],
  stripe: ['Payments Integration', 'Billing', 'Checkout Flow'],
  payment: ['Payments Integration', 'Billing', 'Checkout Flow'],
  billing: ['Billing', 'Checkout Flow'],
  checkout: ['Checkout Flow', 'Payments Integration'],
  cart: ['Checkout Flow'],
  order: ['Order Processing', 'Checkout Flow'],
  user: ['User Management', 'User Profile'],
  profile: ['User Profile'],
  project: ['Project Ingestion', 'File Scanner', 'AST Code Navigation'],
  scanner: ['Project Ingestion', 'File Scanner'],
  detector: ['Project Ingestion', 'File Scanner'],
  parser: ['Project Ingestion', 'File Scanner', 'AST Code Navigation'],
  explain: ['AI Explanations', 'AI Assistant Drawer'],
  ai: ['AI Explanations', 'AI Assistant Drawer'],
  security: ['Security Auditing Findings', 'Compliance Guard'],
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

export class ImpactAnalyzerService {
  public static async analyzeFile(projectId: string, fileNodeId: string): Promise<IImpactReport> {
    // 1. Fetch file context
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(fileNodeId);
    const targetNode = isObjectId 
      ? await FileNode.findOne({ _id: fileNodeId, project: projectId })
      : await FileNode.findOne({ path: fileNodeId, project: projectId });

    if (!targetNode) {
      throw new Error('Target file node not found in repository scan index.');
    }

    // 2. Return cached impact report if it exists
    const cachedReport = await ImpactReport.findOne({ project: projectId, fileNode: targetNode._id });
    if (cachedReport) {
      return cachedReport;
    }

    // 3. Fetch all files to build the inverted import dependency map
    const allFiles = await FileNode.find({ project: projectId, type: 'file' });
    
    // Build path mapping
    const filePathsMap = new Map<string, IFileNode>();
    allFiles.forEach(f => {
      const ext = path.extname(f.path);
      const pathNoExt = ext ? f.path.slice(0, -ext.length) : f.path;
      
      filePathsMap.set(f.path, f);
      filePathsMap.set(pathNoExt, f);
      if (pathNoExt.endsWith('/index')) {
        const folderPath = pathNoExt.slice(0, -6);
        filePathsMap.set(folderPath, f);
      }
    });

    // Build inverse dependency mapping: key = importedFile, value = Set of files that import it
    const importersMap = new Map<string, Set<string>>();
    allFiles.forEach(f => {
      f.imports.forEach(imp => {
        let resolved = imp;
        if (imp.startsWith('.') || imp.startsWith('@/')) {
          resolved = resolveRelativeImport(f.path, imp);
        }

        const targetImportedFile = filePathsMap.get(resolved);
        if (targetImportedFile && targetImportedFile.path !== f.path) {
          if (!importersMap.has(targetImportedFile.path)) {
            importersMap.set(targetImportedFile.path, new Set());
          }
          importersMap.get(targetImportedFile.path)!.add(f.path);
        }
      });
    });

    // 4. Calculate direct affected files
    const directSet = importersMap.get(targetNode.path) || new Set<string>();
    const directAffected = Array.from(directSet);

    // 5. Calculate indirect affected files (recurse up the chain using BFS)
    const visited = new Set<string>();
    const queue = [...directAffected];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      const parents = importersMap.get(current) || new Set<string>();
      parents.forEach(p => {
        if (!visited.has(p) && p !== targetNode.path) {
          queue.push(p);
        }
      });
    }

    const indirectAffected = Array.from(visited).filter(f => !directAffected.includes(f));
    const allAffected = [...directAffected, ...indirectAffected];

    // 6. Map impacted categories
    const apisAffected: string[] = [];
    const componentsAffected: string[] = [];
    const modelsAffected: string[] = [];
    const businessFeaturesSet = new Set<string>();

    // Map business features for the target file first
    const targetPathLower = targetNode.path.toLowerCase();
    for (const [key, features] of Object.entries(BUSINESS_MAPPING)) {
      if (targetPathLower.includes(key)) {
        features.forEach(f => businessFeaturesSet.add(f));
      }
    }

    allAffected.forEach(filePath => {
      const pathLower = filePath.toLowerCase();
      const node = filePathsMap.get(filePath);
      if (!node) return;

      // Classify
      if (pathLower.includes('/routes/') || pathLower.includes('/controllers/') || pathLower.includes('api/')) {
        apisAffected.push(filePath);
      }
      if (pathLower.includes('/components/') || pathLower.includes('/pages/') || node.name.endsWith('.tsx')) {
        componentsAffected.push(filePath);
      }
      if (pathLower.includes('/models/') || pathLower.includes('/schema/')) {
        modelsAffected.push(filePath);
      }

      // Map business features
      for (const [key, features] of Object.entries(BUSINESS_MAPPING)) {
        if (pathLower.includes(key)) {
          features.forEach(f => businessFeaturesSet.add(f));
        }
      }
    });

    if (businessFeaturesSet.size === 0) {
      businessFeaturesSet.add('Core Code Utility');
    }

    // 7. Risk score calculations
    let riskScore = 0;
    // factor 1: imports count
    riskScore += directAffected.length * 10;
    riskScore += indirectAffected.length * 3;
    // factor 2: file size/complexity
    riskScore += (targetNode.classes?.length || 0) * 3;
    riskScore += (targetNode.functions?.length || 0) * 2;
    riskScore += Math.round(targetNode.size / 2000); // size factor

    // factor 3: baseline baseline importance
    if (targetPathLower.includes('/models/')) riskScore += 30;
    if (targetPathLower.includes('/config/') || targetPathLower.includes('.env')) riskScore += 25;
    if (targetPathLower.includes('/middlewares/') || targetPathLower.includes('jwt')) riskScore += 40;
    if (targetPathLower.includes('/controllers/') || targetPathLower.includes('/routes/')) riskScore += 15;

    let riskLabel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
    if (riskScore > 80) riskLabel = 'CRITICAL';
    else if (riskScore > 50) riskLabel = 'HIGH';
    else if (riskScore > 20) riskLabel = 'MEDIUM';

    // 8. Build Cytoscape ripple graph structure
    const graphNodes: any[] = [];
    const graphEdges: any[] = [];
    const edgeKeySet = new Set<string>();

    // Cap the visual graph at 30 nodes to avoid browser lock
    const cappedVisualSet = new Set<string>([targetNode.path, ...allAffected.slice(0, 30)]);

    cappedVisualSet.forEach(filePath => {
      const node = filePathsMap.get(filePath);
      if (!node) return;

      let type = 'utility';
      const pathLower = node.path.toLowerCase();
      if (pathLower.includes('/pages/') || pathLower.includes('/views/')) type = 'page';
      else if (pathLower.includes('/components/')) type = 'component';
      else if (pathLower.includes('/routes/') || pathLower.includes('/router/')) type = 'route';
      else if (pathLower.includes('/controllers/') || pathLower.includes('/controller/')) type = 'controller';
      else if (pathLower.includes('/services/') || pathLower.includes('/service/')) type = 'service';
      else if (pathLower.includes('/models/') || pathLower.includes('/model/')) type = 'model';
      else if (pathLower.includes('/middlewares/') || pathLower.includes('/middleware/')) type = 'middleware';

      graphNodes.push({
        id: node.path,
        label: node.name,
        type,
      });

      // Add "imported by" edge connections
      const importers = importersMap.get(node.path) || new Set<string>();
      importers.forEach(imp => {
        if (cappedVisualSet.has(imp)) {
          const edgeKey = `${node.path}->${imp}`;
          if (!edgeKeySet.has(edgeKey)) {
            edgeKeySet.add(edgeKey);
            graphEdges.push({
              source: node.path,
              target: imp,
              type: 'imported-by',
            });
          }
        }
      });
    });

    const newReport = new ImpactReport({
      project: projectId,
      fileNode: targetNode._id,
      riskScore,
      riskLabel,
      directAffected,
      indirectAffected,
      businessFeatures: Array.from(businessFeaturesSet),
      apisAffected,
      componentsAffected,
      modelsAffected,
      graph: {
        nodes: graphNodes,
        edges: graphEdges,
      },
    });

    await newReport.save();
    return newReport;
  }

  /**
   * Simulate rename/delete impact outcomes before edits
   */
  public static async simulateChange(
    projectId: string,
    fileNodeId: string,
    action: 'delete' | 'rename',
    newName?: string
  ): Promise<any> {
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(fileNodeId);
    const targetNode = isObjectId
      ? await FileNode.findOne({ _id: fileNodeId, project: projectId })
      : await FileNode.findOne({ path: fileNodeId, project: projectId });

    if (!targetNode) {
      throw new Error('File node to simulate not found in project database registries.');
    }

    const analysis = await this.analyzeFile(projectId, targetNode._id.toString());

    let warningMessage = '';
    const affectedCount = analysis.directAffected.length + analysis.indirectAffected.length;

    if (action === 'delete') {
      warningMessage = `Deleting '${targetNode.name}' has a ${analysis.riskLabel} risk score. It will break ${analysis.directAffected.length} direct imports, and ripple impact ${affectedCount} files.`;
    } else {
      warningMessage = `Renaming '${targetNode.name}' to '${newName || 'new_name'}' requires updating ${analysis.directAffected.length} files importing it to avoid compilation failures.`;
    }

    return {
      action,
      fileName: targetNode.name,
      filePath: targetNode.path,
      riskLabel: analysis.riskLabel,
      riskScore: analysis.riskScore,
      warningMessage,
      directAffected: analysis.directAffected,
      indirectAffected: analysis.indirectAffected,
      businessFeatures: analysis.businessFeatures,
    };
  }
}
