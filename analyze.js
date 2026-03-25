// api/analyze.js
// Vercel Serverless Function — Appel Claude avec la draft + knowledge base

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SHEN_KNOWLEDGE = require('../knowledge.js');

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

  // Construire le prompt
  const knowledgeBlock = buildKnowledgeBlock(customKnowledge);
  const prompt = buildPrompt(allies, enemies, knowledgeBlock);

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
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const err = await response.json();
      return res.status(response.status).json({ error: err.error?.message || 'Erreur API Anthropic.' });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';

    // Parser la réponse JSON de Claude
    const clean = text.replace(/```json|```/g, '').trim();
    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch {
      // Fallback si Claude ne renvoie pas du JSON propre
      return res.status(200).json({ raw: text, parsed: false });
    }

    return res.status(200).json({ ...parsed, parsed: true });

  } catch (err) {
    console.error('Analyze error:', err);
    return res.status(500).json({ error: 'Erreur interne.' });
  }
}

function buildKnowledgeBlock(customKnowledge) {
  // Fusionne la knowledge de base (fichier) + celle éditée dans l'UI
  let base = Object.values(SHEN_KNOWLEDGE).join('\n');
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
      "tag": "core|situational|boots",
      "reason": "Raison courte (1 phrase)"
    }
  ],
  "threats": ["label1", "label2"],
  "threatTypes": ["ad|ap|mixed|engage|poke|heal"],
  "analysis": "Analyse de la composition en 2-3 phrases.",
  "itemReasoning": "Explication détaillée du build choisi, item par item.",
  "gameplayTips": [
    "Conseil de gameplay spécifique à cette draft #1",
    "Conseil de gameplay spécifique à cette draft #2",
    "Conseil de gameplay spécifique à cette draft #3",
    "Conseil de gameplay spécifique à cette draft #4"
  ],
  "ultraPriority": "LA chose la plus importante à faire dans cette partie (1 phrase courte et directe)"
}`;
}

function buildPrompt(allies, enemies, knowledgeBlock) {
  const allyList = allies.map(a => `- ${a.name} (${a.role})`).join('\n');
  const enemyList = enemies.map(e => `- ${e.name} (${e.role})`).join('\n');

  return `Voici la draft de ma partie en cours. Je joue Shen Support.

ÉQUIPE ALLIÉE :
${allyList}

ÉQUIPE ENNEMIE :
${enemyList}

Analyse cette draft et donne-moi :
1. Le build optimal en 6 items (en respectant mes règles de core)
2. Une analyse des menaces ennemies
3. Des conseils de gameplay spécifiques à cette composition
4. La priorité absolue pour cette partie

Réponds en JSON selon le format demandé.`;
}
