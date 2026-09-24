"""
Moteur de compression PDF (PyMuPDF).

Principe général
----------------
Dans un PDF "lourd", 90 % du poids vient presque toujours des images
(photos, scans). Le texte et les polices vectorielles pèsent peu.
La compression se fait donc en 4 étapes :

1. RÉ-ÉCHANTILLONNAGE DES IMAGES (le gain principal)
   Pour chaque image, PyMuPDF calcule sa résolution *effective*, c.-à-d. le
   nombre de pixels par pouce tel qu'elle est affichée sur la page (une photo
   de 4000 px affichée sur 5 cm de large = ~2000 DPI effectifs !).
   - Si cette résolution dépasse `dpi_threshold`, l'image est réduite
     jusqu'à `dpi_target`.
   - Elle est ensuite ré-encodée en JPEG avec la qualité `jpeg_quality`.

2. POLICES : on ne garde que les glyphes réellement utilisés (subsetting).

3. NETTOYAGE : suppression des métadonnées (Info + XMP), des miniatures
   de pages et, en mode extrême, des fichiers joints / annotations inutiles.

4. RÉ-ÉCRITURE DU FICHIER : "garbage collection" des objets orphelins,
   fusion des doublons, compression Deflate de tous les flux et regroupement
   des objets dans des "object streams".

Les 3 niveaux (inspirés d'iLovePDF)
-----------------------------------
                 | seuil DPI | DPI cible | qualité JPEG | cas d'usage
  extreme        |    100    |    72     |     35       | brouillon, envoi mail
  recommended    |    160    |   120     |     60       | usage courant (défaut)
  less           |    250    |   200     |     82       | impression

- Le seuil est toujours un peu au-dessus de la cible : cela évite de
  ré-encoder (et donc dégrader) des images déjà proches de la cible pour
  un gain négligeable.
- 72 DPI = lisible à l'écran ; 120 DPI = net à l'écran, correct à
  l'impression ; 200 DPI = qualité d'impression bureautique.

Garde-fou : si le fichier obtenu n'est pas plus petit que l'original
(PDF déjà optimisé, PDF 100 % texte...), on renvoie l'original intact.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import pymupdf  # PyMuPDF (anciennement "fitz")


class PDFCompressionError(Exception):
    """Erreur "métier" dont le message peut être affiché à l'utilisateur."""


@dataclass(frozen=True)
class CompressionProfile:
    label: str
    dpi_threshold: int      # au-delà de ce DPI effectif, l'image est réduite
    dpi_target: int         # DPI visé après réduction
    jpeg_quality: int       # 0-100, qualité de ré-encodage JPEG
    aggressive_cleanup: bool  # supprime pièces jointes, miniatures, etc.


PROFILES: dict[str, CompressionProfile] = {
    "extreme": CompressionProfile(
        label="Extreme Compression",
        dpi_threshold=100, dpi_target=72, jpeg_quality=35,
        aggressive_cleanup=True,
    ),
    "recommended": CompressionProfile(
        label="Recommended Compression",
        dpi_threshold=160, dpi_target=120, jpeg_quality=60,
        aggressive_cleanup=False,
    ),
    "less": CompressionProfile(
        label="Less compression",
        dpi_threshold=250, dpi_target=200, jpeg_quality=82,
        aggressive_cleanup=False,
    ),
}


@dataclass
class CompressionResult:
    original_size: int
    compressed_size: int
    kept_original: bool  # True si la compression n'apportait aucun gain

    @property
    def saved_percent(self) -> float:
        if self.original_size == 0:
            return 0.0
        return round(100 * (1 - self.compressed_size / self.original_size), 1)


def _open_pdf(path: Path) -> pymupdf.Document:
    """Ouvre le PDF en levant des erreurs claires pour l'utilisateur."""
    try:
        doc = pymupdf.open(path, filetype="pdf")
    except Exception as exc:  # fichier illisible / corrompu
        raise PDFCompressionError("Fichier PDF corrompu ou illisible.") from exc

    if doc.needs_pass:
        doc.close()
        raise PDFCompressionError(
            "PDF protégé par mot de passe : impossible de le compresser."
        )
    if doc.page_count == 0:
        doc.close()
        raise PDFCompressionError("Le PDF ne contient aucune page.")
    return doc


def _strip_metadata(doc: pymupdf.Document) -> None:
    """Supprime le dictionnaire Info et les métadonnées XMP."""
    try:
        doc.set_metadata({})
    except Exception:
        pass
    try:
        doc.del_xml_metadata()
    except Exception:
        pass


