// api/analyze.js — Multi-provider, auto-fallback, priority enemy, dual build

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const OPENAI_API_KEY    = process.env.OPENAI_API_KEY;
const GEMINI_API_KEY    = process.env.GEMINI_API_KEY;

// Fallback chain order: Claude → ChatGPT → Gemini → Local
const PROVIDER_CHAIN = ['claude', 'openai', 'gemini', 'local'];

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

  const {
    allies, enemies, customKnowledge,
    provider,           // provider demandé par l'utilisateur
    priorityEnemy,      // champion ennemi marqué comme fed/prioritaire (optionnel)
    alternativeBuild,   // true = demande une 2ème suggestion alternative
    compareProvider,    // provider pour la 2ème colonne de comparaison (optionnel)
  } = req.body;

  if (!allies || !enemies) return res.status(400).json({ error: 'Paramètres manquants.' });

  const knowledge   = buildKnowledgeBlock(customKnowledge);
  const systemPrompt = buildSystemPrompt(knowledge);
  const userPrompt   = buildUserPrompt(allies, enemies, priorityEnemy, alternativeBuild);

  try {
    // ── Build principal ──────────────────────────────────────────────────────
    const { result: mainResult, providerUsed: mainProvider } =
      await callWithFallback(provider, systemPrompt, userPrompt, allies, enemies, knowledge);

    const mainParsed = parseResult(mainResult);

    // ── Build de comparaison (si demandé) ────────────────────────────────────
    let compareResult = null;
    let compareProviderUsed = null;

    if (compareProvider) {
      // On exclude le provider principal pour vraiment comparer
      const chain = PROVIDER_CHAIN.filter(p => p !== mainProvider);
      const target = chain.includes(compareProvider) ? compareProvider : chain[0];
      const { result: cResult, providerUsed: cProvider } =
        await callWithFallback(target, systemPrompt, userPrompt, allies, enemies, knowledge, [mainProvider]);
      compareResult     = parseResult(cResult);
      compareProviderUsed = cProvider;
    }

    return res.status(200).json({
      ...mainParsed,
      parsed: true,
      providerUsed: mainProvider,
      // Données de comparaison
      compareResult: compareResult || null,
      compareProviderUsed: compareProviderUsed || null,
    });

  } catch (err) {
    console.error('Analyze error:', err);
    return res.status(500).json({ error: 'Erreur interne : ' + err.message });
  }
};

// ── FALLBACK CHAIN ────────────────────────────────────────────────────────────
async function callWithFallback(requestedProvider, systemPrompt, userPrompt, allies, enemies, knowledge, exclude = []) {
  // Construire la chaîne: provider demandé en premier, puis les autres dans l'ordre
  const chain = [requestedProvider, ...PROVIDER_CHAIN.filter(p => p !== requestedProvider)]
    .filter(p => !exclude.includes(p));

  for (const provider of chain) {
    try {
      if (provider === 'local') {
        return { result: { json: buildLocalAnalysis(allies, enemies) }, providerUsed: 'local' };
      }
      if (provider === 'claude' && ANTHROPIC_API_KEY) {
        const result = await callClaude(systemPrompt, userPrompt);
        return { result, providerUsed: 'claude' };
      }
      if (provider === 'openai' && OPENAI_API_KEY) {
        const result = await callOpenAI(systemPrompt, userPrompt);
        return { result, providerUsed: 'openai' };
      }
      if (provider === 'gemini' && GEMINI_API_KEY) {
        const result = await callGemini(systemPrompt, userPrompt);
        return { result, providerUsed: 'gemini' };
      }
      // Clé manquante pour ce provider → essayer le suivant
    } catch (err) {
      console.warn(`Provider ${provider} failed: ${err.message}, trying next...`);
      // Erreur API (crédits épuisés etc.) → essayer le suivant
    }
  }

  // Dernier recours : local
  return { result: { json: buildLocalAnalysis(allies, enemies) }, providerUsed: 'local' };
}

function parseResult(result) {
  const clean = (result.json || '').replace(/```json|```/g, '').trim();
  try { return JSON.parse(clean); }
  catch { return { raw: result.json, parsed: false }; }
}

