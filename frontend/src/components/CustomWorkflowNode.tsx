import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { 
  Sparkles, 
  Trash2, 
  Brain, 
  ShieldAlert, 
  Database, 
  GitBranch, 
  MessageSquare, 
  UserCheck,
  Zap
} from 'lucide-react';

interface CustomNodeData {
  label: string;
  sublabel?: string;
  type: string;
  config?: Record<string, any>;
  onDelete?: (id: string) => void;
  onSelectNode?: (nodeData: any) => void;
}

export const CustomWorkflowNode = ({ id, data, selected }: NodeProps) => {
  const nodeData = data as unknown as CustomNodeData;

  const getNodeTheme = () => {
    switch (nodeData.type) {
      case 'trigger':
        return {
          bg: 'bg-slate-900/90',
          border: selected ? 'border-cyan-400 ring-2 ring-cyan-400/30' : 'border-cyan-800/60 hover:border-cyan-500',
          badge: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
          icon: <Zap className="w-4 h-4 text-cyan-400" />,
          titleColor: 'text-cyan-200'
        };
      case 'ml_classifier':
        return {
          bg: 'bg-emerald-950/80',
          border: selected ? 'border-emerald-400 ring-2 ring-emerald-400/30' : 'border-emerald-800/60 hover:border-emerald-500',
          badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
          icon: <Brain className="w-4 h-4 text-emerald-400" />,
          titleColor: 'text-emerald-200'
        };
      case 'llm_gemini':
        return {
          bg: 'bg-purple-950/80',
          border: selected ? 'border-purple-400 ring-2 ring-purple-400/30' : 'border-purple-800/60 hover:border-purple-500',
          badge: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
          icon: <Sparkles className="w-4 h-4 text-purple-400" />,
          titleColor: 'text-purple-200'
        };
      case 'rag_pgvector':
        return {
          bg: 'bg-blue-950/80',
          border: selected ? 'border-blue-400 ring-2 ring-blue-400/30' : 'border-blue-800/60 hover:border-blue-500',
          badge: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
          icon: <Database className="w-4 h-4 text-blue-400" />,
          titleColor: 'text-blue-200'
        };
      case 'condition':
        return {
          bg: 'bg-amber-950/80',
          border: selected ? 'border-amber-400 ring-2 ring-amber-400/30' : 'border-amber-800/60 hover:border-amber-500',
          badge: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
          icon: <GitBranch className="w-4 h-4 text-amber-400" />,
          titleColor: 'text-amber-200'
        };
      case 'urgency_alert':
        return {
          bg: 'bg-red-950/90',
          border: selected ? 'border-red-400 ring-2 ring-red-400/40' : 'border-red-800/80 hover:border-red-500',
          badge: 'bg-red-500/20 text-red-400 border-red-500/40',
          icon: <ShieldAlert className="w-4 h-4 text-red-400" />,
          titleColor: 'text-red-200'
        };
      case 'handover':
        return {
          bg: 'bg-orange-950/80',
          border: selected ? 'border-orange-400 ring-2 ring-orange-400/30' : 'border-orange-800/60 hover:border-orange-500',
          badge: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
          icon: <UserCheck className="w-4 h-4 text-orange-400" />,
          titleColor: 'text-orange-200'
        };
      default:
        return {
          bg: 'bg-gray-900/90',
          border: selected ? 'border-gray-400 ring-2 ring-gray-400/20' : 'border-gray-800 hover:border-gray-600',
          badge: 'bg-gray-800 text-gray-300 border-gray-700',
          icon: <MessageSquare className="w-4 h-4 text-gray-400" />,
          titleColor: 'text-gray-200'
        };
    }
  };

  const theme = getNodeTheme();

  return (
    <div className={`w-72 rounded-2xl border backdrop-blur-xl shadow-2xl p-4 transition-all relative ${theme.bg} ${theme.border}`}>
      {/* Handle de Entrada (Esquerda) */}
      <Handle
        type="target"
        position={Position.Left}
        className="w-3.5 h-3.5 !bg-gray-400 border-2 border-gray-900 !rounded-full hover:!bg-white transition-colors"
      />

      {/* Header do Nó */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-gray-900/60 border border-gray-800/80 shadow-inner">
            {theme.icon}
          </div>
          <div>
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${theme.badge}`}>
              {nodeData.type.replace('_', ' ')}
            </span>
            <h4 className={`text-xs font-bold mt-1 leading-tight ${theme.titleColor}`}>
              {nodeData.label}
            </h4>
          </div>
        </div>

        {/* Botão de Excluir Nó */}
        {nodeData.onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              nodeData.onDelete?.(id);
            }}
            title="Excluir este nó"
            className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-950/40 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Descrição / Configuração do Nó */}
      {nodeData.sublabel && (
        <p className="text-[11px] text-gray-400 line-clamp-2 bg-gray-950/40 p-2 rounded-lg border border-gray-800/40 mt-2 font-mono">
          {nodeData.sublabel}
        </p>
      )}

      {/* Handles de Saída (Direita / Condicionais) */}
      {nodeData.type === 'condition' ? (
        <>
          <Handle
            id="sim"
            type="source"
            position={Position.Right}
            style={{ top: '35%' }}
            className="w-3.5 h-3.5 !bg-red-500 border-2 border-gray-900 !rounded-full hover:!bg-red-300 transition-colors"
          />
          <Handle
            id="nao"
            type="source"
            position={Position.Right}
            style={{ top: '70%' }}
            className="w-3.5 h-3.5 !bg-emerald-500 border-2 border-gray-900 !rounded-full hover:!bg-emerald-300 transition-colors"
          />
        </>
      ) : (
        <Handle
          type="source"
          position={Position.Right}
          className="w-3.5 h-3.5 !bg-gray-400 border-2 border-gray-900 !rounded-full hover:!bg-white transition-colors"
        />
      )}
    </div>
  );
};
