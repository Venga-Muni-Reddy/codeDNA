import React, { useState, useEffect, useRef } from 'react';
import cytoscape from 'cytoscape';
import { projectService, impactService } from '../services/api';

interface ImpactAnalyzerProps {
  projectId: string;
  onClose?: () => void;
}

export const ImpactAnalyzer: React.FC<ImpactAnalyzerProps> = ({ projectId, onClose }) => {
  const [filesList, setFilesList] = useState<any[]>([]);
  const [selectedFilePath, setSelectedFilePath] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [report, setReport] = useState<any>(null);
  
  // Simulation States
  const [showSimulateModal, setShowSimulateModal] = useState<boolean>(false);
  const [simAction, setSimAction] = useState<'delete' | 'rename'>('delete');
  const [simNewName, setSimNewName] = useState<string>('');
  const [simResult, setSimResult] = useState<any>(null);
  const [simLoading, setSimLoading] = useState<boolean>(false);

  // AI Assistant States
  const [aiQuery, setAiQuery] = useState<string>('Explain the risk profile of this module and suggest a migration plan.');
  const [aiAnswer, setAiAnswer] = useState<string>('');
  const [aiLoading, setAiLoading] = useState<boolean>(false);

  const cyRef = useRef<HTMLDivElement>(null);
  const cyInstance = useRef<cytoscape.Core | null>(null);

  // Fetch all repository files on load to populate selector autocomplete
  useEffect(() => {
    const fetchFiles = async () => {
      try {
        const data = await projectService.getDependencies(projectId);
        if (data && data.nodes) {
          const filesOnly = data.nodes.filter((n: any) => n.type === 'file' || n.id.includes('.'));
          setFilesList(filesOnly);
          if (filesOnly.length > 0) {
            setSelectedFilePath(filesOnly[0].id);
          }
        }
      } catch (err) {
        console.error('Failed to load project files list:', err);
      }
    };
    fetchFiles();
  }, [projectId]);

  // Load Impact Scan Report when selected file path changes
  const runImpactAnalysis = async (pathStr: string) => {
    if (!pathStr) return;
    setLoading(true);
    setError('');
    setReport(null);
    setAiAnswer('');
    setSimResult(null);

    try {
      const data = await impactService.get(projectId, pathStr);
      setReport(data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Impact analysis failed.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedFilePath) {
      runImpactAnalysis(selectedFilePath);
    }
  }, [selectedFilePath]);

  // Draw Cytoscape Ripple Graph
  useEffect(() => {
    if (!cyRef.current || !report || !report.graph) return;

    if (cyInstance.current) {
      cyInstance.current.destroy();
    }

    const elements: any[] = [];

    // Add nodes
    report.graph.nodes.forEach((n: any) => {
      let bg = '#475569';
      if (n.id === selectedFilePath) bg = '#ec4899'; // pink root selection
      else if (n.type === 'model') bg = '#f59e0b'; // amber
      else if (n.type === 'controller' || n.type === 'route') bg = '#3b82f6'; // blue
      else if (n.type === 'service') bg = '#10b981'; // green
      else if (n.type === 'component' || n.type === 'page') bg = '#8b5cf6'; // purple

      elements.push({
        data: {
          id: n.id,
          label: n.label,
          type: n.type,
          bg,
        }
      });
    });

    // Add edges
    report.graph.edges.forEach((e: any, idx: number) => {
      elements.push({
        data: {
          id: `e-${idx}`,
          source: e.source,
          target: e.target,
        }
      });
    });

    cyInstance.current = cytoscape({
      container: cyRef.current,
      elements,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': 'data(bg)',
            label: 'data(label)',
            color: '#f8fafc',
            'font-size': '10px',
            'text-valign': 'bottom',
            'text-margin-y': 6,
            'text-halign': 'center',
            'text-wrap': 'wrap',
            'text-max-width': '75px',
            width: '32px',
            height: '32px',
            'border-width': '2px',
            'border-color': '#0f172a',
            'transition-property': 'background-color, border-color',
            'transition-duration': 0.2,
          }
        },
        {
          selector: 'node:selected',
          style: {
            'border-color': '#ffffff',
            'border-width': '3px',
          }
        },
        {
          selector: 'edge',
          style: {
            width: 2.5,
            'line-color': '#475569',
            'target-arrow-color': '#64748b',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            label: 'Ripple',
            'font-size': '7px',
            color: '#64748b',
          }
        }
      ],
      layout: {
        name: 'cose',
        animate: true,
        fit: true,
      }
    });

    // Node click handler: allows changing the scanned path dynamically
    cyInstance.current.on('tap', 'node', (evt) => {
      const node = evt.target.data();
      if (node.id !== selectedFilePath) {
        setSelectedFilePath(node.id);
      }
    });

  }, [report, selectedFilePath]);

  // Execute Simulation Check
  const triggerSimulation = async () => {
    if (!selectedFilePath) return;
    setSimLoading(true);
    setSimResult(null);

    try {
      const data = await impactService.simulate(projectId, selectedFilePath, simAction, simNewName);
      setSimResult(data);
    } catch (err) {
      console.error('Simulation failed:', err);
    } finally {
      setSimLoading(false);
    }
  };

  // Run AI Impact Explanation Query
  const askAIOpinion = async () => {
    if (!selectedFilePath || !aiQuery.trim()) return;
    setAiLoading(true);
    setAiAnswer('');

    try {
      const text = await impactService.explain(projectId, selectedFilePath, aiQuery);
      setAiAnswer(text);
    } catch (err: any) {
      setAiAnswer(err.response?.data?.message || 'Failed to generate AI advice.');
    } finally {
      setAiLoading(false);
    }
  };

  // Export Analysis Report to Local Files
  const exportAs = (format: 'json' | 'md' | 'png') => {
    if (!report) return;

    if (format === 'json') {
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `impact_${selectedFilePath.replace(/[\/\\?%*:|"<>\s]/g, '_')}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } else if (format === 'md') {
      const md = `# Impact Analysis Report - ${selectedFilePath}

## Risk Assessment
- **Risk Score**: ${report.riskScore}
- **Risk Level**: ${report.riskLabel}

## Affected Modules
- **Direct Dependent Files**: ${report.directAffected.length}
- **Indirect Dependent Files**: ${report.indirectAffected.length}
- **Impacted Controllers/APIs**: ${report.apisAffected.length}
- **Impacted UI Components**: ${report.componentsAffected.length}

## Mapped Business Features
${report.businessFeatures.map((f: string) => ` - ${f}`).join('\n')}

---
*Report generated by CodeAtlas AI Impact Analyzer.*`;

      const blob = new Blob([md], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `impact_${selectedFilePath.replace(/[\/\\?%*:|"<>\s]/g, '_')}.md`;
      a.click();
      URL.revokeObjectURL(url);
    } else if (format === 'png') {
      if (!cyInstance.current) return;
      const png64 = cyInstance.current.png({ full: true, bg: '#0f172a' });
      const a = document.createElement('a');
      a.href = png64;
      a.download = `impact_graph_${selectedFilePath.replace(/[\/\\?%*:|"<>\s]/g, '_')}.png`;
      a.click();
    }
  };

  // Risk formatting helpers
  const getRiskColor = (label: string) => {
    switch (label) {
      case 'CRITICAL': return 'bg-red-500/20 border-red-500 text-red-400';
      case 'HIGH': return 'bg-orange-500/20 border-orange-500 text-orange-400';
      case 'MEDIUM': return 'bg-yellow-500/20 border-yellow-500 text-yellow-400';
      default: return 'bg-green-500/20 border-green-500 text-green-400';
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-y-auto lg:overflow-hidden bg-slate-950 text-slate-100 font-sans p-4 lg:p-6 gap-6">
      {/* HEADER SECTION */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">🌊</span>
            <h2 className="text-lg font-black bg-gradient-to-r from-pink-400 via-purple-400 to-indigo-300 bg-clip-text text-transparent">
              Static Impact Analyzer
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Determine file coupling, call cascades, and estimated risk profiles before editing code.
          </p>
        </div>

        <div className="flex gap-2">
          {report && (
            <div className="relative group">
              <button className="bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 text-xs font-semibold py-1.5 px-3 rounded-lg transition-colors">
                📤 Export
              </button>
              <div className="absolute right-0 top-full pt-1 hidden group-hover:block z-30">
                <div className="bg-slate-900 border border-slate-800 rounded-lg p-1 shadow-xl w-32">
                  <button
                    onClick={() => exportAs('json')}
                    className="w-full text-left px-3 py-1 text-[10px] rounded hover:bg-slate-800 transition-colors block text-slate-300"
                  >
                    Export JSON
                  </button>
                  <button
                    onClick={() => exportAs('md')}
                    className="w-full text-left px-3 py-1 text-[10px] rounded hover:bg-slate-800 transition-colors block text-slate-300"
                  >
                    Export Markdown
                  </button>
                  <button
                    onClick={() => exportAs('png')}
                    className="w-full text-left px-3 py-1 text-[10px] rounded hover:bg-slate-800 transition-colors block text-slate-300"
                  >
                    Export Graph PNG
                  </button>
                </div>
              </div>
            </div>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 text-xs font-semibold py-1.5 px-3 rounded-lg transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </div>

      {/* SEARCH/SELECT CONTROLLER */}
      <div className="bg-slate-900/40 border border-slate-800/60 rounded-xl p-4 flex gap-4 items-center">
        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
          Target File:
        </label>
        <select
          value={selectedFilePath}
          onChange={(e) => setSelectedFilePath(e.target.value)}
          className="flex-1 bg-slate-950 border border-slate-800 rounded-lg py-2 px-3 text-xs text-slate-300 focus:outline-none focus:border-brand-500 max-w-2xl"
        >
          {filesList.map((f: any) => (
            <option key={f.id} value={f.id}>
              {f.id}
            </option>
          ))}
        </select>
        {loading && <span className="text-xs text-brand-400 animate-pulse font-medium">Running scan...</span>}
      </div>

      {error && (
        <div className="bg-red-950/40 border border-red-800 text-red-400 rounded-xl p-4 text-xs font-medium">
          ⚠️ {error}
        </div>
      )}

      {report && (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 overflow-y-auto lg:overflow-hidden">
          {/* LEFT: RISK METRICS PANEL */}
          <div className="col-span-1 lg:col-span-3 bg-slate-900/20 border border-slate-800/80 rounded-2xl p-5 flex flex-col gap-5 overflow-y-auto backdrop-blur-sm lg:h-full">
            {/* Risk Badge */}
            <div className={`border p-4 rounded-xl text-center ${getRiskColor(report.riskLabel)}`}>
              <div className="text-[10px] uppercase font-bold tracking-widest text-slate-400">
                Change Risk Score
              </div>
              <div className="text-3xl font-black mt-1">{report.riskScore}</div>
              <div className="text-xs font-bold mt-1 tracking-wider">{report.riskLabel} RISK</div>
            </div>

            {/* Change Simulation Launcher */}
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                Simulate Changes
              </h3>
              <div className="space-y-3">
                <div className="flex gap-2">
                  <button
                    onClick={() => { setSimAction('delete'); setShowSimulateModal(true); setSimResult(null); }}
                    className="flex-1 bg-red-950/30 border border-red-900 hover:bg-red-900/20 text-red-400 text-xs font-bold py-2 rounded-lg transition-colors text-center"
                  >
                    Simulate Delete
                  </button>
                  <button
                    onClick={() => { setSimAction('rename'); setShowSimulateModal(true); setSimResult(null); }}
                    className="flex-1 bg-indigo-950/30 border border-indigo-900 hover:bg-indigo-900/20 text-indigo-400 text-xs font-bold py-2 rounded-lg transition-colors text-center"
                  >
                    Simulate Rename
                  </button>
                </div>
              </div>
            </div>

            {/* Business Features list */}
            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Business Features Impacted
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {report.businessFeatures.map((feat: string) => (
                  <span
                    key={feat}
                    className="bg-purple-950/60 border border-purple-900 text-purple-300 text-[10px] font-bold px-2 py-1 rounded-md"
                  >
                    ✓ {feat}
                  </span>
                ))}
              </div>
            </div>

            {/* Affected summary stats */}
            <div className="space-y-2 border-t border-slate-800/80 pt-3">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                Ripple Stats
              </h3>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-slate-950/50 p-2.5 rounded-lg border border-slate-900">
                  <div className="text-[10px] text-slate-500 uppercase font-bold">Direct Files</div>
                  <div className="text-lg font-bold text-slate-300">{report.directAffected.length}</div>
                </div>
                <div className="bg-slate-950/50 p-2.5 rounded-lg border border-slate-900">
                  <div className="text-[10px] text-slate-500 uppercase font-bold">Indirect Files</div>
                  <div className="text-lg font-bold text-slate-300">{report.indirectAffected.length}</div>
                </div>
                <div className="bg-slate-950/50 p-2.5 rounded-lg border border-slate-900">
                  <div className="text-[10px] text-slate-500 uppercase font-bold">Controllers</div>
                  <div className="text-lg font-bold text-slate-300">{report.apisAffected.length}</div>
                </div>
                <div className="bg-slate-950/50 p-2.5 rounded-lg border border-slate-900">
                  <div className="text-[10px] text-slate-500 uppercase font-bold">UI Components</div>
                  <div className="text-lg font-bold text-slate-300">{report.componentsAffected.length}</div>
                </div>
              </div>
            </div>
          </div>

          {/* MIDDLE: INTERACTIVE RIPPLE CANVAS */}
          <div className="col-span-1 lg:col-span-5 min-h-[450px] lg:h-full bg-slate-900/20 border border-slate-800/80 rounded-2xl overflow-hidden relative flex flex-col backdrop-blur-sm">
            <div className="p-4 border-b border-slate-800/80 bg-slate-950/40 flex justify-between items-center">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Interactive Ripple Graph
              </span>
              <span className="text-[9px] bg-slate-850 px-2 py-0.5 rounded text-slate-500 font-mono">
                Click nodes to re-analyze path
              </span>
            </div>
            
            {/* Cytoscape Container */}
            <div ref={cyRef} className="flex-1 bg-slate-950/40" style={{ height: '100%', width: '100%' }} />
          </div>

          {/* RIGHT: DETAILS SIDEBAR & AI EXPLANATION */}
          <div className="col-span-1 lg:col-span-4 flex flex-col gap-6 overflow-y-auto lg:overflow-hidden lg:h-full">
            {/* Top half: Dependent files lists */}
            <div className="flex-1 bg-slate-900/20 border border-slate-800/80 rounded-2xl p-5 overflow-y-auto backdrop-blur-sm">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                Dependencies Tracing ({report.directAffected.length + report.indirectAffected.length} affected)
              </h3>
              
              <div className="space-y-4">
                {report.directAffected.length > 0 && (
                  <div>
                    <h4 className="text-[10px] font-black uppercase text-pink-400 tracking-wider mb-1">
                      Direct Importers ({report.directAffected.length})
                    </h4>
                    <div className="space-y-1">
                      {report.directAffected.map((f: string) => (
                        <div
                          key={f}
                          onClick={() => setSelectedFilePath(f)}
                          className="text-[11px] font-mono bg-slate-950/60 hover:bg-slate-900 border border-slate-900 rounded p-1.5 truncate cursor-pointer text-slate-300 hover:text-slate-100 transition-colors"
                        >
                          {f}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {report.indirectAffected.length > 0 && (
                  <div>
                    <h4 className="text-[10px] font-black uppercase text-indigo-400 tracking-wider mb-1">
                      Indirectly Affected ({report.indirectAffected.length})
                    </h4>
                    <div className="space-y-1">
                      {report.indirectAffected.slice(0, 30).map((f: string) => (
                        <div
                          key={f}
                          onClick={() => setSelectedFilePath(f)}
                          className="text-[11px] font-mono bg-slate-950/40 hover:bg-slate-900 border border-slate-900/40 rounded p-1.5 truncate cursor-pointer text-slate-400 hover:text-slate-100 transition-colors"
                        >
                          {f}
                        </div>
                      ))}
                      {report.indirectAffected.length > 30 && (
                        <div className="text-[10px] text-slate-500 italic pl-1">
                          + {report.indirectAffected.length - 30} more indirect files
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom half: AI Refactoring Advice */}
            <div className="flex-1 bg-slate-900/20 border border-slate-800/80 rounded-2xl p-5 flex flex-col overflow-hidden backdrop-blur-sm">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                AI Refactoring Assistant
              </h3>
              
              <div className="flex-1 overflow-y-auto text-xs text-slate-350 pr-1 space-y-3 font-mono">
                {aiAnswer ? (
                  <div className="whitespace-pre-wrap leading-relaxed bg-slate-950/40 border border-slate-900/80 p-3 rounded-xl">
                    {aiAnswer}
                  </div>
                ) : (
                  <div className="text-center text-slate-500 py-12 italic">
                    Ask AI about the coupling or migration advice for this file.
                  </div>
                )}
              </div>

              {/* Chat Input form */}
              <div className="mt-3 border-t border-slate-800/80 pt-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={aiQuery}
                    onChange={(e) => setAiQuery(e.target.value)}
                    placeholder="Ask about this impact..."
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-brand-500"
                  />
                  <button
                    onClick={askAIOpinion}
                    disabled={aiLoading}
                    className="bg-brand-600 hover:bg-brand-500 text-white font-bold px-3 py-1.5 rounded-lg text-xs disabled:opacity-50"
                  >
                    {aiLoading ? 'Thinking...' : 'Query'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SIMULATE MODAL */}
      {showSimulateModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center px-4">
          <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl relative">
            <h3 className="text-lg font-bold mb-4 capitalize">
              Simulate Action: {simAction}
            </h3>

            {simAction === 'rename' && (
              <div className="mb-4">
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  New Target Name:
                </label>
                <input
                  type="text"
                  value={simNewName}
                  onChange={(e) => setSimNewName(e.target.value)}
                  placeholder="e.g. UserServiceNew.ts"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-350 focus:outline-none focus:border-brand-500"
                />
              </div>
            )}

            <div className="flex gap-3 justify-end mb-6">
              <button
                onClick={() => setShowSimulateModal(false)}
                className="bg-slate-950 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-slate-300 text-xs font-bold py-2 px-4 rounded-lg transition-colors"
              >
                Close
              </button>
              <button
                onClick={triggerSimulation}
                disabled={simLoading || (simAction === 'rename' && !simNewName)}
                className="bg-brand-600 hover:bg-brand-550 text-white text-xs font-bold py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
              >
                {simLoading ? 'Calculating...' : 'Run Simulation'}
              </button>
            </div>

            {simResult && (
              <div className="bg-slate-950/80 border border-slate-850 rounded-xl p-4 max-h-72 overflow-y-auto space-y-4 text-xs font-mono">
                <div className="text-red-400 font-bold border-b border-slate-850 pb-2">
                  ⚠️ {simResult.warningMessage}
                </div>
                
                {simResult.directAffected.length > 0 && (
                  <div>
                    <div className="text-xs font-bold text-pink-400 uppercase mb-1">
                      Direct compilation fixes needed in:
                    </div>
                    <div className="space-y-1 text-[11px] text-slate-350">
                      {simResult.directAffected.map((f: string) => (
                        <div key={f}>- {f}</div>
                      ))}
                    </div>
                  </div>
                )}

                {simResult.businessFeatures.length > 0 && (
                  <div>
                    <div className="text-xs font-bold text-purple-400 uppercase mb-1">
                      Affected User Experience / Business features:
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {simResult.businessFeatures.map((b: string) => (
                        <span key={b} className="bg-slate-900 border border-slate-800 text-[10px] text-purple-300 px-2 py-0.5 rounded">
                          {b}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
