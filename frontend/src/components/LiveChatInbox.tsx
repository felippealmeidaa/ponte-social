import { useState } from 'react';
import { MessageSquare, User, Bot, PauseCircle, PlayCircle, Send } from 'lucide-react';

interface ChatMessage {
  id: string;
  sender: 'CITIZEN' | 'BOT' | 'AGENT';
  text: string;
  time: string;
}

interface ChatContact {
  id: string;
  name: string;
  phone: string;
  lastMessage: string;
  time: string;
  unread: number;
  isBotPaused: boolean;
  categoria: string;
}

export const LiveChatInbox = () => {
  const [contacts, setContacts] = useState<ChatContact[]>([
    {
      id: '1',
      name: 'Maria Silva (CadÚnico / Bolsa Família)',
      phone: '+55 62 98888-3321',
      lastMessage: 'Queria saber se posso levar o comprovante de água.',
      time: '16:12',
      unread: 1,
      isBotPaused: false,
      categoria: 'renda_beneficio'
    },
    {
      id: '2',
      name: 'Vítima Acolhimento Emergencial',
      phone: '+55 62 98123-4411',
      lastMessage: 'Estou na viatura a caminho da delegacia.',
      time: '15:45',
      unread: 0,
      isBotPaused: true,
      categoria: 'violencia_protecao'
    },
    {
      id: '3',
      name: 'Carlos Oliveira (BPC Idoso)',
      phone: '+55 62 99111-7722',
      lastMessage: 'Obrigado pelas orientações!',
      time: '14:20',
      unread: 0,
      isBotPaused: false,
      categoria: 'pessoa_idosa_pcd'
    }
  ]);

  const [selectedContact, setSelectedContact] = useState<ChatContact>(contacts[0]);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: '1', sender: 'CITIZEN', text: 'Olá, preciso de ajuda para conseguir o Bolsa Família e cesta básica.', time: '16:08' },
    { id: '2', sender: 'BOT', text: 'Olá! Sou a assistente virtual do CRAS. Identifiquei sua demanda como: Programas de Transferência de Renda. O CRAS mais próximo fica na Av. Brasil Sul. Documentos: RG, CPF de todos e comprovante.', time: '16:09' },
    { id: '3', sender: 'CITIZEN', text: 'Queria saber se posso levar o comprovante de água em vez de energia.', time: '16:12' }
  ]);
  const [inputText, setInputText] = useState('');

  const handleToggleBot = (contactId: string) => {
    const updated = contacts.map(c => {
      if (c.id === contactId) {
        return { ...c, isBotPaused: !c.isBotPaused };
      }
      return c;
    });
    setContacts(updated);
    if (selectedContact.id === contactId) {
      setSelectedContact({ ...selectedContact, isBotPaused: !selectedContact.isBotPaused });
    }
  };

  const handleSendMessage = () => {
    if (!inputText.trim()) return;
    const newMsg: ChatMessage = {
      id: `${messages.length + 1}`,
      sender: 'AGENT',
      text: inputText,
      time: 'Agora'
    };
    setMessages([...messages, newMsg]);

    // Se o bot não estava pausado, pausa automaticamente ao atendente responder
    if (!selectedContact.isBotPaused) {
      handleToggleBot(selectedContact.id);
    }
    setInputText('');
  };

  return (
    <div className="h-[calc(100vh-140px)] flex flex-col md:flex-row bg-gray-900/80 border border-gray-800 rounded-2xl overflow-hidden backdrop-blur-md shadow-2xl">
      {/* Lista Lateral de Contatos / Conversas */}
      <div className="w-full md:w-80 border-r border-gray-800 bg-gray-950/60 flex flex-col">
        <div className="p-4 border-b border-gray-800">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-emerald-400" />
            Live Chat WhatsApp (Meta / Evolution)
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">Inbox oficial de atendimento ao cidadão</p>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-gray-800/40">
          {contacts.map((contact) => (
            <button
              key={contact.id}
              onClick={() => setSelectedContact(contact)}
              className={`w-full text-left p-4 transition-all flex items-start gap-3 ${
                selectedContact.id === contact.id
                  ? 'bg-emerald-950/20 border-l-4 border-emerald-500'
                  : 'hover:bg-gray-900/40'
              }`}
            >
              <div className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center text-gray-300 font-bold shrink-0">
                <User className="w-5 h-5 text-gray-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline mb-1">
                  <p className="text-xs font-semibold text-white truncate">{contact.name}</p>
                  <span className="text-[10px] text-gray-500 font-mono">{contact.time}</span>
                </div>
                <p className="text-xs text-gray-400 truncate">{contact.lastMessage}</p>
                <div className="flex items-center gap-2 mt-2">
                  {contact.isBotPaused ? (
                    <span className="text-[10px] bg-orange-500/20 text-orange-300 px-2 py-0.5 rounded-md font-medium flex items-center gap-1">
                      <PauseCircle className="w-3 h-3" /> Humano Ativo
                    </span>
                  ) : (
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-md font-medium flex items-center gap-1">
                      <Bot className="w-3 h-3" /> Bot Operando
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Painel Central de Mensagens do Chat */}
      <div className="flex-1 flex flex-col bg-gray-950">
        {/* Header da Conversa Ativa */}
        <div className="p-4 border-b border-gray-800 flex items-center justify-between bg-gray-900/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-950/80 border border-emerald-700 flex items-center justify-center text-emerald-400">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">{selectedContact.name}</h3>
              <p className="text-xs text-gray-400 font-mono">{selectedContact.phone}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleToggleBot(selectedContact.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                selectedContact.isBotPaused
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  : 'bg-orange-600 hover:bg-orange-500 text-white'
              }`}
            >
              {selectedContact.isBotPaused ? (
                <>
                  <PlayCircle className="w-4 h-4" /> Retomar Bot
                </>
              ) : (
                <>
                  <PauseCircle className="w-4 h-4" /> Pausar Bot (Assumir Atendimento)
                </>
              )}
            </button>
          </div>
        </div>

        {/* Lista de Mensagens */}
        <div className="flex-1 p-6 overflow-y-auto space-y-4">
          {messages.map((msg) => {
            const isCitizen = msg.sender === 'CITIZEN';
            const isBot = msg.sender === 'BOT';
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isCitizen ? 'items-start' : 'items-end'}`}
              >
                <div className="flex items-center gap-1.5 text-[11px] text-gray-400 mb-1 px-1">
                  {isCitizen ? <User className="w-3 h-3 text-blue-400" /> : isBot ? <Bot className="w-3 h-3 text-emerald-400" /> : <User className="w-3 h-3 text-purple-400" />}
                  <span>{isCitizen ? "Cidadão" : isBot ? "Assistente IA Social" : "Atendente CRAS (Você)"}</span>
                  <span className="font-mono text-gray-500">• {msg.time}</span>
                </div>
                <div
                  className={`max-w-md p-4 rounded-2xl text-sm leading-relaxed ${
                    isCitizen
                      ? 'bg-gray-800 text-gray-100 rounded-tl-sm border border-gray-700'
                      : isBot
                      ? 'bg-emerald-950/60 text-emerald-100 border border-emerald-800 rounded-tr-sm'
                      : 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-tr-sm shadow-md'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            );
          })}
        </div>

        {/* Input de Envio de Mensagem */}
        <div className="p-4 border-t border-gray-800 bg-gray-900/40">
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Digite uma mensagem como atendente do CRAS..."
              className="flex-1 px-4 py-3 bg-gray-950 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 text-sm"
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
            />
            <button
              onClick={handleSendMessage}
              className="p-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition-all shadow-lg shadow-emerald-900/30"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
