// ============================================================
//  KNOWLEDGE.JS — Ta base de connaissance personnelle Shen
//  Édite ce fichier librement, Claude l'intègre à chaque analyse
// ============================================================

const SHEN_KNOWLEDGE = {

  // ── CORE BUILD ────────────────────────────────────────────
  core: `
- Flûte de Bandle est TOUJOURS le premier item, sans exception.
- Harnais Protoplasmique est TOUJOURS le deuxième item, sans exception.
- Ces deux items ne sont jamais remplacés ni réordonnés.
`,

  // ── RÈGLES D'ITEMISATION PAR SITUATION ───────────────────
  itemRules: `
- Contre une compo full AD : Tabi Ninja obligatoires, Cœur Gelé en 4ème item.
- Contre une compo full AP : Bottes de Mercure obligatoires, Force de la Nature en 4ème.
- Si l'ennemi a du healing important (Aatrox, Soraka, Vladimir...) : Mail Épineux obligatoire.
- Si compo poke ennemie (Xerath, Lux, Ezreal...) : Rédemption en 3ème item avant les bottes.
- Si mon ADC est immobile et vulnérable au dive (Jinx, Kog'Maw, Aphelios) : Vœu du Chevalier en 3ème.
- Si alliés ont des dégâts magiques significatifs : Masque Abyssal pour amplifier leurs dégâts.
- Contre Zed, Talon ou tout assassin AD ciblant mon ADC : Gargoyle en 3ème item.
- Warmog en fin de build si je suis très en avance et que je dois être présent partout via mon ulti.
`,

  // ── GAMEPLAY & CONSEILS ───────────────────────────────────
  gameplayNotes: `
- Mon ulti (Stand United) est ma priorité numéro 1 : je dois toujours savoir quel allié protéger.
- Je priorise l'ulti sur le carry le plus en danger, pas forcément l'ADC.
- En lane, je joue passif et je stack mon passive (Ki Barrier) avant d'engager.
- Je warde le flanc opposé à ma lane pour anticiper les rotations et préparer mon ulti.
- Le bon timing d'ulti : quand un allié est en fight à 50-60% de vie, pas en urgence à 10%.
- En teamfight : je taunt (E) le maximum d'ennemis, je garde mon ulti pour le carry qui se fait focus.
- Shadow Dash (E) à travers un mur est souvent plus impactant qu'un engage frontal.
- Avec Locket : j'active le bouclier AVANT de plonger dans le teamfight, pas après.
`,

  // ── MATCHUPS SPÉCIFIQUES ──────────────────────────────────
  matchups: `
- Contre Vayne : elle ignore mon tank grâce au True Damage, jouer autour de mon ulti pour l'annuler.
- Contre Zed ulti : si mon carry se fait ulti par Zed, mon ulti peut servir de "dodger" de la mort.
- Contre Nautilus/Leona : jeu d'engagement mirror, utiliser Shadow Dash pour leur counter-engage.
- Contre Yone/Yasuo : leur dash passe à travers mon E, attention au timing.
- Avec Jinx en ADC : elle a besoin de Vœu du Chevalier, elle est immobile et clé en late game.
- Avec Samira : elle peut reset avec mon ulti, coordonner Samira ulti + mon engage.
`,

  // ── NOTES LIBRES ─────────────────────────────────────────
  // Ajoute ici tout ce que tu veux que Claude sache sur ton style de jeu
  freeNotes: `
- Je joue en EUW, elo approximatif Gold/Platine.
- Je préfère un style de jeu proactif avec beaucoup de rotations via l'ulti.
- J'essaie de toujours avoir un impact global plutôt que de rester en lane.
`

};

// Export pour Node.js (backend Vercel)
if (typeof module !== 'undefined') module.exports = SHEN_KNOWLEDGE;
