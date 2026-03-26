// api/live-game.js
// Vercel Serverless Function — Proxy sécurisé vers l'API Riot
// Déploiement : connecte ce repo GitHub à Vercel, ajoute RIOT_API_KEY en variable d'environnement

const RIOT_API_KEY = process.env.RIOT_API_KEY;

// Mapping région → routing
const REGION_TO_ROUTING = {
  euw1: 'europe', eun1: 'europe', tr1: 'europe', ru: 'europe',
  na1: 'americas', br1: 'americas', la1: 'americas', la2: 'americas',
  kr: 'asia', jp1: 'asia',
  oc1: 'sea', ph2: 'sea', sg2: 'sea', th2: 'sea', tw2: 'sea', vn2: 'sea'
};

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!RIOT_API_KEY) {
    return res.status(500).json({ error: 'RIOT_API_KEY non configurée sur le serveur.' });
  }

  const { gameName, tagLine, region } = req.query;

  if (!gameName || !tagLine || !region) {
    return res.status(400).json({ error: 'Paramètres manquants : gameName, tagLine, region.' });
  }

  const routing = REGION_TO_ROUTING[region] || 'europe';

  try {
    // 1. Récupérer le PUUID via Riot ID
    const accountRes = await fetch(
      `https://${routing}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
      { headers: { 'X-Riot-Token': RIOT_API_KEY } }
    );

    if (!accountRes.ok) {
      const err = await accountRes.json();
      if (accountRes.status === 404) return res.status(404).json({ error: `Joueur "${gameName}#${tagLine}" introuvable.` });
      return res.status(accountRes.status).json({ error: err.status?.message || 'Erreur Riot API.' });
    }

    const account = await accountRes.json();
    const puuid = account.puuid;

    // 2. Récupérer la partie en cours (Spectator v5)
    const gameRes = await fetch(
      `https://${region}.api.riotgames.com/lol/spectator/v5/active-games/by-summoner/${puuid}`,
      { headers: { 'X-Riot-Token': RIOT_API_KEY } }
    );

    if (gameRes.status === 404) {
      return res.status(404).json({ error: `${gameName} n'est pas en partie en ce moment.` });
    }

    if (!gameRes.ok) {
      const err = await gameRes.json();
      return res.status(gameRes.status).json({ error: err.status?.message || 'Erreur récupération partie.' });
    }

    const gameData = await gameRes.json();

    // 3. Extraire uniquement les données nécessaires (pas d'infos sensibles)
    const participants = gameData.participants.map(p => ({
      championName: p.championName,
      teamId: p.teamId,
      teamPosition: p.teamPosition || '',
      riotId: p.riotId || p.summonerName || '',
      summonerName: p.summonerName || ''
    }));

    return res.status(200).json({
      gameMode: gameData.gameMode,
      gameType: gameData.gameType,
      participants
    });

  } catch (err) {
    console.error('Proxy error:', err);
    return res.status(500).json({ error: 'Erreur interne du proxy.' });
  }
}
