# PDF Compressor

Clone local de l'outil « Compresser PDF » d'iLovePDF. Tout tourne sur votre machine :
pas de base de données, pas de cloud, et les fichiers sont supprimés du disque dès qu'ils ont été traités.

**Stack :** Python 3.10+ · FastAPI · PyMuPDF · Tailwind CSS (via CDN)

## Architecture

```
PDF-Compressor/
├── app/
│   ├── __init__.py
│   ├── main.py          # Serveur FastAPI : routes, dossiers temporaires, ZIP
│   └── compressor.py    # Moteur de compression (les 3 niveaux)
├── static/
│   └── index.html       # Interface (Tailwind CDN + JavaScript natif)
├── .vscode/
│   ├── tasks.json       # Tâche « Lancer PDF Compressor » (Ctrl+Shift+B)
│   └── launch.json      # Lancement avec F5 (débogueur)
├── run.py               # Démarre le serveur et ouvre le navigateur
├── start.bat            # Lancement en un clic (Windows)
├── start.sh             # Lancement en un clic (macOS / Linux)
├── requirements.txt
└── .gitignore
```

## Installation

Il faut Python 3.10 ou plus récent.

```bash
python -m venv .venv
# Windows :
.venv\Scripts\activate
# macOS / Linux :
source .venv/bin/activate

pip install -r requirements.txt
```

> Les scripts `start.bat` / `start.sh` font tout cela **automatiquement** au premier lancement.

## Lancement

| Méthode | Action |
|---|---|
| **VS Code, tâche** | `Ctrl+Shift+B` (ou *Terminal → Exécuter la tâche de build*) → « Lancer PDF Compressor » |
| **VS Code, F5** | Onglet *Exécuter et déboguer* → « ▶ PDF Compressor » (après une première installation) |
| **Double-clic** | `start.bat` (Windows) ou `./start.sh` (macOS / Linux) |
| **Terminal** | `python run.py` (options : `--port 8080`, `--no-browser`) |

Le navigateur s'ouvre ensuite sur **http://localhost:3000**. Pour arrêter le serveur, faites `Ctrl+C` dans le terminal.

## Les 3 niveaux de compression

| Niveau | Images au-delà de | réduites à | Qualité JPEG | Extra |
|---|---|---|---|---|
| Extreme Compression | 100 DPI | 72 DPI | 35 | Supprime aussi les pièces jointes, le JavaScript et les miniatures |
| Recommended Compression | 160 DPI | 120 DPI | 60 | — |
| Less compression | 250 DPI | 200 DPI | 82 | — |

Quel que soit le niveau, l'outil :
- ne garde dans les polices que les caractères réellement utilisés ;
- supprime les métadonnées (Info et XMP) ;
- supprime les objets inutilisés et fusionne les doublons ;
- applique la compression Deflate et regroupe les objets en *object streams*.

Si le fichier obtenu n'est pas plus petit que l'original, c'est l'original qui est renvoyé.

## Confidentialité

- Le serveur écoute uniquement sur `127.0.0.1`, donc les autres machines du réseau n'y ont pas accès.
- Chaque requête travaille dans un dossier unique `.tmp_uploads/job_xxx/`. Chaque fichier est effacé dès qu'il est traité, et le dossier entier est supprimé dans un bloc `finally`, donc avant l'envoi de la réponse, même en cas d'erreur.
- Le PDF ou le ZIP renvoyé est construit en mémoire vive.
- `.tmp_uploads/` est vidé au démarrage et à l'arrêt du serveur, ce qui couvre aussi un arrêt brutal.

## Gestion des erreurs

Le serveur refuse proprement, avec un message clair, les cas suivants : fichier qui n'est pas un PDF, PDF corrompu, PDF protégé par mot de passe, fichier vide, fichier de plus de 200 Mo, plus de 20 fichiers, niveau inconnu.
Dans un lot, un fichier en erreur n'empêche pas les autres d'être compressés : les erreurs sont listées sur l'écran de résultat.
