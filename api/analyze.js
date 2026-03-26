// api/analyze.js
// Vercel Serverless Function — Multi-provider AI (Claude / ChatGPT / Gemini / Local)

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const OPENAI_API_KEY    = process.env.OPENAI_API_KEY;
const GEMINI_API_KEY    = process.env.GEMINI_API_KEY;

// ── KNOWLEDGE BASE ────────────────────────────────────────────────────────────
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

// ── HANDLER ───────────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { allies, enemies, customKnowledge, provider } = req.body;
  if (!allies || !enemies) return res.status(400).json({ error: 'Paramètres manquants.' });

  const knowledge = buildKnowledgeBlock(customKnowledge);
  const systemPrompt = buildSystemPrompt(knowledge);
  const userPrompt = buildUserPrompt(allies, enemies);

  // Route vers le bon provider
  const selectedProvider = provider || 'local';

  try {
    let result;

    if (selectedProvider === 'claude' && ANTHROPIC_API_KEY) {
      result = await callClaude(systemPrompt, userPrompt);
    } else if (selectedProvider === 'openai' && OPENAI_API_KEY) {
      result = await callOpenAI(systemPrompt, userPrompt);
    } else if (selectedProvider === 'gemini' && GEMINI_API_KEY) {
      result = await callGemini(systemPrompt, userPrompt);
    } else {
      // Fallback local si provider indisponible ou "local" sélectionné
      result = { json: buildLocalAnalysis(allies, enemies, knowledge), usedLocal: true };
    }

    // Indique quel provider a réellement répondu
    const providerUsed = result.usedLocal ? 'local'
      : selectedProvider === 'claude' ? 'claude'
      : selectedProvider === 'openai' ? 'openai'
      : 'gemini';

    const clean = (result.json || '').replace(/```json|```/g, '').trim();
    let parsed;
    try { parsed = JSON.parse(clean); }
    catch { return res.status(200).json({ raw: result.json, parsed: false, providerUsed }); }

    return res.status(200).json({ ...parsed, parsed: true, providerUsed });

  } catch (err) {
    console.error('Analyze error:', err);
    // Fallback sur local en cas d'erreur AI
    try {
      const localJson = buildLocalAnalysis(allies, enemies, knowledge);
      const parsed = JSON.parse(localJson);
      return res.status(200).json({ ...parsed, parsed: true, providerUsed: 'local', fallbackReason: err.message });
    } catch {
      return res.status(500).json({ error: 'Erreur interne : ' + err.message });
    }
  }
};

// ── PROVIDERS ─────────────────────────────────────────────────────────────────
async function callClaude(systemPrompt, userPrompt) {
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
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    })
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || 'Erreur Claude');
  }
  const data = await response.json();
  return { json: data.content?.[0]?.text || '' };
}

async function callOpenAI(systemPrompt, userPrompt) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    })
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || 'Erreur OpenAI');
  }
  const data = await response.json();
  return { json: data.choices?.[0]?.message?.content || '' };
}

async function callGemini(systemPrompt, userPrompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text: userPrompt }] }],
      generationConfig: { responseMimeType: 'application/json' }
    })
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || 'Erreur Gemini');
  }
  const data = await response.json();
  return { json: data.candidates?.[0]?.content?.parts?.[0]?.text || '' };
}

