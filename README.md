# 기리고 · GIRIGO

Application de fan inspirée de la série Netflix *If Wishes Could Kill* (기리고, 2026),
recréée d'après l'appli de la série : fond noir, logo 기리고, main pixelisée et bouton 소원 빌기.
Tout est en français et tout reste sur ton téléphone (fiction, aucun vœu n'est réellement envoyé).

## Fonctionnalités

- **Design de la série** : logo 기리고 et bouton 소원 빌기 extraits des captures, main pixelisée 58 × 90
  rendue pixel par pixel, effets glitch, lignes de balayage, apparitions.
- **Animation du vœu** : la main se tourne, les deux mains se rejoignent en prière, puis l'écran caméra
  s'ouvre avec le bouton rond aux mains jointes.
- **Les règles** de Girigo, à accepter avant chaque vœu.
- **Vœu filmé** : caméra avant/arrière, ton nom, ta date de naissance et l'heure incrustés dans la vidéo
  (30 s max). Option « vœu écrit » sans caméra.
- **Compte à rebours** (24 h comme dans la série, réglable de 1 min à 7 jours) : la main se désagrège
  au fil du temps, battements de cœur et rouge dans la dernière minute, écran « Le temps est écoulé ».
- **Règle de la série** : quand quelqu'un d'autre fait un vœu, ton compte à rebours s'arrête.
- **Notifications** : vœu accepté, paliers (moitié du temps, 1 h, 10 min, 1 min…), fin du temps ;
  notifications système + bannière dans l'appli + vibrations.
- **Vœux réalisés** : bouton « Mon vœu s'est réalisé », journal de tous les vœux avec leur vidéo.
- **Compteur** : vœux faits / réalisés / en cours / suspendus / expirés + compteur mondial simulé.
- **Musique** : thème original de boîte à musique inquiétante synthétisé en direct, effets sonores.
  Tu peux importer ta propre musique (par ex. la bande-son de la série) dans les paramètres.
- **Installable** sur l'écran d'accueil (PWA) et utilisable hors ligne.

## Télécharger l'APK Android

L'APK est compilé automatiquement par GitHub Actions (workflow « Construire l'APK Android »)
et publié ici : https://github.com/julienots/GIRIGO/releases/tag/apk

Télécharge `girigo.apk` sur ton téléphone, ouvre-le et autorise « Installer des applis inconnues ».
Dans l'APK, les rappels sont programmés par Android : ils arrivent même quand l'appli est fermée,
et une notification permanente (impossible à balayer) reste affichée tant que le compte à rebours tourne.

## Compte à rebours imparable

- Aucun bouton pour annuler un vœu ; un vœu en cours ne peut pas être supprimé.
- « Tout effacer » est refusé tant qu'un compte à rebours tourne.
- Le temps continue de s'écouler appli fermée ou téléphone éteint ; l'écran « Le temps est écoulé »
  s'affiche à la réouverture.
- Seule exception, comme dans la série : un vœu fait par **quelqu'un d'autre** arrête ton compte à rebours.

## L'installer comme appli web

1. Dans le dépôt GitHub : **Settings → Pages → Source : GitHub Actions**.
2. Le workflow « Publier sur GitHub Pages » publie l'appli à chaque push.
3. Ouvre l'adresse dans Chrome sur ton téléphone → menu ⋮ → **Ajouter à l'écran d'accueil**.
4. Dans l'appli : Menu → Paramètres → **Activer les notifications**.

Pour tester en local : `python3 -m http.server` puis ouvrir http://localhost:8000.

> Les notifications programmées à l'avance dépendent du navigateur : si ton téléphone ne les gère pas,
> laisse l'appli ouverte en arrière-plan pour recevoir les rappels.

## Déposer un gros fichier

Les fichiers de plus de 25 Mo ne passent pas par l'upload web classique.
Utilise une **Release** (jusqu'à 2 Go par fichier) :

1. Ouvre https://github.com/julienots/GIRIGO/releases/new?tag=fichiers&target=ccr-2203ff49-z2jcp9
2. Glisse le fichier dans la zone « Attach binaries ».
3. Clique sur **Publish release**.
