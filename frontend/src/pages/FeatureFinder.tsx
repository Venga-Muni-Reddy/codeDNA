import React, { useState, useEffect, useRef } from 'react';
import cytoscape from 'cytoscape';
import { featureService, projectService } from '../services/api';
import { useAppStore } from '../store/useAppStore';

interface FeatureFinderProps {
  onClose: () => void;
}

export const FeatureFinder: React.FC<FeatureFinderProps> = ({ onClose }) => {
  const { activeProject } = useAppStore();
  const projectId = activeProject?._id;

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'frontend' | 'backend' | 'api' | 'model' | 'service' | 'component'>('all');
  
  // Feature search results state
  const [featureData, setFeatureData] = useState<any | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Preference list states
  const [history, setHistory] = useState<string[]>([]);
  const [pinnedFeatures, setPinnedFeatures] = useState<any[]>([]);
  const [favoriteFeatures, setFavoriteFeatures] = useState<any[]>([]);

  // Selection states
  const [selectedNode, setSelectedNode] = useState<any | null>(null);
  const [selectedNodeContent, setSelectedNodeContent] = useState<string>('');
  const [codeLoading, setCodeLoading] = useState(false);
  const [highlightedLines, setHighlightedLines] = useState<number[]>([]);

  // AI chat query
  const [aiQuery, setAiQuery] = useState('');
  const [aiChat, setAiChat] = useState<Array<{ sender: 'user' | 'ai'; text: string }>>([]);
  const [aiLoading, setAiLoading] = useState(false);

  // Cytoscape ref
  const cyRef = useRef<HTMLDivElement>(null);
  const cyInstance = useRef<cytoscape.Core | null>(null);

  // Debounce search query
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(query);
    }, 500);
    return () => clearTimeout(handler);
  }, [query]);

  // Fetch search history, pinned, and favorites
  const fetchHistoryAndPreferences = async () => {
    if (!projectId) return;
    try {
      const data = await featureService.getHistory(projectId);
      setHistory(data.history || []);
      setPinnedFeatures(data.pinned || []);
      setFavoriteFeatures(data.favorites || []);
    } catch (err) {
      console.error('Failed to load history metrics:', err);
    }
  };

  useEffect(() => {
    fetchHistoryAndPreferences();
  }, [projectId]);

  // Handle Search Execution
  const triggerSearch = async (searchQuery: string) => {
    if (!projectId || !searchQuery.trim()) return;
    setLoading(true);
    setError('');
    setFeatureData(null);
    setSelectedNode(null);
    setSelectedNodeContent('');
    setHighlightedLines([]);

    try {
      const result = await featureService.search(projectId, searchQuery);
      if (result.feature) {
        setFeatureData(result.feature);
        setSuggestions([]);
        
        // Log this search into local state
        setHistory(prev => [searchQuery, ...prev.filter(q => q !== searchQuery)].slice(0, 10));
      } else {
        setFeatureData(null);
        setSuggestions(result.suggestions || []);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Feature lookup failed.');
    } finally {
      setLoading(false);
    }
  };

  // Run search when debounced input matches
  useEffect(() => {
    if (debouncedQuery.trim()) {
      triggerSearch(debouncedQuery);
    }
  }, [debouncedQuery]);

  // Render Cytoscape Graph on data loading
  useEffect(() => {
    if (!cyRef.current || !featureData || !featureData.graph) return;

    // Filter nodes based on active tab category
    const filteredNodes = featureData.graph.nodes.filter((node: any) => {
      if (activeFilter === 'all') return true;
      if (activeFilter === 'frontend') return node.type === 'page' || node.type === 'component';
      if (activeFilter === 'backend') return node.type === 'route' || node.type === 'controller' || node.type === 'service' || node.type === 'model' || node.type === 'middleware';
      if (activeFilter === 'api') return node.type === 'route';
      if (activeFilter === 'model') return node.type === 'model';
      if (activeFilter === 'service') return node.type === 'service';
      if (activeFilter === 'component') return node.type === 'component';
      return true;
    });

    const nodeIds = new Set(filteredNodes.map((n: any) => n.id));
    const filteredEdges = featureData.graph.edges.filter((edge: any) => 
      nodeIds.has(edge.source) && nodeIds.has(edge.target)
    );

    const elements: any[] = [];
    filteredNodes.forEach((node: any) => {
      elements.push({
        data: {
          id: node.id,
          label: node.label,
          type: node.type,
        }
      });
    });

    filteredEdges.forEach((edge: any, idx: number) => {
      elements.push({
        data: {
          id: `e-${idx}`,
          source: edge.source,
          target: edge.target,
        }
      });
    });

    // Helper styling color map
    const getColor = (type: string) => {
      switch (type) {
        case 'page': return '#e11d48'; // Rose
        case 'component': return '#ec4899'; // Pink
        case 'route': return '#f59e0b'; // Amber
        case 'controller': return '#3b82f6'; // Blue
        case 'service': return '#10b981'; // Emerald
        case 'model': return '#8b5cf6'; // Violet
        case 'middleware': return '#6366f1'; // Indigo
        default: return '#64748b'; // Slate
      }
    };

    const cy = cytoscape({
      container: cyRef.current,
      elements,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': (ele: any) => getColor(ele.data('type')),
            label: 'data(label)',
            color: '#e2e8f0',
            'font-size': '11px',
            'text-valign': 'bottom',
            'text-margin-y': 6,
            'text-halign': 'center',
            'text-wrap': 'wrap',
            'text-max-width': '75px',
            width: '32px',
            height: '32px',
            'border-width': '3px',
            'border-color': '#0f172a',
            'transition-property': 'background-color, line-color',
            'transition-duration': 0.2,
          }
        },
        {
          selector: 'node:selected',
          style: {
            'border-color': '#ffffff',
            'border-width': '4px',
          }
        },
        {
          selector: 'edge',
          style: {
            width: 3,
            'line-color': '#334155',
            'target-arrow-color': '#475569',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
          }
        }
      ],
      layout: {
        name: 'cose',
        animate: true,
        fit: true,
      }
    });

    cy.on('tap', 'node', async (evt: any) => {
      const node = evt.target.data();
      setSelectedNode(node);
      setCodeLoading(true);
      setSelectedNodeContent('');
      setHighlightedLines([]);

      try {
        const content = await projectService.getFileContent(projectId!, node.id);
        setSelectedNodeContent(content);

        // Highlight lines matching words of the query
        const lines = content.split('\n');
        const indices: number[] = [];
        const cleanQuery = debouncedQuery.toLowerCase().trim();
        const terms = [cleanQuery];
        if (cleanQuery.length > 3) {
          terms.push(cleanQuery.slice(0, -1)); // fuzzy substring
        }

        lines.forEach((line: string, idx: number) => {
          const lowerLine = line.toLowerCase();
          const matches = terms.some(t => lowerLine.includes(t));
          if (matches) {
            indices.push(idx + 1); // 1-indexed
          }
        });
        setHighlightedLines(indices);
      } catch (err) {
        setSelectedNodeContent('Failed to fetch file contents.');
      } finally {
        setCodeLoading(false);
      }
    });

    cyInstance.current = cy;

    return () => {
      if (cyInstance.current) {
        cyInstance.current.destroy();
      }
    };
  }, [featureData, activeFilter]);

  // AI explanation trigger
  const handleAiChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiQuery.trim() || !featureData) return;

    const userMsg = aiQuery;
    setAiChat(prev => [...prev, { sender: 'user', text: userMsg }]);
    setAiQuery('');
    setAiLoading(true);

    try {
      const response = await featureService.explain(
        featureData._id,
        userMsg,
        selectedNode ? selectedNode.id : undefined
      );
      setAiChat(prev => [...prev, { sender: 'ai', text: response }]);
    } catch (err) {
      setAiChat(prev => [...prev, { sender: 'ai', text: 'Error contacting AI companion.' }]);
    } finally {
      setAiLoading(false);
    }
  };

  // Preference Actions
  const handleTogglePin = async () => {
    if (!featureData) return;
    try {
      const updated = await featureService.pin(featureData._id);
      setFeatureData(updated);
      fetchHistoryAndPreferences();
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleFavorite = async () => {
    if (!featureData) return;
    try {
      const updated = await featureService.favorite(featureData._id);
      setFeatureData(updated);
      fetchHistoryAndPreferences();
    } catch (err) {
      console.error(err);
    }
  };

  // Export metadata
  const exportAs = (format: 'json' | 'md' | 'png') => {
    if (!featureData) return;

    if (format === 'json') {
      const dataStr = JSON.stringify(featureData, null, 2);
      const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
      const exportFileDefaultName = `${featureData.query}_feature.json`;
      
      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();
    } else if (format === 'md') {
      let markdown = `# Feature Profile: ${featureData.name}\n\n`;
      markdown += `**Description**: ${featureData.description}\n`;
      markdown += `**Confidence Score**: ${featureData.confidenceScore}%\n`;
      markdown += `**Entry Point**: \`${featureData.entryPoint}\`\n\n`;
      markdown += `## Matched Files\n`;
      featureData.files.forEach((f: string) => {
        markdown += `- \`${f}\`\n`;
      });
      markdown += `\n## APIS / Endpoints\n`;
      featureData.apis.forEach((a: string) => {
        markdown += `- \`${a}\`\n`;
      });
      markdown += `\n## External Dependencies\n`;
      featureData.dependencies.forEach((d: string) => {
        markdown += `- \`${d}\`\n`;
      });

      const dataUri = 'data:text/markdown;charset=utf-8,'+ encodeURIComponent(markdown);
      const exportFileDefaultName = `${featureData.query}_feature.md`;
      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();
    } else if (format === 'png' && cyInstance.current) {
      const png64 = cyInstance.current.png({ output: 'blob' });
      const url = URL.createObjectURL(png64);
      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', url);
      linkElement.setAttribute('download', `${featureData.query}_flow_graph.png`);
      linkElement.click();
    }
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row overflow-y-auto md:overflow-hidden bg-slate-950 h-full border border-slate-800 rounded-2xl">
      
      {/* Sidebar: Filters & Navigation */}
      <aside className="w-full md:w-64 bg-slate-900/60 border-b md:border-b-0 md:border-r border-slate-800 flex flex-col shrink-0">
        <div className="p-4 border-b border-slate-855">
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 text-xs flex items-center gap-1 mb-2 font-semibold"
          >
            ← Close Finder
          </button>
          <h1 className="font-black text-sm tracking-tight bg-gradient-to-r from-brand-400 to-indigo-300 bg-clip-text text-transparent">
            🔍 Feature Finder
          </h1>
          <p className="text-[9px] text-slate-500 font-mono mt-0.5">
            AST RUNTIME EXECUTION PATH TRACER
          </p>
        </div>

        {/* Saved Searches / History */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          
          {/* Pinned features */}
          {pinnedFeatures.length > 0 && (
            <div>
              <h3 className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mb-2">📌 Pinned Workflows</h3>
              <div className="space-y-1">
                {pinnedFeatures.map(f => (
                  <button
                    key={f._id}
                    onClick={() => {
                      setQuery(f.query);
                      setFeatureData(f);
                    }}
                    className="w-full text-left py-1.5 px-3 rounded-lg text-xs truncate bg-slate-950/40 border border-slate-800/40 hover:border-slate-700 transition-all block"
                  >
                    {f.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Favorite features */}
          {favoriteFeatures.length > 0 && (
            <div>
              <h3 className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mb-2">⭐ Favorites</h3>
              <div className="space-y-1">
                {favoriteFeatures.map(f => (
                  <button
                    key={f._id}
                    onClick={() => {
                      setQuery(f.query);
                      setFeatureData(f);
                    }}
                    className="w-full text-left py-1.5 px-3 rounded-lg text-xs truncate bg-slate-950/40 border border-slate-800/40 hover:border-slate-700 transition-all block text-amber-400"
                  >
                    {f.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Recent History */}
          {history.length > 0 && (
            <div>
              <h3 className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mb-2">🕒 Recent Searches</h3>
              <div className="flex flex-wrap gap-1">
                {history.map((q, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setQuery(q);
                      triggerSearch(q);
                    }}
                    className="bg-slate-950 border border-slate-850 px-2 py-0.5 rounded text-[9px] text-slate-400 hover:text-slate-200 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Stats segment */}
        {featureData && (
          <div className="p-4 border-t border-slate-850 bg-slate-950/40 space-y-1.5 text-[11px] text-slate-400">
            <div className="flex justify-between">
              <span>Files Scanned</span>
              <span className="font-mono text-slate-200">{featureData.files.length}</span>
            </div>
            <div className="flex justify-between">
              <span>Confidence Index</span>
              <span className="font-mono text-brand-400 font-bold">{featureData.confidenceScore}%</span>
            </div>
            <div className="flex justify-between">
              <span>Views Cached</span>
              <span className="font-mono text-slate-200">{featureData.viewsCount}</span>
            </div>
          </div>
        )}
      </aside>

      {/* Main view container */}
      <div className="flex-1 flex flex-col overflow-hidden bg-slate-950">
        
        {/* Top Header: Search bar */}
        <header className="p-4 border-b border-slate-800 bg-slate-900/30 flex items-center justify-between gap-4 shrink-0">
          <div className="flex-1 max-w-md relative">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search feature e.g., 'login', 'authentication', 'payment'..."
              className="w-full bg-slate-900 border border-slate-850 rounded-xl px-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-500"
            />
            {loading && (
              <span className="absolute right-3 top-2.5 border-2 border-slate-800 border-t-brand-400 rounded-full w-4 h-4 animate-spin" />
            )}
          </div>

          {featureData && (
            <div className="flex gap-1.5">
              <button
                onClick={handleTogglePin}
                className={`px-2.5 py-1.5 border rounded-lg text-xs font-semibold transition-colors ${
                  featureData.isPinned ? 'border-brand-500 bg-brand-900/10 text-brand-400' : 'border-slate-800 hover:bg-slate-900 text-slate-400'
                }`}
                title="Pin feature"
              >
                📌 Pin
              </button>
              <button
                onClick={handleToggleFavorite}
                className={`px-2.5 py-1.5 border rounded-lg text-xs font-semibold transition-colors ${
                  featureData.isFavorite ? 'border-amber-500 bg-amber-900/10 text-amber-400' : 'border-slate-800 hover:bg-slate-900 text-slate-400'
                }`}
                title="Add to favorites"
              >
                ⭐ Favorite
              </button>

              {/* Export Selector */}
              <div className="relative group">
                <button className="px-2.5 py-1.5 border border-slate-800 rounded-lg text-xs font-semibold hover:bg-slate-900 text-slate-400 transition-colors">
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
            </div>
          )}
        </header>

        {error && (
          <div className="m-4 p-3 bg-red-950/40 border border-red-900/50 text-red-400 rounded-xl text-xs">
            {error}
          </div>
        )}

        {/* Suggestion list if search empty */}
        {suggestions.length > 0 && !loading && !featureData && (
          <div className="m-6 p-6 bg-slate-900/20 border border-slate-850 rounded-2xl max-w-sm mx-auto mt-12 text-center">
            <span className="text-3xl">💡</span>
            <h3 className="font-bold text-xs mt-3">No matching features found</h3>
            <p className="text-[10px] text-slate-500 mt-1 mb-4">Did you mean to search one of these synonyms instead?</p>
            <div className="flex justify-center gap-1.5 flex-wrap">
              {suggestions.map(s => (
                <button
                  key={s}
                  onClick={() => {
                    setQuery(s);
                    triggerSearch(s);
                  }}
                  className="bg-brand-650 hover:bg-brand-550 text-white text-xs font-semibold px-2.5 py-1 rounded-md transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {!featureData && suggestions.length === 0 && !loading && (
          <div className="flex-1 flex items-center justify-center text-xs text-slate-550">
            Enter a search term above to trace execution flows.
          </div>
        )}

        {featureData && (
          <div className="flex-1 flex overflow-hidden">
            
            {/* LEFT PANELS: Visualization Graph */}
            <div className="flex-1 flex flex-col overflow-hidden relative border-r border-slate-800">
              
              {/* Category tabs */}
              <nav className="flex border-b border-slate-850 bg-slate-900/10 px-4 shrink-0">
                {[
                  { id: 'all', label: 'All Node Layers' },
                  { id: 'frontend', label: 'UI Layers' },
                  { id: 'backend', label: 'Backend Blocks' },
                  { id: 'api', label: 'Routes / APIs' },
                  { id: 'service', label: 'Logic / Services' },
                  { id: 'model', label: 'Database Models' },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveFilter(tab.id as any)}
                    className={`px-3 py-2.5 font-semibold text-[10px] transition-colors border-b-2 -mb-px ${
                      activeFilter === tab.id
                        ? 'border-brand-500 text-brand-400'
                        : 'border-transparent text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>

              {/* Detail summary overlay */}
              <div className="absolute top-12 left-4 z-20 max-w-xs bg-slate-900/90 border border-slate-800 rounded-xl p-3 shadow-xl backdrop-blur-md">
                <h2 className="font-bold text-xs text-slate-200 truncate">{featureData.name}</h2>
                <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">{featureData.description}</p>
                <div className="mt-2 text-[8px] font-mono text-slate-500 truncate">
                  Entry Point: {featureData.entryPoint}
                </div>
              </div>

              {/* Cytoscape Container */}
              <div ref={cyRef} className="flex-1 bg-slate-950/80 cursor-grab active:cursor-grabbing" />
              
              {/* Legend bar */}
              <div className="p-2.5 border-t border-slate-850 bg-slate-900/10 shrink-0 flex gap-3 text-[8px] font-semibold tracking-wider text-slate-400 uppercase justify-center">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-600 inline-block"/> Page</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-pink-500 inline-block"/> Component</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block"/> Route</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block"/> Controller</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"/> Service</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-violet-500 inline-block"/> Model</span>
              </div>
            </div>

            {/* RIGHT PANELS: Code Viewer & AI explanations */}
            <div className="w-96 flex flex-col overflow-hidden shrink-0 bg-slate-900/20">
              
              {/* UPPER: Source viewer */}
              <div className="flex-1 flex flex-col overflow-hidden border-b border-slate-800">
                <div className="p-2.5 bg-slate-900/60 border-b border-slate-850 flex items-center justify-between text-xs shrink-0">
                  <span className="font-mono text-slate-300 font-semibold truncate max-w-[240px]">
                    📂 {selectedNode ? selectedNode.id : 'No file selected'}
                  </span>
                  {selectedNode && (
                    <span className="text-[9px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-400 uppercase font-mono">
                      {selectedNode.type}
                    </span>
                  )}
                </div>

                <div className="flex-1 overflow-auto bg-slate-950 font-mono text-[10px] leading-relaxed p-3 select-text whitespace-pre">
                  {codeLoading ? (
                    <div className="text-slate-500 animate-pulse">Scanning AST indices code content...</div>
                  ) : selectedNodeContent ? (
                    selectedNodeContent.split('\n').map((line, idx) => {
                      const lineNum = idx + 1;
                      const isHighlighted = highlightedLines.includes(lineNum);
                      return (
                        <div
                          key={idx}
                          className={`flex items-start ${
                            isHighlighted ? 'bg-brand-900/20 border-l-2 border-brand-500 -ml-3 pl-2.5' : ''
                          }`}
                        >
                          <span className="w-6 text-slate-600 text-right pr-2 select-none">{lineNum}</span>
                          <span className="text-slate-300">{line}</span>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-slate-500 text-center py-16">
                      Click any node in the graph map to trace its source logic code context.
                    </div>
                  )}
                </div>
              </div>

              {/* LOWER: AI Assistant Drawer */}
              <div className="h-64 flex flex-col overflow-hidden bg-slate-900/40">
                <div className="p-2.5 bg-slate-900/80 border-b border-slate-850 flex items-center justify-between text-xs shrink-0 font-bold">
                  <span>🤖 Feature Flow Companion</span>
                  {selectedNode && (
                    <span className="text-[9px] text-slate-500">
                      Scoped to {selectedNode.label}
                    </span>
                  )}
                </div>

                {/* Chat items list */}
                <div className="flex-1 p-2.5 overflow-y-auto space-y-2">
                  {aiChat.length === 0 && (
                    <div className="text-center text-[10px] text-slate-500 py-4 px-3 space-y-1">
                      <div>Ask details about how this feature integrates.</div>
                      <div className="flex flex-wrap justify-center gap-1 mt-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setAiQuery('Explain how requests flow for this feature.');
                          }}
                          className="bg-slate-950 hover:bg-slate-850 text-slate-400 px-1.5 py-0.5 rounded text-[8px] border border-slate-800"
                        >
                          How does requests flow?
                        </button>
                        {selectedNode && (
                          <button
                            type="button"
                            onClick={() => {
                              setAiQuery(`What is the purpose of the ${selectedNode.label} module?`);
                            }}
                            className="bg-slate-950 hover:bg-slate-850 text-slate-400 px-1.5 py-0.5 rounded text-[8px] border border-slate-800"
                          >
                            Explain selected file purpose
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                  {aiChat.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`p-2 rounded-xl text-xs leading-relaxed max-w-[90%] whitespace-pre-wrap ${
                        msg.sender === 'user'
                          ? 'bg-brand-600 text-white ml-auto'
                          : 'bg-slate-950 border border-slate-850 text-slate-300 font-mono text-[9px]'
                      }`}
                    >
                      {msg.text}
                    </div>
                  ))}
                  {aiLoading && (
                    <div className="bg-slate-950 border border-slate-850 text-slate-400 p-2 rounded-xl text-[9px] animate-pulse max-w-[80%] font-mono">
                      Thinking...
                    </div>
                  )}
                </div>

                {/* Input row */}
                <form onSubmit={handleAiChat} className="p-2 border-t border-slate-850 bg-slate-950/20 flex gap-1.5 shrink-0">
                  <input
                    type="text"
                    value={aiQuery}
                    onChange={(e) => setAiQuery(e.target.value)}
                    placeholder={
                      selectedNode
                        ? `Ask about ${selectedNode.label} in ${featureData.name}...`
                        : 'Explain workflow structure...'
                    }
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-[11px] text-slate-300 focus:outline-none focus:border-brand-500"
                  />
                  <button
                    type="submit"
                    className="bg-brand-600 hover:bg-brand-500 text-white font-bold px-2 py-1 rounded-lg text-xs"
                  >
                    Send
                  </button>
                </form>
              </div>

            </div>
          </div>
        )}
      </div>
    </div>
  );
};