// ── LOCAL ENGINE ──────────────────────────────────────────────────────────────
function buildLocalAnalysis(allies, enemies, knowledge) {
  const enemyNames = enemies.map(e => e.name.toLowerCase());
  const allyNames  = allies.map(a => a.name.toLowerCase());

  const AD_CHAMPS  = ['jinx','caitlyn','jhin','draven','vayne','ashe','tristana','sivir','lucian','samira','aphelios','xayah','twitch','kogmaw',"kog'maw",'kalista','miss fortune','darius','garen','fiora','camille','renekton','riven','tryndamere','aatrox','sett','olaf','jarvan iv','vi','graves','nocturne','master yi',"kha'zix",'khazix','rengar','viego','hecarim','talon','zed','pantheon','wukong'];
  const AP_CHAMPS  = ['lux','syndra','orianna','zoe','viktor','azir','xerath','veigar','annie','brand','zyra','karma','morgana',"vel'koz",'velkoz','leblanc','fizz','ahri','sylas','diana','ekko','taliyah','anivia','malzahar','seraphine','nidalee','elise','zac','amumu','malphite','mordekaiser','teemo','soraka','sona','nami','janna','lulu'];
  const POKE_CHAMPS   = ['xerath',"vel'koz",'velkoz','lux','caitlyn','ezreal','jayce','zoe','karma','ziggs','varus'];
  const DIVE_CHAMPS   = ['fizz','zed','talon','rengar',"kha'zix",'khazix','kayn','nocturne','vi','jarvan iv','hecarim','irelia'];
  const HEAL_CHAMPS   = ['aatrox','soraka','yuumi','sona','nami','vladimir','sylas'];
  const MOBILE_ADC    = ['jinx',"kog'maw",'kogmaw','aphelios','ashe'];

  let adCount = 0, apCount = 0;
  enemyNames.forEach(n => {
    if (AD_CHAMPS.includes(n)) adCount++;
    if (AP_CHAMPS.includes(n)) apCount++;
  });

  const hasPoke   = enemyNames.some(n => POKE_CHAMPS.includes(n));
  const hasDive   = enemyNames.some(n => DIVE_CHAMPS.includes(n));
  const hasHeal   = enemyNames.some(n => HEAL_CHAMPS.includes(n));
  const hasAlliesAP = allyNames.some(n => AP_CHAMPS.includes(n));
  const hasImmobileADC = allyNames.some(n => MOBILE_ADC.includes(n));

  const isFullAD = apCount === 0 && adCount >= 2;
  const isFullAP = adCount === 0 && apCount >= 2;

  const build = [
    { order:1, name:"Flûte de Bandle", tag:"core", reason:"Core absolu — résistances duales et bouclier actif." },
    { order:2, name:"Harnais Protoplasmique", tag:"core", reason:"Core fixe — HP massifs et passive Immolate." },
    { order:3, name: isFullAD ? "Tabi Ninja" : isFullAP ? "Bottes de Mercure" : "Bottes de Rapidité", tag:"boots", reason: isFullAD ? "Full AD ennemi détecté." : isFullAP ? "Full AP ennemi détecté." : "Mobilité pour les rotations." },
  ];

  if (hasPoke)               build.push({ order:4, name:"Rédemption",              tag:"situational", reason:"Compo poke — soin à distance entre les fights." });
  else if (isFullAP)         build.push({ order:4, name:"Force de la Nature",       tag:"situational", reason:"Full AP — résistance magique maximale." });
  else if (isFullAD&&hasHeal)build.push({ order:4, name:"Mail Épineux",             tag:"situational", reason:"Full AD + healing — réduction des soins ennemis." });
  else if (isFullAD)         build.push({ order:4, name:"Cœur Gelé",                tag:"situational", reason:"Full AD — armor + ralentissement AA." });
  else if (hasDive||hasImmobileADC) build.push({ order:4, name:"Vœu du Chevalier", tag:"situational", reason:"Protège ton carry prioritaire contre le dive." });
  else                       build.push({ order:4, name:"Locket de l'Épouvantail",  tag:"situational", reason:"Bouclier AoE polyvalent pour les teamfights." });

  if (hasAlliesAP)           build.push({ order:5, name:"Masque Abyssal",           tag:"situational", reason:"Alliés AP — amplifie leurs dégâts via l'aura." });
  else if (isFullAP)         build.push({ order:5, name:"Bouclier Solaire",          tag:"situational", reason:"MR additionnelle + aura pour l'équipe." });
  else                       build.push({ order:5, name:"Stoneplate de Gargouille", tag:"situational", reason:"Compo mixte — actif défensif pour engager." });

  build.push({ order:6, name:"Armure de Warmog", tag:"situational", reason:"Sustain entre les fights, maximise la présence via l'ulti." });

  const threats = [];
  const threatTypes = [];
  if (adCount >= 2) { threats.push(`AD (${adCount})`); threatTypes.push('ad'); }
  if (apCount >= 2) { threats.push(`AP (${apCount})`); threatTypes.push('ap'); }
  if (hasPoke)      { threats.push('Poke comp'); threatTypes.push('poke'); }
  if (hasDive)      { threats.push('Dive threat'); threatTypes.push('engage'); }
  if (hasHeal)      { threats.push('Healing ennemi'); threatTypes.push('heal'); }

  return JSON.stringify({
    build,
    threats,
    threatTypes,
    analysis: `Composition ${isFullAD ? 'dominée par l\'AD' : isFullAP ? 'dominée par l\'AP' : 'mixte'} détectée. ${hasPoke ? 'Compo poke présente — jouer prudemment en laning phase. ' : ''}${hasDive ? 'Menace de dive sur ton carry. ' : ''}Build orienté en conséquence.`,
    itemReasoning: `Flûte et Harnais constituent le socle inébranlable. ${hasPoke ? 'Rédemption prioritaire pour contrer le chip damage. ' : ''}${isFullAD ? 'Tabi Ninja et Cœur Gelé pour maximiser l\'armure. ' : isFullAP ? 'Bottes Mercure et Force de la Nature contre le magic damage. ' : ''}${hasAlliesAP ? 'Masque Abyssal pour amplifier les alliés AP. ' : ''}Warmog en 6ème pour le sustain entre les rotations via ulti.`,
    gameplayTips: [
      hasDive ? `Dive détectée (${enemies.filter(e=>DIVE_CHAMPS.includes(e.name.toLowerCase())).map(e=>e.name).join(', ')}) — surveille ton carry et garde ton ulti en priorité pour lui.` : "Joue les rotations via ulti dès que ton carry est en danger ailleurs sur la carte.",
      hasPoke ? "Compo poke : reste derrière les minions, engage seulement quand tu as ton bouclier Ki Barrier actif." : "Engage avec Shadow Dash (E) à travers les murs pour des angles inattendus.",
      hasHeal ? "Healing ennemi : active Mail Épineux avant que l'ennemi commence à se heal, pas après." : "En teamfight, taunt le maximum d'ennemis avec E pour protéger tes carries.",
      hasImmobileADC ? `${allies.filter(a=>MOBILE_ADC.includes(a.name.toLowerCase())).map(a=>a.name).join(', ')} est immobile — Vœu du Chevalier et ulti en priorité sur lui/elle.` : "Timing d'ulti optimal : allié à 50-60% de vie en fight, pas en urgence à 10%."
    ],
    ultraPriority: hasDive ? `Surveille les assassins ennemis — garde ton ulti pour sauver ton carry du dive.` : hasPoke ? "Rush Rédemption pour contrer le poke et prends des fights courts et décisifs." : "Maximise les rotations via ulti pour créer des avantages numériques sur toute la carte."
  });
}

