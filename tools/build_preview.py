"""Gera dist/preview.html: o sistema inteiro em um único arquivo HTML (CSS e JS embutidos)."""
from pathlib import Path

raiz = Path(__file__).resolve().parent.parent
html = (raiz / "index.html").read_text(encoding="utf-8")
css = (raiz / "styles.css").read_text(encoding="utf-8")
js = (raiz / "app.js").read_text(encoding="utf-8")

html = html.replace('<link rel="stylesheet" href="styles.css">', f"<style>\n{css}</style>")
html = html.replace('<script src="app.js"></script>', f"<script>\n{js}</script>")

saida = raiz / "dist" / "preview.html"
saida.parent.mkdir(exist_ok=True)
saida.write_text(html, encoding="utf-8")
print(f"Gerado: {saida}")