def _aggressive_cleanup(doc: pymupdf.Document) -> None:
    """
    Nettoyage poussé (mode extrême uniquement) : on retire ce qui ne sert
    pas à l'affichage : fichiers joints, miniatures, JavaScript, liens
    cassés, informations de formulaire masquées... `scrub` fait cela
    sans toucher au contenu visible des pages.
    """
    try:
        doc.scrub(
            attached_files=True,
            clean_pages=True,
            embedded_files=True,
            hidden_text=False,     # conserver le texte OCR invisible (recherche)
            javascript=True,
            metadata=True,
            redactions=False,
            redact_images=0,
            remove_links=False,
            reset_fields=False,
            reset_responses=True,
            thumbnails=True,
            xml_metadata=True,
        )
    except Exception:
        # Certaines structures exotiques font échouer scrub : on continue,
        # le gain principal (images) reste acquis.
        pass


def _image_rewriter_options(profile: CompressionProfile):
    """
    Construit les options bas niveau de MuPDF pour la ré-écriture d'images.

    Pourquoi ne pas utiliser simplement `doc.rewrite_images(dpi_target=...)` ?
    Par défaut PyMuPDF réduit les images par "moyennage" (FZ_SUBSAMPLE_AVERAGE),
    qui ne divise la taille que par des PUISSANCES DE 2. Une image à 288 DPI
    finirait alors à 144 DPI que l'on vise 72 ou 120 : les niveaux ne
    seraient plus différenciés. Le mode BICUBIQUE permet d'atteindre
    exactement le DPI cible, avec un meilleur lissage.

    Les 4 familles d'images traitées :
      - color/gray "lossy"    : déjà en JPEG  -> réduites + ré-encodées JPEG
      - color/gray "lossless" : Flate/PNG...  -> réduites + converties en JPEG
    Les images bitonales (noir & blanc 1 bit, scans de texte) ne sont PAS
    touchées : elles sont déjà très compactes (CCITT/JBIG2) et le JPEG les
    rendrait floues et plus lourdes.
    """
    mupdf = pymupdf.mupdf
    opts = mupdf.PdfImageRewriterOptions()
    quality = str(profile.jpeg_quality)
    for family in ("color_lossy", "color_lossless", "gray_lossy", "gray_lossless"):
        setattr(opts, f"{family}_image_recompress_method", mupdf.FZ_RECOMPRESS_JPEG)
        setattr(opts, f"{family}_image_recompress_quality", quality)
        setattr(opts, f"{family}_image_subsample_method", mupdf.FZ_SUBSAMPLE_BICUBIC)
        setattr(opts, f"{family}_image_subsample_threshold", profile.dpi_threshold)
        setattr(opts, f"{family}_image_subsample_to", profile.dpi_target)
    return opts


def compress_pdf(src: Path, dst: Path, level: str) -> CompressionResult:
    """
    Compresse `src` vers `dst` selon le niveau `level`
    ("extreme" | "recommended" | "less").
    """
    profile = PROFILES.get(level)
    if profile is None:
        raise PDFCompressionError(f"Niveau de compression inconnu : {level!r}")

    original_size = src.stat().st_size
    doc = _open_pdf(src)
    try:
        # --- Étape 1 : images (gain principal) --------------------------
        # Voir _image_rewriter_options() pour le détail de l'algorithme.
        try:
            doc.rewrite_images(options=_image_rewriter_options(profile))
        except Exception:
            # Une image mal formée ne doit pas bloquer tout le document :
            # on poursuit avec les autres optimisations.
            pass

        # --- Étape 2 : polices ------------------------------------------
        try:
            doc.subset_fonts()
        except Exception:
            pass

        # --- Étape 3 : métadonnées / nettoyage --------------------------
        _strip_metadata(doc)
        if profile.aggressive_cleanup:
            _aggressive_cleanup(doc)

        # --- Étape 4 : ré-écriture optimisée ----------------------------
        # garbage=4 : supprime objets inutilisés + fusionne les doublons
        # deflate*  : compresse tous les flux non compressés
        # use_objstms : regroupe les petits objets (gain de 5-15 % sur
        #               les PDF "texte")
        # clean     : normalise les flux de contenu des pages
        doc.save(
            dst,
            garbage=4,
            clean=True,
            deflate=True,
            deflate_images=True,
            deflate_fonts=True,
            use_objstms=1,
            compression_effort=100 if profile.aggressive_cleanup else 0,
            preserve_metadata=0,
        )
    except PDFCompressionError:
        raise
    except Exception as exc:
        raise PDFCompressionError(
            "Erreur pendant la compression (PDF probablement endommagé)."
        ) from exc
    finally:
        doc.close()

    compressed_size = dst.stat().st_size

    # Garde-fou : jamais de fichier "compressé" plus gros que l'original.
    if compressed_size >= original_size:
        dst.write_bytes(src.read_bytes())
        return CompressionResult(original_size, original_size, kept_original=True)

    return CompressionResult(original_size, compressed_size, kept_original=False)
