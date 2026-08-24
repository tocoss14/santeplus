import { useEffect, useState } from 'react';
import { api } from '../../api';
import { fmtDateTime } from '../../format';
import { EmptyState, Spinner } from '../../components/ui';
import { useAuth } from '../../auth';

export default function Notifications() {
  const [items, setItems] = useState<any[] | null>(null);
  const { refresh } = useAuth();

  useEffect(() => {
    api.get<any[]>('/notifications').then(setItems).catch(() => setItems([]));
  }, []);

  const readAll = async () => {
    await api.post('/notifications/read-all');
    setItems(list => (list ?? []).map(i => ({ ...i, readAt: i.readAt ?? new Date().toISOString() })));
    refresh();
  };

  const open = async (n: any) => {
    if (!n.readAt) {
      await api.post(`/notifications/${n.id}/read`);
      setItems(list => (list ?? []).map(i => (i.id === n.id ? { ...i, readAt: new Date().toISOString() } : i)));
      refresh();
    }
  };

  if (!items) return <Spinner />;

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Notifications</h1>
        <button onClick={readAll} className="text-xs font-semibold text-brand-700 hover:underline">Tout marquer comme lu</button>
      </div>
      {items.length === 0 ? (
        <EmptyState icon="🔔" title="Aucune notification" />
      ) : (
        <ul className="space-y-2">
          {items.map(n => (
            <li key={n.id}>
              <button
                onClick={() => open(n)}
                className={`w-full card-p text-left flex gap-3 ${!n.readAt ? 'border-brand-300 bg-brand-50/50' : ''}`}
              >
                {!n.readAt && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-600" />}
                <div className={n.readAt ? '' : 'pl-0'}>
                  <p className={`text-sm ${!n.readAt ? 'font-semibold' : 'font-medium'}`}>{n.title}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{n.body}</p>
                  <p className="mt-1 text-[10px] text-slate-400">{fmtDateTime(n.createdAt)}</p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
