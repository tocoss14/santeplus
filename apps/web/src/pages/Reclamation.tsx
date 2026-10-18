import { useState } from 'react';
import { Link } from 'react-router-dom';

export default function Reclamation() {
  const [sent, setSent] = useState(false);
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const subject = encodeURIComponent(`Réclamation SantéPlus — ${fd.get('objet')}`);
    const body = encodeURIComponent(`Nom : ${fd.get('nom')}\nEmail : ${fd.get('email')}\nN° adhérent : ${fd.get('numero')}\n\n${fd.get('message')}`);
    window.location.href = `mailto:reclamations@santeplus.bj?subject=${subject}&body=${body}`;
    setSent(true);
  };
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl sm:text-3xl font-bold text-center">Réclamation et médiation</h1>
      <p className="mt-2 text-center text-sm text-slate-500">Vous rencontrez un différend ? Soumettez votre réclamation ; une médiation indépendante peut être saisie en cas de désaccord.</p>
      {sent ? (
        <div className="card-p mt-6 text-center">
          <p className="font-semibold text-emerald-700">Votre client mail a été ouvert. Envoyez le message pour finaliser la réclamation.</p>
          <Link to="/" className="btn-primary btn-sm mt-4">Retour à l'accueil</Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="card-p mt-6 space-y-3">
          <label className="block"><span className="label">Nom complet</span><input name="nom" className="input" required /></label>
          <label className="block"><span className="label">Email</span><input name="email" type="email" className="input" required /></label>
          <label className="block"><span className="label">N° d'adhérent</span><input name="numero" className="input" /></label>
          <label className="block"><span className="label">Objet</span><input name="objet" className="input" required /></label>
          <label className="block"><span className="label">Message</span><textarea name="message" className="input" rows={5} required /></label>
          <button type="submit" className="btn-primary w-full">Envoyer la réclamation</button>
        </form>
      )}
      <div className="mt-6 text-sm text-slate-600">
        <p><b>Médiation indépendante :</b> en cas de désaccord persistant, vous pouvez saisir le médiateur de la mutuelle dont les coordonnées figurent dans les conditions générales.</p>
      </div>
    </div>
  );
}
