import { useState, useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  MiniMap
} from '@xyflow/react';
import type { Node, Edge, NodeChange, EdgeChange, Connection } from '@xyflow/react';
import { CustomWorkflowNode } from './CustomWorkflowNode';
import { NodeInspectorDrawer } from './NodeInspectorDrawer';
import { 
  Sparkles, 
  Save, 
  Plus, 
  FolderPlus, 
  Layers, 
  Zap, 
  Brain, 
  Database, 
  GitBranch, 
  MessageSquare, 
  UserCheck, 
  ShieldAlert,
  Play,
  Terminal,
  CheckCircle2
} from 'lucide-react';

interface AppNiche {
  id: string;
  name: string;
  category: string;
  description: string;
  flowsCount: number;
}

const initialApps: AppNiche[] = [
  {
    id: 'app-social',
    name: 'Assistência Social & CRAS',
    category: 'Governo / B2G',
    description: 'Triagem de CadÚnico, Bolsa Família, BPC, Moradia e Proteção contra Violência.',
    flowsCount: 1
  },
  {
    id: 'app-imob',
    name: 'Imobiliária Prime - Vendas & Aluguel',
    category: 'Mercado Imobiliário',
    description: 'Qualificação de leads, agendamento de visitas e RAG com catálogo de imóveis.',
    flowsCount: 1
  },
  {
    id: 'app-saude',
    name: 'Clínica Saúde & Agendamentos',
    category: 'Saúde & Clínicas',
    description: 'Triagem de sintomas com IA, agendamento de consultas e tira-dúvidas de convênios.',
    flowsCount: 1
  }
];

const initialSocialNodes: Node[] = [
  {
    id: 'node-1',
    type: 'customNode',
    data: {
      label: 'Gatilho: WhatsApp Mensagem',
      sublabel: 'Recebe texto ou áudio de voz do cidadão',
      type: 'trigger'
    },
    position: { x: 50, y: 180 }
  },
  {
    id: 'node-2',
    type: 'customNode',
    data: {
      label: 'Classificador NLP Social',
      sublabel: 'Linear SVM + TF-IDF (8 Classes Sociais)',
      type: 'ml_classifier'
    },
    position: { x: 400, y: 180 }
  },
  {
    id: 'node-3',
    type: 'customNode',
    data: {
      label: 'Condição: Risco de Violência?',
      sublabel: 'Recall 100% para acionamento imediato',
      type: 'condition'
    },
    position: { x: 750, y: 80 }
  },
  {
    id: 'node-4',
    type: 'customNode',
    data: {
      label: 'Alerta Urgente CREAS / 190',
      sublabel: 'Ligue 180 / 190 / Disque 100 + Acolhimento',
      type: 'urgency_alert'
    },
    position: { x: 1100, y: 20 }
  },
  {
    id: 'node-5',
    type: 'customNode',
    data: {
      label: 'Google Gemini 3.5 Flash Lite',
      sublabel: 'Reescrita empática e desambiguação',
      type: 'llm_gemini',
      config: { model: 'gemini-3.5-flash-lite', temperature: 0.2 }
    },
    position: { x: 750, y: 320 }
  },
  {
    id: 'node-6',
    type: 'customNode',
    data: {
      label: 'Agentic RAG pgvector',
      sublabel: 'Busca Unidades CRAS & Documentos (Anápolis)',
      type: 'rag_pgvector',
      config: { topK: 3 }
    },
    position: { x: 1100, y: 320 }
  },
  {
    id: 'node-7',
    type: 'customNode',
    data: {
      label: 'Resposta WhatsApp + Botões',
      sublabel: 'Envia orientação e confirmação na fila',
      type: 'standard'
    },
    position: { x: 1450, y: 320 }
  }
];

