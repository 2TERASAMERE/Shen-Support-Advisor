// api/analyze.js
// Vercel Serverless Function — Appel Claude avec la draft + knowledge base

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Knowledge de base intégrée directement (évite les problèmes de require() sur Vercel)
// Pour modifier : édite ce bloc ET/OU le fichier knowledge.js du repo
const SHEN_KNOWLEDGE_BASE = `
CORE BUILD (règles absolues) :
- Flûte de Bandle est TOUJOURS le premier item, sans exception.
- Harnais Protoplasmique est TOUJOURS le deuxième item, sans exception.
- Ces deux items ne sont jamais remplacés ni réordonnés.

RÈGLES D'ITEMISATION PAR SITUATION :
- Contre une compo full AD : Tabi Ninja obligatoires, Coeur Gelé en 4ème item.
- Contre une compo full AP : Bottes de Mercure obligatoires, Force de la Nature en 4ème.
- Si l'ennemi a du healing important (Aatrox, Soraka, Vladimir) : Mail Epineux obligatoire.
- Si compo poke ennemie (Xerath, Lux, Ezreal) : Rédemption en 3ème item avant les bottes.
- Si ADC immobile et vulnérable au dive (Jinx, Kog'Maw, Aphelios) : Voeu du Chevalier en 3ème.
- Si alliés ont des dégâts magiques significatifs : Masque Abyssal pour amplifier leurs dégâts.
- Contre Zed, Talon ou assassin AD ciblant l'ADC : Gargoyle en 3ème item.
- Warmog en fin de build si besoin de sustain pour être présent partout via l'ulti.

GAMEPLAY :
- L'ulti (Stand United) est la priorité numéro 1 : toujours savoir quel allié protéger.
- Prioriser l'ulti sur le carry le plus en danger, pas forcément l'ADC.
- Le bon timing d'ulti : allié en fight à 50-60% de vie, pas en urgence à 10%.
- En teamfight : taunt (E) le maximum d'ennemis, garder l'ulti pour le carry focusé.
- Avec Locket : activer le bouclier AVANT de plonger dans le teamfight.

MATCHUPS :
- Contre Vayne : True Damage ignore le tank, jouer autour de l'ulti.
- Contre Zed ulti : l'ulti Shen peut servir de sauvegarde sur le carry cible.
- Avec Jinx ADC : Voeu du Chevalier prioritaire, elle est immobile.
- Avec Samira : coordonner son ulti + engage Shen pour les resets.

STYLE DE JEU :
- EUW, elo Gold/Platine.
- Style proactif, beaucoup de rotations via l'ulti.
- Impact global plutôt que rester en lane.
`;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY non configurée sur le serveur.' });
  }

  const { allies, enemies, customKnowledge } = req.body;

  if (!allies || !enemies) {
    return res.status(400).json({ error: 'Paramètres manquants : allies, enemies.' });
  }

  const knowledgeBlock = buildKnowledgeBlock(customKnowledge);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1200,
        system: buildSystemPrompt(knowledgeBlock),
        messages: [{ role: 'user', content: buildPrompt(allies, enemies) }]
      })
    });

    if (!response.ok) {
      const err = await response.json();
      return res.status(response.status).json({ error: err.error?.message || 'Erreur API Anthropic.' });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';

    const clean = text.replace(/```json|```/g, '').trim();
    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch {
      return res.status(200).json({ raw: text, parsed: false });
    }

    return res.status(200).json({ ...parsed, parsed: true });

  } catch (err) {
    console.error('Analyze error:', err);
    return res.status(500).json({ error: 'Erreur interne : ' + err.message });
  }
}

function buildKnowledgeBlock(customKnowledge) {
  let base = SHEN_KNOWLEDGE_BASE;
  if (customKnowledge && customKnowledge.trim()) {
    base += '\n\n[NOTES ADDITIONNELLES DU JOUEUR]\n' + customKnowledge.trim();
  }
  return base;
}

function buildSystemPrompt(knowledgeBlock) {
  return `Tu es un expert League of Legends spécialisé dans Shen Support.
Tu analyses des compositions de draft et fournis des recommandations d'itemisation précises et des conseils de gameplay.

CONNAISSANCES DU JOUEUR (à respecter impérativement) :
${knowledgeBlock}

Tu réponds UNIQUEMENT en JSON valide, sans backticks ni texte autour, avec cette structure exacte :
{
  "build": [
    {
      "order": 1,
      "name": "Nom de l'item",
      "tag": "core",
      "reason": "Raison courte (1 phrase)"
    }
  ],
  "threats": ["label1", "label2"],
  "threatTypes": ["ad"],
  "analysis": "Analyse de la composition en 2-3 phrases.",
  "itemReasoning": "Explication détaillée du build choisi, item par item.",
  "gameplayTips": [
    "Conseil de gameplay spécifique à cette draft 1",
    "Conseil de gameplay spécifique à cette draft 2",
    "Conseil de gameplay spécifique à cette draft 3",
    "Conseil de gameplay spécifique à cette draft 4"
  ],
  "ultraPriority": "LA chose la plus importante à faire dans cette partie (1 phrase directe)"
}

Les valeurs possibles pour tag sont : core, situational, boots.
Les valeurs possibles pour threatTypes sont : ad, ap, mixed, engage, poke, heal.`;
}

function buildPrompt(allies, enemies) {
  const allyList = allies.map(a => `- ${a.name} (${a.role})`).join('\n');
  const enemyList = enemies.map(e => `- ${e.name} (${e.role})`).join('\n');

  return `Voici la draft de ma partie. Je joue Shen Support.

EQUIPE ALLIEE :
${allyList}

EQUIPE ENNEMIE :
${enemyList}

Analyse cette draft et donne-moi le build optimal + conseils de gameplay. Réponds uniquement en JSON valide.`;
}
