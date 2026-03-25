# 🔵 Shen Support Advisor

Outil d'itemisation pour Shen Support basé sur la draft en cours.  
Utilise l'API officielle Riot Games via un proxy Vercel sécurisé.

## Fonctionnalités

- 🔍 **Détection de partie en direct** via Riot ID
- 🛡️ **Build recommandé** adapté à la composition ennemie et alliée
- ✍️ **Mode manuel** si tu veux entrer la draft toi-même
- 🧠 **Explication du raisonnement** pour chaque choix d'item

## Core fixe

| Item | Raison |
|------|--------|
| Flûte de Bandle | Core inamovible — résistances duales + bouclier actif |
| Harnais Protoplasmique | Core fixe — HP massifs + Immolate |

Les items 3 à 6 sont adaptés dynamiquement à la composition.

---

## Déploiement (5 minutes)

### 1. Obtenir une clé API Riot

1. Va sur [developer.riotgames.com](https://developer.riotgames.com)
2. Connecte-toi avec ton compte Riot
3. Copie ta **Development API Key** (valable 24h) ou demande une **Production Key**

### 2. Déployer sur Vercel

1. **Fork** ce repo sur GitHub (ou crée un nouveau repo et pousse ces fichiers)
2. Va sur [vercel.com](https://vercel.com) → **New Project** → importe ton repo GitHub
3. Dans **Environment Variables**, ajoute :
   ```
   RIOT_API_KEY = RGAPI-xxxx-xxxx-xxxx
   ```
4. Clique **Deploy** → Vercel te donne une URL en `*.vercel.app`

### 3. Utiliser l'outil

- Ouvre l'URL Vercel dans ton navigateur
- Entre ton Riot ID format `Pseudo#EUW1`
- Lance une partie, clique **ANALYSER LA PARTIE**
- Le build s'affiche automatiquement !

### Mode local (sans Vercel)

Pour tester en local sans backend, utilise le **mode manuel** :
- Clique "Entrer la draft manuellement"
- Remplis les champions des deux équipes
- Clique **GÉNÉRER LE BUILD**

---

## Structure des fichiers

```
shen-advisor/
├── index.html          # Frontend complet (GitHub Pages / Vercel static)
├── api/
│   └── live-game.js    # Proxy Vercel (cache la clé API Riot)
├── vercel.json         # Config Vercel
└── README.md
```

---

## Logique d'itemisation

| Situation | Item recommandé |
|-----------|----------------|
| Full AD ennemi | Tabi Ninja + Cœur Gelé |
| Full AP ennemi | Bottes Mercure + Force de la Nature |
| Compo poke | Rédemption en priorité |
| Dive threat | Vœu du Chevalier |
| Healing ennemi | Mail Épineux |
| Alliés AP | Masque Abyssal |
| Compo mixte | Stoneplate de Gargouille |

---

*Non affilié à Riot Games. League of Legends © Riot Games, Inc.*