// ── AI PROVIDERS ──────────────────────────────────────────────────────────────
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
  if (!response.ok) { const e = await response.json(); throw new Error(e.error?.message || 'Claude error'); }
  const data = await response.json();
  return { json: data.content?.[0]?.text || '' };
}

async function callOpenAI(systemPrompt, userPrompt) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }]
    })
  });
  if (!response.ok) { const e = await response.json(); throw new Error(e.error?.message || 'OpenAI error'); }
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
  if (!response.ok) { const e = await response.json(); throw new Error(e.error?.message || 'Gemini error'); }
  const data = await response.json();
  return { json: data.candidates?.[0]?.content?.parts?.[0]?.text || '' };
}

// ── LOCAL ENGINE ──────────────────────────────────────────────────────────────
function buildLocalAnalysis(allies, enemies) {
  const enemyNames = enemies.map(e => e.name.toLowerCase());
  const allyNames  = allies.map(a => a.name.toLowerCase());

  const AD_CHAMPS   = ['jinx','caitlyn','jhin','draven','vayne','ashe','tristana','sivir','lucian','samira','aphelios','xayah','twitch',"kog'maw",'kogmaw','kalista','miss fortune','darius','garen','fiora','camille','renekton','riven','tryndamere','aatrox','sett','olaf','jarvan iv','vi','graves','nocturne','master yi',"kha'zix",'khazix','rengar','viego','hecarim','talon','zed','pantheon','wukong'];
  const AP_CHAMPS   = ['lux','syndra','orianna','zoe','viktor','azir','xerath','veigar','annie','brand','zyra','karma','morgana',"vel'koz",'velkoz','leblanc','fizz','ahri','sylas','diana','ekko','taliyah','anivia','malzahar','seraphine','nidalee','elise','zac','amumu','malphite','mordekaiser','teemo','soraka','sona','nami','janna','lulu'];
  const POKE_CHAMPS = ['xerath',"vel'koz",'velkoz','lux','caitlyn','ezreal','jayce','zoe','karma','ziggs','varus'];
  const DIVE_CHAMPS = ['fizz','zed','talon','rengar',"kha'zix",'khazix','kayn','nocturne','vi','jarvan iv','hecarim','irelia'];
  const HEAL_CHAMPS = ['aatrox','soraka','yuumi','sona','nami','vladimir','sylas'];
  const IMMOBILE_ADC = ['jinx',"kog'maw",'kogmaw','aphelios','ashe'];

  let adCount = 0, apCount = 0;
  enemyNames.forEach(n => { if (AD_CHAMPS.includes(n)) adCount++; if (AP_CHAMPS.includes(n)) apCount++; });

  const hasPoke  = enemyNames.some(n => POKE_CHAMPS.includes(n));
  const hasDive  = enemyNames.some(n => DIVE_CHAMPS.includes(n));
  const hasHeal  = enemyNames.some(n => HEAL_CHAMPS.includes(n));
  const hasAllyAP = allyNames.some(n => AP_CHAMPS.includes(n));
  const hasImmobileADC = allyNames.some(n => IMMOBILE_ADC.includes(n));
  const isFullAD = apCount === 0 && adCount >= 2;
  const isFullAP = adCount === 0 && apCount >= 2;

  const build = [
    { order:1, name:"Flûte de Bandle",       tag:"core",       reason:"Core absolu." },
    { order:2, name:"Harnais Protoplasmique", tag:"core",       reason:"Core fixe." },
    { order:3, name: isFullAD ? "Tabi Ninja" : isFullAP ? "Bottes de Mercure" : "Bottes de Rapidité", tag:"boots", reason: isFullAD ? "Full AD." : isFullAP ? "Full AP." : "Mobilité." },
  ];

  if (hasPoke)                    build.push({ order:4, name:"Rédemption",             tag:"situational", reason:"Poke comp." });
  else if (isFullAP)              build.push({ order:4, name:"Force de la Nature",      tag:"situational", reason:"Full AP." });
  else if (isFullAD && hasHeal)   build.push({ order:4, name:"Mail Épineux",            tag:"situational", reason:"AD + healing." });
  else if (isFullAD)              build.push({ order:4, name:"Cœur Gelé",               tag:"situational", reason:"Full AD." });
  else if (hasDive||hasImmobileADC) build.push({ order:4, name:"Vœu du Chevalier",     tag:"situational", reason:"Protège le carry." });
  else                            build.push({ order:4, name:"Locket de l'Épouvantail", tag:"situational", reason:"AoE polyvalent." });

  if (hasAllyAP)    build.push({ order:5, name:"Masque Abyssal",           tag:"situational", reason:"Amplifie les alliés AP." });
  else if (isFullAP) build.push({ order:5, name:"Bouclier Solaire",         tag:"situational", reason:"MR + aura." });
  else               build.push({ order:5, name:"Stoneplate de Gargouille", tag:"situational", reason:"Engage défensif." });

  build.push({ order:6, name:"Armure de Warmog", tag:"situational", reason:"Sustain entre fights." });

  const threats = [], threatTypes = [];
  if (adCount >= 2) { threats.push(`AD (${adCount})`); threatTypes.push('ad'); }
  if (apCount >= 2) { threats.push(`AP (${apCount})`); threatTypes.push('ap'); }
  if (hasPoke)      { threats.push('Poke comp');        threatTypes.push('poke'); }
  if (hasDive)      { threats.push('Dive threat');      threatTypes.push('engage'); }
  if (hasHeal)      { threats.push('Healing ennemi');   threatTypes.push('heal'); }

  return JSON.stringify({
    build, threats, threatTypes,
    analysis: `Composition ${isFullAD?'full AD':isFullAP?'full AP':'mixte'} détectée. ${hasPoke?'Poke présent. ':''}${hasDive?'Dive détecté. ':''}Build local généré.`,
    itemReasoning: `Core Flûte+Harnais. ${isFullAD?'Tabi+Cœur Gelé pour l\'armure. ':isFullAP?'Merc+Force de la Nature contre l\'AP. ':''}${hasAllyAP?'Masque Abyssal pour tes alliés AP. ':''}Warmog pour le sustain.`,
    gameplayTips: [
      hasDive ? "Dive détecté — garde ton ulti pour sauver ton carry." : "Optimise tes rotations via ulti sur toute la carte.",
      hasPoke ? "Compo poke — engage derrière ton Ki Barrier." : "Taunt (E) le max d'ennemis en teamfight.",
      hasHeal ? "Active Mail Épineux AVANT que l'ennemi se heal." : "Timing ulti : 50-60% de vie de l'allié, pas à 10%.",
      hasImmobileADC ? "Ton ADC est immobile — couvre-le en priorité avec Vœu+ulti." : "Shadow Dash à travers les murs pour des angles surprises."
    ],
    ultraPriority: hasDive ? "Surveille les assassins — garde l'ulti pour le carry." : hasPoke ? "Rush Rédemption, fights courts." : "Rotations via ulti pour avantages numériques."
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

Réponds UNIQUEMENT en JSON valide, sans backticks ni texte autour :
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

function buildUserPrompt(allies, enemies, priorityEnemy, alternativeBuild) {
  let prompt = `Draft en cours. Je joue Shen Support.
ALLIES : ${allies.map(a=>`${a.name} (${a.role})`).join(', ')}
ENNEMIS : ${enemies.map(e=>`${e.name} (${e.role})`).join(', ')}`;

  if (priorityEnemy) {
    prompt += `\n\n⚠️ ATTENTION : ${priorityEnemy} est FED / le carry prioritaire ennemi. Adapte le build ET les conseils en conséquence — c'est la menace numéro 1 de cette partie.`;
  }

  if (alternativeBuild) {
    prompt += `\n\n📌 CONSIGNE SPÉCIALE : Propose une suggestion ALTERNATIVE au build classique. Explore des options moins conventionnelles mais viables pour cette composition spécifique. Explique en quoi cette approche diffère.`;
  }

  prompt += '\n\nJSON uniquement.';
  return prompt;
}
