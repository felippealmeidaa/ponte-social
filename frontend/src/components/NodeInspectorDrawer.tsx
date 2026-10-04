import { useState, useEffect } from 'react';
import { X, Sparkles, Sliders, Check, HelpCircle } from 'lucide-react';

interface NodeInspectorDrawerProps {
  selectedNode: any | null;
  onClose: () => void;
  onUpdateNode: (nodeId: string, updatedData: any) => void;
}

export const NodeInspectorDrawer = ({
  selectedNode,
  onClose,
  onUpdateNode
}: NodeInspectorDrawerProps) => {
  if (!selectedNode) return null;

  const [label, setLabel] = useState(selectedNode.data.label || '');
  const [sublabel, setSublabel] = useState(selectedNode.data.sublabel || '');
  const [prompt, setPrompt] = useState(selectedNode.data.config?.prompt || '');
  const [topK, setTopK] = useState(selectedNode.data.config?.topK || 3);
  const [model, setModel] = useState(selectedNode.data.config?.model || 'gemini-3.5-flash-lite');
  const [temperature, setTemperature] = useState(selectedNode.data.config?.temperature || 0.2);

  useEffect(() => {
    setLabel(selectedNode.data.label || '');
    setSublabel(selectedNode.data.sublabel || '');
    setPrompt(selectedNode.data.config?.prompt || '');
    setTopK(selectedNode.data.config?.topK || 3);
    setModel(selectedNode.data.config?.model || 'gemini-3.5-flash-lite');
    setTemperature(selectedNode.data.config?.temperature || 0.2);
  }, [selectedNode]);

  const handleSave = () => {
    onUpdateNode(selectedNode.id, {
      ...selectedNode.data,
      label,
      sublabel,
      config: {
        ...selectedNode.data.config,
        prompt,
        topK,
        model,
        temperature
      }
    });
    onClose();
  };

  const nodeType = selectedNode.data.type || 'standard';

  return (
    <div className="w-96 bg-gray-950/95 border-l border-gray-800/80 backdrop-blur-2xl h-full flex flex-col z-30 shadow-2xl animate-in slide-in-from-right duration-200">
      {/* Drawer Header */}
      <div className="p-5 border-b border-gray-800 flex items-center justify-between bg-gray-900/50">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <Sliders className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Configuração do Nó</h3>
            <p className="text-[11px] text-gray-400 uppercase font-mono tracking-wider">{nodeType}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Drawer Content */}
      <div className="flex-1 p-5 overflow-y-auto space-y-4 text-xs">
        {/* Título do Nó */}
        <div>
          <label className="block text-gray-300 font-semibold mb-1 uppercase tracking-wider text-[10px]">
            Nome do Nó / Ação
          </label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-xl text-white text-xs focus:outline-none focus:border-purple-500"
          />
        </div>

        {/* Descrição / Subtítulo */}
        <div>
          <label className="block text-gray-300 font-semibold mb-1 uppercase tracking-wider text-[10px]">
            Descrição Curta
          </label>
          <input
            type="text"
            value={sublabel}
            onChange={(e) => setSublabel(e.target.value)}
            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-xl text-white text-xs focus:outline-none focus:border-purple-500"
          />
        </div>

        {/* Configurações Específicas por Tipo de Nó */}
        {nodeType === 'llm_gemini' && (
          <div className="space-y-4 pt-2 border-t border-gray-800/80">
            <div className="flex items-center gap-1.5 text-purple-300 font-bold">
              <Sparkles className="w-3.5 h-3.5" />
              Parâmetros do Google Gemini
            </div>

            <div>
              <label className="block text-gray-400 mb-1">Modelo de LLM</label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-xl text-white text-xs focus:outline-none"
              >
                <option value="gemini-3.5-flash-lite">Google Gemini 3.5 Flash Lite (Recomendado)</option>
                <option value="gemini-2.0-flash">Google Gemini 2.0 Flash</option>
                <option value="gemini-1.5-flash-8b">Google Gemini 1.5 Flash 8B</option>
              </select>
            </div>

            <div>
              <label className="block text-gray-400 mb-1">Prompt de Instrução do Sistema (System Instruction)</label>
              <textarea
                rows={4}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Ex: Você é uma assistente social de triagem..."
                className="w-full p-3 bg-gray-900 border border-gray-700 rounded-xl text-white text-xs focus:outline-none font-mono"
              />
            </div>

            <div>
              <div className="flex justify-between text-gray-400 mb-1">
                <span>Temperatura / Criatividade:</span>
                <span className="font-mono text-white">{temperature}</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="w-full accent-purple-500"
              />
            </div>
          </div>
        )}

        {nodeType === 'rag_pgvector' && (
          <div className="space-y-4 pt-2 border-t border-gray-800/80">
            <div>
              <label className="block text-gray-400 mb-1">Base de Conhecimento / Tabela Vetorial</label>
              <select className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-xl text-white text-xs">
                <option>Equipamentos Públicos & CRAS de Anápolis (pgvector)</option>
                <option>Regulamento Bolsa Família e BPC (PDFs)</option>
                <option>Catálogo Geral de Benefícios Municipais</option>
              </select>
            </div>

            <div>
              <label className="block text-gray-400 mb-1">Top K (Documentos mais relevantes): {topK}</label>
              <input
                type="range"
                min="1"
                max="10"
                value={topK}
                onChange={(e) => setTopK(parseInt(e.target.value))}
                className="w-full accent-blue-500"
              />
            </div>
          </div>
        )}

        {nodeType === 'ml_classifier' && (
          <div className="space-y-3 pt-2 border-t border-gray-800/80">
            <div>
              <label className="block text-gray-400 mb-1">Modelo de Classificação Supervisionado</label>
              <select className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-xl text-white text-xs">
                <option>Linear SVM + TF-IDF (F1-Macro 1.0000 - Campeão)</option>
                <option>Regressão Logística Multinomial</option>
                <option>Multinomial Naive Bayes</option>
              </select>
            </div>
            <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-800 text-emerald-300 text-[11px]">
              ✓ Detecção prioritária de violência ativa com revocação máxima.
            </div>
          </div>
        )}

        <div className="p-3.5 rounded-xl bg-gray-900/60 border border-gray-800 text-gray-400 flex items-start gap-2 text-[11px]">
          <HelpCircle className="w-4 h-4 text-gray-500 shrink-0 mt-0.5" />
          <span>Qualquer alteração feita neste nó será aplicada imediatamente ao motor de orquestração do LangGraph.</span>
        </div>
      </div>

      {/* Drawer Footer */}
      <div className="p-4 border-t border-gray-800 bg-gray-900/50 flex gap-2">
        <button
          onClick={handleSave}
          className="flex-1 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all text-xs shadow-lg shadow-emerald-900/30"
        >
          <Check className="w-3.5 h-3.5" /> Aplicar Alterações
        </button>
      </div>
    </div>
  );
};