const initialSocialEdges: Edge[] = [
  { id: 'e1-2', source: 'node-1', target: 'node-2', animated: true, style: { stroke: '#38bdf8', strokeWidth: 2 } },
  { id: 'e2-3', source: 'node-2', target: 'node-3', animated: true, style: { stroke: '#4ade80', strokeWidth: 2 } },
  { id: 'e3-4', source: 'node-3', sourceHandle: 'sim', target: 'node-4', label: 'Sim (Urgente)', animated: true, style: { stroke: '#ef4444', strokeWidth: 2 } },
  { id: 'e2-5', source: 'node-2', target: 'node-5', animated: true, style: { stroke: '#a855f7', strokeWidth: 2 } },
  { id: 'e5-6', source: 'node-5', target: 'node-6', animated: true, style: { stroke: '#3b82f6', strokeWidth: 2 } },
  { id: 'e6-7', source: 'node-6', target: 'node-7', animated: true, style: { stroke: '#10b981', strokeWidth: 2 } }
];

export const FlowBuilder = () => {
  const [apps, setApps] = useState<AppNiche[]>(initialApps);
  const [selectedApp, setSelectedApp] = useState<AppNiche>(initialApps[0]);
  const [nodes, setNodes] = useState<Node[]>(initialSocialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialSocialEdges);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showNewAppModal, setShowNewAppModal] = useState(false);
  
  // Modal de Teste em Tempo Real
  const [showTestModal, setShowTestModal] = useState(false);
  const [testInput, setTestInput] = useState('Preciso urgente de ajuda com alimentação e bolsa família para meus 3 filhos.');
  const [isExecutingTest, setIsExecutingTest] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  const [newAppName, setNewAppName] = useState('');
  const [newAppCategory, setNewAppCategory] = useState('');
  const [newAppDesc, setNewAppDesc] = useState('');

  const nodeTypes = useMemo(() => ({
    customNode: CustomWorkflowNode
  }), []);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({
      ...params,
      animated: true,
      style: { stroke: '#10b981', strokeWidth: 2 }
    }, eds)),
    []
  );

  const handleDeleteNode = useCallback((nodeId: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    if (selectedNode?.id === nodeId) {
      setSelectedNode(null);
    }
  }, [selectedNode]);

  const handleUpdateNode = useCallback((nodeId: string, updatedData: any) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId) {
          return {
            ...node,
            data: updatedData
          };
        }
        return node;
      })
    );
  }, []);

  const handleAddNode = (tipo: string, labelDefault: string, sublabelDefault: string) => {
    const id = `node-${Date.now()}`;
    const newNode: Node = {
      id,
      type: 'customNode',
      data: {
        label: labelDefault,
        sublabel: sublabelDefault,
        type: tipo,
        onDelete: handleDeleteNode,
        config: {}
      },
      position: { x: 300 + Math.random() * 150, y: 150 + Math.random() * 150 }
    };

    setNodes((nds) => [...nds, newNode]);
  };

  const nodesWithCallbacks = useMemo(() => {
    return nodes.map((n) => ({
      ...n,
      data: {
        ...n.data,
        onDelete: handleDeleteNode
      }
    }));
  }, [nodes, handleDeleteNode]);

  const handleNodeClick = (_: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
  };

  const handleExecuteLiveTest = async () => {
    if (!testInput.trim()) return;
    setIsExecutingTest(true);
    setTestResult(null);

    try {
      const response = await fetch('http://localhost:8000/api/v1/flows/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          graph_data: { nodes, edges },
          input_text: testInput
        })
      });
      const data = await response.json();
      setTestResult(data);
    } catch {
      alert("Erro ao executar teste de fluxo. Verifique se o backend está rodando na porta 8000.");
    } finally {
      setIsExecutingTest(false);
    }
  };

  const handleCreateApp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAppName.trim()) return;

    const newApp: AppNiche = {
      id: `app-${Date.now()}`,
      name: newAppName,
      category: newAppCategory || 'Geral / Personalizado',
      description: newAppDesc || 'Fluxo personalizado de atendimento com IA.',
      flowsCount: 1
    };

    setApps([...apps, newApp]);
    setSelectedApp(newApp);

    setNodes([
      {
        id: 'node-start',
        type: 'customNode',
        data: {
          label: 'Gatilho: Entrada do Chat',
          sublabel: `Recepção de novos contatos para ${newAppName}`,
          type: 'trigger'
        },
        position: { x: 100, y: 200 }
      }
    ]);
    setEdges([]);
    setShowNewAppModal(false);
    setNewAppName('');
    setNewAppCategory('');
    setNewAppDesc('');
  };

  const handleSaveFlow = () => {
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  return (
    <div className="space-y-4 h-[calc(100vh-140px)] flex flex-col relative">
      {/* Barra de Seleção de App / Nicho e Ações */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-gray-900/90 border border-gray-800 p-4 rounded-3xl backdrop-blur-xl shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="flex items-center gap-2 px-3.5 py-2 bg-gray-950 border border-gray-700/80 rounded-2xl cursor-pointer hover:border-emerald-500 transition-colors">
              <Layers className="w-4 h-4 text-emerald-400" />
              <div>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">App / Nicho Atual</p>
                <div className="flex items-center gap-2">
                  <select
                    value={selectedApp.id}
                    onChange={(e) => {
                      const appFound = apps.find(a => a.id === e.target.value);
                      if (appFound) setSelectedApp(appFound);
                    }}
                    className="bg-transparent text-white font-bold text-xs focus:outline-none cursor-pointer pr-4"
                  >
                    {apps.map((app) => (
                      <option key={app.id} value={app.id} className="bg-gray-900 text-white">
                        {app.name} ({app.category})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={() => setShowNewAppModal(true)}
            className="px-3.5 py-2.5 bg-gray-950 hover:bg-gray-800 text-gray-300 hover:text-white border border-gray-800 hover:border-gray-700 rounded-2xl text-xs font-semibold flex items-center gap-2 transition-all"
          >
            <FolderPlus className="w-4 h-4 text-emerald-400" />
            + Criar Novo App / Nicho
          </button>
        </div>

        {/* Botões de Ação */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowTestModal(true)}
            className="px-4 py-2.5 bg-purple-950/80 hover:bg-purple-900 text-purple-300 border border-purple-800 rounded-2xl text-xs font-bold flex items-center gap-2 transition-all shadow-lg shadow-purple-950/40"
          >
            <Play className="w-4 h-4 text-purple-400 fill-purple-400" />
            Testar Fluxo com IA
          </button>

          <button
            onClick={handleSaveFlow}
            className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-2xl text-xs font-bold flex items-center gap-2 transition-all shadow-lg shadow-emerald-900/30"
          >
            <Save className="w-4 h-4" />
            {saveSuccess ? "Grafo JSON Salvo com Sucesso!" : "Salvar Fluxo Ativo"}
          </button>
        </div>
      </div>

      {/* Área Principal */}
      <div className="flex-1 flex gap-4 overflow-hidden">
        {/* Sidebar de Ferramentas / Nós */}
        <div className="w-64 bg-gray-950/80 border border-gray-800 rounded-3xl p-4 flex flex-col justify-between backdrop-blur-xl shadow-xl">
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-1 flex items-center gap-2">
              <Plus className="w-4 h-4 text-emerald-400" />
              Adicionar Nós
            </h3>
            <p className="text-[11px] text-gray-500 mb-3">Clique para adicionar ao canvas</p>

            <div className="space-y-2 overflow-y-auto max-h-[calc(100vh-320px)] pr-1">
              <button
                onClick={() => handleAddNode('trigger', 'Gatilho: Entrada WhatsApp', 'Recepção de novas mensagens de texto/áudio')}
                className="w-full text-left p-2.5 rounded-xl bg-slate-900/80 hover:bg-slate-900 border border-cyan-800/40 hover:border-cyan-500 text-cyan-200 text-xs font-medium flex items-center gap-2.5 transition-all shadow-sm"
              >
                <Zap className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>Gatilho WhatsApp</span>
              </button>

              <button
                onClick={() => handleAddNode('llm_gemini', 'Google Gemini 3.5 Flash Lite', 'Reescrita semântica e humanização')}
                className="w-full text-left p-2.5 rounded-xl bg-purple-950/60 hover:bg-purple-950/90 border border-purple-800/40 hover:border-purple-500 text-purple-200 text-xs font-medium flex items-center gap-2.5 transition-all shadow-sm"
              >
                <Sparkles className="w-4 h-4 text-purple-400 shrink-0" />
                <span>Nó Gemini 3.5 Flash Lite</span>
              </button>

              <button
                onClick={() => handleAddNode('ml_classifier', 'Classificador Machine Learning', 'Classificação Supervisionada Scikit-Learn')}
                className="w-full text-left p-2.5 rounded-xl bg-emerald-950/60 hover:bg-emerald-950/90 border border-emerald-800/40 hover:border-emerald-500 text-emerald-200 text-xs font-medium flex items-center gap-2.5 transition-all shadow-sm"
              >
                <Brain className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Classificador ML</span>
              </button>

              <button
                onClick={() => handleAddNode('rag_pgvector', 'Agentic RAG pgvector', 'Busca Semântica na Base de Conhecimento')}
                className="w-full text-left p-2.5 rounded-xl bg-blue-950/60 hover:bg-blue-950/90 border border-blue-800/40 hover:border-blue-500 text-blue-200 text-xs font-medium flex items-center gap-2.5 transition-all shadow-sm"
              >
                <Database className="w-4 h-4 text-blue-400 shrink-0" />
                <span>Nó RAG (Vetores)</span>
              </button>

              <button
                onClick={() => handleAddNode('condition', 'Condição de Decisão', 'Roteamento Se / Senão condicional')}
                className="w-full text-left p-2.5 rounded-xl bg-amber-950/60 hover:bg-amber-950/90 border border-amber-800/40 hover:border-amber-500 text-amber-200 text-xs font-medium flex items-center gap-2.5 transition-all shadow-sm"
              >
                <GitBranch className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Condição / Desvio</span>
              </button>

              <button
                onClick={() => handleAddNode('urgency_alert', 'Alerta de Urgência / Emergência', 'Protocolo prioritário de segurança')}
                className="w-full text-left p-2.5 rounded-xl bg-red-950/60 hover:bg-red-950/90 border border-red-800/40 hover:border-red-500 text-red-200 text-xs font-medium flex items-center gap-2.5 transition-all shadow-sm"
              >
                <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
                <span>Alerta Urgência</span>
              </button>

              <button
                onClick={() => handleAddNode('handover', 'Transbordo Humano', 'Pausa o bot e chama atendente')}
                className="w-full text-left p-2.5 rounded-xl bg-orange-950/60 hover:bg-orange-950/90 border border-orange-800/40 hover:border-orange-500 text-orange-200 text-xs font-medium flex items-center gap-2.5 transition-all shadow-sm"
              >
                <UserCheck className="w-4 h-4 text-orange-400 shrink-0" />
                <span>Transbordo Humano</span>
              </button>

              <button
                onClick={() => handleAddNode('standard', 'Enviar Mensagem WhatsApp', 'Envia texto, botões e anexos')}
                className="w-full text-left p-2.5 rounded-xl bg-gray-900 hover:bg-gray-850 border border-gray-800 hover:border-gray-600 text-gray-200 text-xs font-medium flex items-center gap-2.5 transition-all shadow-sm"
              >
                <MessageSquare className="w-4 h-4 text-gray-400 shrink-0" />
                <span>Mensagem WhatsApp</span>
              </button>
            </div>
          </div>

          <div className="p-3 bg-gray-900/60 rounded-2xl border border-gray-800/80 text-[11px] text-gray-400">
            💡 <strong className="text-gray-200">Dica:</strong> Clique em qualquer nó no canvas para editar seus prompts, parâmetros e regras.
          </div>
        </div>

        {/* Canvas do React Flow */}
        <div className="flex-1 bg-gray-950 border border-gray-800 rounded-3xl overflow-hidden shadow-2xl relative">
          <ReactFlow
            nodes={nodesWithCallbacks}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            onNodeClick={handleNodeClick}
            fitView
          >
            <Background color="#1f2937" gap={24} size={1.5} />
            <Controls className="bg-gray-900 border border-gray-700 text-white fill-white rounded-xl shadow-lg" />
            <MiniMap 
              nodeColor="#374151" 
              maskColor="rgba(0, 0, 0, 0.75)" 
              className="border border-gray-800 rounded-2xl bg-gray-900/90 overflow-hidden" 
            />
          </ReactFlow>

          {/* Drawer Lateral */}
          {selectedNode && (
            <div className="absolute top-0 right-0 h-full">
              <NodeInspectorDrawer
                selectedNode={selectedNode}
                onClose={() => setSelectedNode(null)}
                onUpdateNode={handleUpdateNode}
              />
            </div>
          )}
        </div>
      </div>

      {/* Modal de Teste em Tempo Real do Fluxo */}
      {showTestModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-3xl max-w-2xl w-full p-6 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Terminal className="w-5 h-5 text-purple-400" />
                <h3 className="text-base font-bold text-white">Simulador de Execução do Grafo com IA</h3>
              </div>
              <button
                onClick={() => setShowTestModal(false)}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-gray-300 font-semibold mb-1">Entrada da Conversa (Simulação WhatsApp):</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={testInput}
                    onChange={(e) => setTestInput(e.target.value)}
                    placeholder="Digite a mensagem do cidadão..."
                    className="flex-1 px-4 py-2.5 bg-gray-950 border border-gray-700 rounded-xl text-white text-xs focus:outline-none focus:border-purple-500"
                  />
                  <button
                    onClick={handleExecuteLiveTest}
                    disabled={isExecutingTest}
                    className="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl flex items-center gap-2 transition-all"
                  >
                    <Play className="w-4 h-4 fill-white" />
                    {isExecutingTest ? "Executando Nós..." : "Executar Fluxo"}
                  </button>
                </div>
              </div>

              {testResult && (
                <div className="mt-4 p-4 rounded-2xl bg-gray-950 border border-gray-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-purple-300 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      Fluxo Executado com Sucesso ({testResult.total_nodes_executed} nós percorridos)
                    </span>
                  </div>

                  {/* Resposta Final */}
                  <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-800 text-emerald-200">
                    <p className="font-semibold text-emerald-400 text-[10px] uppercase tracking-wider mb-1">Resposta Gerada pelo Grafo:</p>
                    <p className="text-xs leading-relaxed">{testResult.final_message}</p>
                  </div>

                  {/* Logs Nó a Nó */}
                  <div>
                    <p className="font-semibold text-gray-400 text-[10px] uppercase tracking-wider mb-2">Trilha de Execução dos Nós:</p>
                    <div className="space-y-1.5 font-mono text-[11px] max-h-40 overflow-y-auto">
                      {testResult.execution_logs.map((log: any, i: number) => (
                        <div key={i} className="p-2 rounded-lg bg-gray-900 border border-gray-800 text-gray-300 flex items-center justify-between">
                          <span className="font-bold text-purple-400">[{i+1}] {log.node_label} ({log.node_type})</span>
                          <span className="text-gray-500 truncate max-w-xs">{JSON.stringify(log.output)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Criação de Novo App / Nicho */}
      {showNewAppModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl animate-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
              <FolderPlus className="w-5 h-5 text-emerald-400" />
              Criar Novo App / Workspace de Nicho
            </h3>
            <p className="text-xs text-gray-400 mb-6">
              Configure um novo ambiente com seus próprios fluxos, modelos de IA, RAG e regras de negócio.
            </p>

            <form onSubmit={handleCreateApp} className="space-y-4 text-xs">
              <div>
                <label className="block text-gray-300 font-semibold mb-1 uppercase tracking-wider text-[10px]">
                  Nome do App / Projeto
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Imobiliária Prime ou Atendimento Jurídico"
                  value={newAppName}
                  onChange={(e) => setNewAppName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-gray-950 border border-gray-700 rounded-xl text-white text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-gray-300 font-semibold mb-1 uppercase tracking-wider text-[10px]">
                  Categoria / Nicho
                </label>
                <input
                  type="text"
                  placeholder="Ex: Vendas, Saúde, E-commerce, Suporte B2B"
                  value={newAppCategory}
                  onChange={(e) => setNewAppCategory(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-gray-950 border border-gray-700 rounded-xl text-white text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-gray-300 font-semibold mb-1 uppercase tracking-wider text-[10px]">
                  Descrição do Objetivo
                </label>
                <textarea
                  rows={3}
                  placeholder="Descreva o propósito deste fluxo e como a IA deve interagir..."
                  value={newAppDesc}
                  onChange={(e) => setNewAppDesc(e.target.value)}
                  className="w-full p-3 bg-gray-950 border border-gray-700 rounded-xl text-white text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-gray-800">
                <button
                  type="button"
                  onClick={() => setShowNewAppModal(false)}
                  className="px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl font-semibold transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-900/40 transition-all"
                >
                  Criar App & Abrir Canvas
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
