"""
Serveur FastAPI : sert l'interface et expose l'endpoint de compression.

Confidentialité :
- Chaque requête travaille dans son propre dossier temporaire unique
  (sous .tmp_uploads/). Ce dossier est supprimé dans un bloc `finally`,
  donc même en cas d'erreur, AVANT que la réponse ne soit envoyée.
- Le résultat (PDF ou ZIP) est renvoyé depuis la mémoire vive : plus
  aucun fichier ne subsiste sur le disque au moment du téléchargement.
- Au démarrage, les éventuels restes d'un arrêt brutal (Ctrl+C pendant
  un traitement) sont purgés.
"""

from __future__ import annotations

import io
import json
import logging
import re
import shutil
import tempfile
import zipfile
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import quote

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse, Response

from .compressor import PROFILES, PDFCompressionError, compress_pdf

BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "static"
TMP_ROOT = BASE_DIR / ".tmp_uploads"

MAX_FILE_SIZE = 200 * 1024 * 1024   # 200 Mo par fichier
MAX_FILES = 20
CHUNK = 1024 * 1024

log = logging.getLogger("pdf-compressor")
logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")


def _purge_tmp() -> None:
    """Supprime les dossiers temporaires laissés par un arrêt brutal."""
    if TMP_ROOT.exists():
        shutil.rmtree(TMP_ROOT, ignore_errors=True)


@asynccontextmanager
async def lifespan(_: FastAPI):
    _purge_tmp()
    TMP_ROOT.mkdir(parents=True, exist_ok=True)
    yield
    _purge_tmp()  # arrêt propre : on ne laisse rien derrière soi


app = FastAPI(title="PDF Compressor", docs_url=None, redoc_url=None, lifespan=lifespan)


@app.get("/", include_in_schema=False)
def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


def _safe_name(name: str | None, index: int) -> str:
    """Nom de fichier sans chemin ni caractères dangereux, finissant par .pdf."""
    stem = Path(name or f"document_{index}").stem
    stem = re.sub(r"[^\w\-. ()]+", "_", stem, flags=re.UNICODE).strip(" .") or f"document_{index}"
    return stem[:150] + ".pdf"


def _dedupe(name: str, used: set[str]) -> str:
    """Évite deux fichiers de même nom dans le ZIP."""
    candidate, n = name, 1
    while candidate.lower() in used:
        candidate = f"{Path(name).stem} ({n}).pdf"
        n += 1
    used.add(candidate.lower())
    return candidate


def _save_upload(upload: UploadFile, dest: Path) -> None:
    """Copie l'upload par morceaux en vérifiant la taille et la signature PDF."""
    size = 0
    with dest.open("wb") as out:
        first = True
        while chunk := upload.file.read(CHUNK):
            if first:
                # Un vrai PDF commence par "%PDF-" (tolérance : dans le 1er Ko)
                if b"%PDF-" not in chunk[:1024]:
                    raise PDFCompressionError("Format non supporté : ce n'est pas un PDF.")
                first = False
            size += len(chunk)
            if size > MAX_FILE_SIZE:
                raise PDFCompressionError(
                    f"Fichier trop volumineux (max {MAX_FILE_SIZE // (1024 * 1024)} Mo)."
                )
            out.write(chunk)
    if size == 0:
        raise PDFCompressionError("Fichier vide.")


def _content_disposition(filename: str) -> str:
    """En-tête compatible avec les noms accentués (RFC 5987)."""
    ascii_name = filename.encode("ascii", "ignore").decode() or "download"
    return f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(filename)}"


@app.post("/api/compress")
def compress(
    files: list[UploadFile] = File(...),
    level: str = Form("recommended"),
):
    # Endpoint *synchrone* : FastAPI l'exécute dans un thread séparé, le
    # travail CPU de PyMuPDF ne bloque donc pas le serveur.
    if level not in PROFILES:
        raise HTTPException(400, f"Niveau inconnu. Valeurs possibles : {', '.join(PROFILES)}")
    if not files:
        raise HTTPException(400, "Aucun fichier reçu.")
    if len(files) > MAX_FILES:
        raise HTTPException(400, f"Maximum {MAX_FILES} fichiers à la fois.")

    work_dir = Path(tempfile.mkdtemp(prefix="job_", dir=TMP_ROOT))
    results: list[dict] = []
    outputs: list[tuple[str, bytes]] = []   # (nom, contenu) gardés en RAM
    used_names: set[str] = set()

    try:
        for i, upload in enumerate(files, start=1):
            display_name = upload.filename or f"document_{i}.pdf"
            out_name = _dedupe(_safe_name(upload.filename, i), used_names)
            src = work_dir / f"in_{i}.pdf"
            dst = work_dir / f"out_{i}.pdf"
            try:
                _save_upload(upload, src)
                res = compress_pdf(src, dst, level)
                outputs.append((out_name, dst.read_bytes()))
                results.append({
                    "name": display_name,
                    "ok": True,
                    "original_size": res.original_size,
                    "compressed_size": res.compressed_size,
                    "saved_percent": res.saved_percent,
                    "kept_original": res.kept_original,
                })
            except PDFCompressionError as exc:
                results.append({"name": display_name, "ok": False, "error": str(exc)})
            except Exception:
                log.exception("Erreur inattendue sur %s", display_name)
                results.append({"name": display_name, "ok": False,
                                 "error": "Erreur inattendue pendant le traitement."})
            finally:
                # Suppression au fil de l'eau : on n'attend pas la fin du lot.
                src.unlink(missing_ok=True)
                dst.unlink(missing_ok=True)
                upload.file.close()
    finally:
        # Quoi qu'il arrive, le dossier de travail disparaît ici.
        shutil.rmtree(work_dir, ignore_errors=True)

    if not outputs:
        return JSONResponse(
            status_code=422,
            content={"detail": "Aucun fichier n'a pu être compressé.", "results": results},
        )

    # Statistiques transmises au frontend via un en-tête (ASCII garanti).
    stats_header = json.dumps({"level": level, "results": results}, ensure_ascii=True)

    if len(outputs) == 1 and len(files) == 1:
        name, data = outputs[0]
        download_name = f"{Path(name).stem}_compressed.pdf"
        media_type = "application/pdf"
    else:
        buf = io.BytesIO()
        # ZIP_STORED : les PDF sont déjà compressés, re-zipper ne gagne rien.
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_STORED) as zf:
            for name, content in outputs:
                zf.writestr(f"{Path(name).stem}_compressed.pdf", content)
        data = buf.getvalue()
        download_name = "pdf_compressed.zip"
        media_type = "application/zip"

    return Response(
        content=data,
        media_type=media_type,
        headers={
            "Content-Disposition": _content_disposition(download_name),
            "X-Compression-Stats": stats_header,
            "X-Download-Name": quote(download_name),
            "Cache-Control": "no-store",
        },
    )
