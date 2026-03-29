// api/live-game.js
// Vercel Serverless Function — Proxy sécurisé vers l'API Riot
// Fix: championId → championName via DDragon mapping

const RIOT_API_KEY = process.env.RIOT_API_KEY;

const REGION_TO_ROUTING = {
  euw1:'europe', eun1:'europe', tr1:'europe', ru:'europe',
  na1:'americas', br1:'americas', la1:'americas', la2:'americas',
  kr:'asia', jp1:'asia',
  oc1:'sea', ph2:'sea', sg2:'sea', th2:'sea', tw2:'sea', vn2:'sea'
};

// Cache en mémoire pour éviter de refetch le mapping à chaque requête
let championIdMap = null;
let championIdMapVersion = null;

async function getChampionIdMap() {
  // 1. Récupérer la dernière version DDragon
  const verRes = await fetch('https://ddragon.leagueoflegends.com/api/versions.json');
  const versions = await verRes.json();
  const latestVersion = versions[0];

  // Utiliser le cache si la version n'a pas changé
  if (championIdMap && championIdMapVersion === latestVersion) {
    return championIdMap;
  }

  // 2. Fetcher le fichier champion.json
  const champRes = await fetch(`https://ddragon.leagueoflegends.com/cdn/${latestVersion}/data/en_US/champion.json`);
  const champData = await champRes.json();

  // 3. Construire le mapping id → name
  const map = {};
  for (const [key, champ] of Object.entries(champData.data)) {
    map[parseInt(champ.key)] = champ.name; // champ.key est le championId en string
  }

  championIdMap = map;
  championIdMapVersion = latestVersion;
  return map;
}

module.exports = async function handler(req, res) {
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
    // 1. PUUID via Riot ID
    const accountRes = await fetch(
      `https://${routing}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
      { headers: { 'X-Riot-Token': RIOT_API_KEY } }
    );
    if (!accountRes.ok) {
      const err = await accountRes.json();
      if (accountRes.status === 404) return res.status(404).json({ error: `Joueur "${gameName}#${tagLine}" introuvable.` });
      return res.status(accountRes.status).json({ error: err.status?.message || 'Erreur Riot API.' });
    }
    const { puuid } = await accountRes.json();

    // 2. Partie en cours (Spectator v5)
    const gameRes = await fetch(
      `https://${region}.api.riotgames.com/lol/spectator/v5/active-games/by-summoner/${puuid}`,
      { headers: { 'X-Riot-Token': RIOT_API_KEY } }
    );
    if (gameRes.status === 404) return res.status(404).json({ error: `${gameName} n'est pas en partie en ce moment.` });
    if (!gameRes.ok) {
      const err = await gameRes.json();
      return res.status(gameRes.status).json({ error: err.status?.message || 'Erreur récupération partie.' });
    }
    const gameData = await gameRes.json();

    // 3. Mapping championId → championName
    const idMap = await getChampionIdMap();

    // 4. Construire la liste des participants avec le vrai nom du champion
    const participants = gameData.participants.map(p => {
      // L'API Spectator v5 retourne championId (number), pas championName
      const championName = p.championName
        || idMap[p.championId]
        || idMap[parseInt(p.championId)]
        || `Champion${p.championId}`;

      return {
        championName,
        championId: p.championId,
        teamId: p.teamId,
        teamPosition: p.teamPosition || '',
        riotId: p.riotId || p.summonerName || '',
        summonerName: p.summonerName || ''
      };
    });

    return res.status(200).json({
      gameMode: gameData.gameMode,
      gameType: gameData.gameType,
      participants
    });

  } catch (err) {
    console.error('Proxy error:', err);
    return res.status(500).json({ error: 'Erreur interne du proxy : ' + err.message });
  }
};
