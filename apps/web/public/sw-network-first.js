// Service worker additionnel — navigations réseau-d'abord.
//
// Pourquoi : workbox (generateSW) sert le index.html du precache à TOUTE
// navigation (navigateFallback). Après un déploiement, le visiteur continue
// donc à voir l'ancien bundle tant que le nouveau service worker n'a pas fini
// de s'installer : il fallait DEUX rechargements pour basculer.
//
// Ici la navigation va d'abord sur le réseau : chaque rechargement sert le
// index.html donc le bundle COURANT. Après déploiement, un seul rechargement
// (souvent zéro) suffit — le nouveau service worker s'installe en tâche de
// fond pour la visite suivante.
//
// Hors-ligne : identique à avant — si le réseau échoue, on sert l'index.html
// du precache (shell). Il est toujours cohérent avec les assets precachés,
// contrairement à une copie gardée dans un cache de pages.
//
// Garde-fou : on ne répond qu'aux navigations SANS extension de fichier, pour
// ne jamais appeler respondWith sur une requête déjà gérée par workbox
// (précaching : /index.html, /manifest.webmanifest, /assets/*, /fonts/* …).
// Deux respondWith sur le même événement lèvent InvalidStateError.

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.mode !== 'navigate' || request.method !== 'GET') return;
  const path = new URL(request.url).pathname;
  if (/\.[a-z0-9]+$/i.test(path)) return; // .html/.js/.png/… → workbox

  event.respondWith(
    (async () => {
      try {
        // cache: 'no-cache' → jamais le HTML depuis le cache HTTP du navigateur
        // (c'est la condition pour qu'un rechargement soit toujours fraîch).
        const response = await fetch(new Request(request, { cache: 'no-cache' }));
        if (response.ok) return response;
        // Erreur serveur (5xx/4xx) : on retombe sur le shell plutôt que
        // d'afficher une page blanche quand le precache est disponible.
        const shell = await caches.match('/index.html', { ignoreSearch: true });
        return shell || response;
      } catch {
        const shell = await caches.match('/index.html', { ignoreSearch: true });
        return shell || Response.error();
      }
    })(),
  );
});
