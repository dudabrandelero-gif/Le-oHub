"""Gera dist/app-preview.html: o app inteiro em um único arquivo (CSS e JS embutidos), em modo demonstração."""
from pathlib import Path

raiz = Path(__file__).resolve().parent.parent
html = (raiz / "app.html").read_text(encoding="utf-8")
html = html.replace('<link rel="stylesheet" href="styles.css">', "<style>\n" + (raiz / "styles.css").read_text(encoding="utf-8") + "</style>")
for js in ("config.js", "store.js", "app.js"):
    html = html.replace(f'<script src="{js}"></script>', "<script>\n" + (raiz / js).read_text(encoding="utf-8") + "</script>")

saida = raiz / "dist" / "app-preview.html"
saida.parent.mkdir(exist_ok=True)
saida.write_text(html, encoding="utf-8")
print(f"Gerado: {saida}")