// ── PROMPTS ───────────────────────────────────────────────────────────────────
function buildKnowledgeBlock(customKnowledge) {
  let base = SHEN_KNOWLEDGE_BASE;
  if (customKnowledge?.trim()) base += '\n\n[NOTES DU JOUEUR]\n' + customKnowledge.trim();
  return base;
}

function buildSystemPrompt(knowledge) {
  return `Tu es un expert League of Legends spécialisé dans Shen Support.
Tu analyses des compositions de draft et fournis des recommandations d'itemisation précises et des conseils de gameplay.

CONNAISSANCES DU JOUEUR (à respecter impérativement) :
${knowledge}

Réponds UNIQUEMENT en JSON valide, sans backticks ni texte autour, avec cette structure :
{
  "build": [{"order":1,"name":"Nom item","tag":"core","reason":"1 phrase"}],
  "threats": ["label1"],
  "threatTypes": ["ad"],
  "analysis": "2-3 phrases sur la compo.",
  "itemReasoning": "Explication détaillée item par item.",
  "gameplayTips": ["conseil 1","conseil 2","conseil 3","conseil 4"],
  "ultraPriority": "1 phrase directe sur la priorité absolue"
}
Valeurs de tag : core, situational, boots. Valeurs de threatTypes : ad, ap, mixed, engage, poke, heal.`;
}

function buildUserPrompt(allies, enemies) {
  return `Draft en cours. Je joue Shen Support.
ALLIES : ${allies.map(a=>`${a.name} (${a.role})`).join(', ')}
ENNEMIS : ${enemies.map(e=>`${e.name} (${e.role})`).join(', ')}
Donne-moi le build optimal + conseils. JSON uniquement.`;
}
