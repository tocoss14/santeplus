import { useState } from 'react';
import NewThirdParty from './NewThirdParty';
import TpList from './TpList';

type Tab = 'nouvelle' | 'historique';

export default function ProviderTpUnified() {
  const [tab, setTab] = useState<Tab>('nouvelle');

  return (
    <div className="space-y-4">
      {/* Onglets */}
      <div className="flex rounded-xl bg-slate-100 p-1 gap-1">
        <button
          onClick={() => setTab('nouvelle')}
          className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-medium transition ${
            tab === 'nouvelle' ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          ➕ Nouvelle PEC
        </button>
        <button
          onClick={() => setTab('historique')}
          className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-medium transition ${
            tab === 'historique' ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          📋 Historique
        </button>
      </div>

      {tab === 'nouvelle' && <NewThirdParty />}
      {tab === 'historique' && <TpList />}
    </div>
  );
}
