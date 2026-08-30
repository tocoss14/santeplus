import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { api, fileUrl } from '../../api';
import { fmtDate } from '../../format';
import { Spinner, StatusBadge } from '../../components/ui';

export default function DigitalCard() {
  const [card, setCard] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    api.get<any[]>('/contracts/mine')
      .then(async list => {
        const target = list.find(c => ['ACTIVE', 'SUSPENDED', 'PENDING_PAYMENT'].includes(c.status)) ?? list[0];
        if (!target) throw new Error('Aucun contrat');
        setCard(await api.get(`/contracts/${target.id}/card`));
      })
      .catch(e => setError(e?.message ?? 'Carte indisponible'));
  };

  useEffect(() => { load(); }, []);

  if (error) return <div className="card-p text-center text-slate-500">{error}</div>;
  if (!card) return <Spinner />;

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-xl font-bold">Ma carte d’assuré</h1>

      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-700 via-brand-600 to-teal-500 p-5 text-white shadow-lg">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
        <div className="absolute -bottom-14 -left-6 h-36 w-36 rounded-full bg-black/10" />
        <div className="relative">
          <div className="flex items-start justify-between">
            <p className="text-xs font-bold uppercase tracking-widest text-brand-100">SantéPlus · Carte assuré</p>
            <StatusBadge status={card.status} />
          </div>
          <div className="mt-4 flex items-center gap-4">
            {card.photoFileId ? (
              <img
                src={fileUrl(card.photoFileId)}
                alt="Photo d'identité"
                className="h-20 w-20 rounded-full border-2 border-white/40 object-cover shadow-lg"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-white/20 bg-white/10 text-3xl">
                👤
              </div>
            )}
            <div>
              <p className="text-xl font-bold">{card.holder}</p>
              <p className="text-sm text-brand-100">{card.productName}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-brand-100">
            <span>N° assuré<br /><b className="text-white tracking-wide">{card.memberNumber}</b></span>
            <span>Contrat<br /><b className="text-white">{card.contractNumber}</b></span>
            <span>Valable jusqu’au<br /><b className="text-white">{fmtDate(card.validUntil)}</b></span>
          </div>
          <div className="mt-4 flex justify-end">
            <div className="rounded-xl bg-white p-2.5 shadow">
              <QRCodeSVG value={card.qrPayload} size={104} level="M" />
              <p className="mt-1 text-center text-[8px] font-semibold text-slate-400">VÉRIFICATION OFFICIELLE</p>
            </div>
          </div>
        </div>
      </div>

      <div className="card-p text-sm text-slate-600 space-y-2">
        <p><b>Chez un prestataire partenaire :</b> présentez ce QR code. Le prestataire vérifie en temps réel votre contrat, vos garanties et vos plafonds restants.</p>
        <p className="text-xs text-slate-400">🔒 Le QR code ne contient aucune donnée personnelle — uniquement un jeton sécurisé à usage de vérification.</p>
      </div>

      <button
        className="btn-outline w-full"
        onClick={async () => {
          if (!confirm('Régénérer le code ? L’ancien sera immédiatement invalide.')) return;
          await api.post(`/contracts/${(await api.get('/contracts/mine'))[0].id}/rotate-token`);
          load();
        }}
      >
        🔄 Régénérer le QR code (sécurité)
      </button>
    </div>
  );
}
