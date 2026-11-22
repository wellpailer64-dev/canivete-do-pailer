"""qr_personalizado.py — QR Code personalizado (cores, pontos, olhos, logo no centro) com PNG, SVG e PDF.

Uso: py -3.13 Functions/qr_personalizado.py "<texto|link>" --saida pasta/qr [--tipo url|wifi|whatsapp|pix|texto]
     [--cor #0D4048] [--fundo #FDF1E0] [--olho #0D4048] [--pontos quadrado|arredondado|bolinha]
     [--logo arq.png] [--logo-pct 17] [--formatos png,svg,pdf] [--lado 2400]
Sempre confere a leitura (zxing-cpp) e devolve JSON com 'legivel'.
"""
import argparse, json, os, sys
import qrcode
from qrcode.constants import ERROR_CORRECT_H, ERROR_CORRECT_Q
from PIL import Image, ImageDraw

PONTOS = ('quadrado', 'arredondado', 'bolinha')


def montar_conteudo(tipo, texto, extra=None):
    """Converte o tipo (wifi, whatsapp...) no texto que o QR carrega. extra: dict opcional."""
    e = extra or {}
    if tipo in (None, '', 'url', 'texto'):
        return texto
    if tipo == 'whatsapp':
        from urllib.parse import quote
        n = ''.join(c for c in texto if c.isdigit())
        return 'https://wa.me/%s%s' % (n, ('?text=' + quote(e['mensagem'])) if e.get('mensagem') else '')
    if tipo == 'wifi':   # texto = nome da rede
        esc = lambda s: ''.join('\\' + c if c in '\\;,:"' else c for c in s)
        return 'WIFI:T:%s;S:%s;P:%s;;' % (e.get('seguranca', 'WPA'), esc(texto), esc(e.get('senha', '')))
    if tipo == 'pix':    # texto = BR Code "copia e cola" já pronto
        return texto
    raise ValueError('tipo desconhecido: %s' % tipo)


def _matriz(conteudo, logo):
    qr = qrcode.QRCode(error_correction=ERROR_CORRECT_H if logo else ERROR_CORRECT_Q, border=0, box_size=1)
    qr.add_data(conteudo); qr.make(fit=True)
    return qr.get_matrix()


def _geom(M, pontos, logo_pct, logo):
    """Lista de formas em unidades de módulo (com borda silenciosa de 4): ('p', i, j) e olhos ('o', i0, j0)."""
    n = len(M); c = n / 2; vao = n * logo_pct / 100 / 2 + .6 if logo else 0
    olho = lambda i, j: (i < 7 and j < 7) or (i < 7 and j >= n - 7) or (i >= n - 7 and j < 7)
    pts = [(i, j) for i in range(n) for j in range(n) if M[i][j] and not olho(i, j)
           and not (vao and abs(i + .5 - c) < vao and abs(j + .5 - c) < vao)]
    return n, pts, [(0, 0), (0, n - 7), (n - 7, 0)]


def desenhar_png(M, lado=2400, cor='#0D4048', fundo='#FDF1E0', olho='#0D4048', pontos='arredondado', logo=None, logo_pct=17):
    n, pts, olhos = _geom(M, pontos, logo_pct, logo); q = 4; b = lado / (n + 2 * q); S = 3
    im = Image.new('RGB', (lado * S, lado * S), fundo); d = ImageDraw.Draw(im); u = b * S
    for i, j in pts:
        x, y = (j + q) * u, (i + q) * u
        if pontos == 'quadrado':
            d.rectangle([x, y, x + u, y + u], fill=cor)
        elif pontos == 'bolinha':
            d.ellipse([x + .08 * u, y + .08 * u, x + .92 * u, y + .92 * u], fill=cor)
        else:
            d.rounded_rectangle([x + .06 * u, y + .06 * u, x + .94 * u, y + .94 * u], radius=.32 * u, fill=cor)
    r = 0 if pontos == 'quadrado' else 1
    for i0, j0 in olhos:
        x, y = (j0 + q) * u, (i0 + q) * u
        d.rounded_rectangle([x, y, x + 7 * u, y + 7 * u], radius=r * 1.9 * u, fill=olho)
        d.rounded_rectangle([x + u, y + u, x + 6 * u, y + 6 * u], radius=r * 1.2 * u, fill=fundo)
        d.rounded_rectangle([x + 2 * u, y + 2 * u, x + 5 * u, y + 5 * u], radius=r * .9 * u, fill=olho)
    if logo:
        a = Image.open(logo).convert('RGBA'); t = int(n * logo_pct / 100 * u); a.thumbnail((t, t))
        im.paste(a, ((lado * S - a.width) // 2, (lado * S - a.height) // 2), a)
    return im.resize((lado, lado), Image.LANCZOS)


def desenhar_svg(M, cor='#0D4048', fundo='#FDF1E0', olho='#0D4048', pontos='arredondado', logo=None, logo_pct=17):
    import base64
    n, pts, olhos = _geom(M, pontos, logo_pct, logo); q = 4; T = n + 2 * q
    o = ['<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 %d %d">' % (T, T),
         '<rect width="%d" height="%d" fill="%s"/>' % (T, T, fundo)]
    for i, j in pts:
        x, y = j + q, i + q
        if pontos == 'quadrado': o.append('<rect x="%d" y="%d" width="1" height="1" fill="%s"/>' % (x, y, cor))
        elif pontos == 'bolinha': o.append('<circle cx="%.2f" cy="%.2f" r=".42" fill="%s"/>' % (x + .5, y + .5, cor))
        else: o.append('<rect x="%.2f" y="%.2f" width=".88" height=".88" rx=".28" fill="%s"/>' % (x + .06, y + .06, cor))
    r = 0 if pontos == 'quadrado' else 1
    for i0, j0 in olhos:
        x, y = j0 + q, i0 + q
        o.append('<rect x="%d" y="%d" width="7" height="7" rx="%.1f" fill="%s"/>' % (x, y, r * 1.9, olho))
        o.append('<rect x="%d" y="%d" width="5" height="5" rx="%.1f" fill="%s"/>' % (x + 1, y + 1, r * 1.2, fundo))
        o.append('<rect x="%d" y="%d" width="3" height="3" rx="%.1f" fill="%s"/>' % (x + 2, y + 2, r * .9, olho))
    if logo:
        a = Image.open(logo).convert('RGBA'); a.thumbnail((512, 512)); import io; bf = io.BytesIO(); a.save(bf, 'PNG')
        t = n * logo_pct / 100; w, h = t * a.width / max(a.width, a.height), t * a.height / max(a.width, a.height)
        o.append('<image x="%.2f" y="%.2f" width="%.2f" height="%.2f" xlink:href="data:image/png;base64,%s"/>' % (
            (T - w) / 2, (T - h) / 2, w, h, base64.b64encode(bf.getvalue()).decode()))
    o.append('</svg>')
    return '\n'.join(o)


def ler(img):
    """Decodifica com zxing-cpp; devolve o texto ou None."""
    import zxingcpp, numpy as np
    r = zxingcpp.read_barcodes(np.array(img.convert('RGB')))
    return r[0].text if r else None


def gerar(conteudo, saida, cor='#0D4048', fundo='#FDF1E0', olho=None, pontos='arredondado', logo=None,
          logo_pct=17, formatos=('png', 'svg', 'pdf'), lado=2400):
    """Gera os arquivos e confere a leitura em 3 tamanhos. Devolve dict com caminhos e 'legivel'."""
    olho = olho or cor
    if pontos not in PONTOS: raise ValueError('pontos: ' + '|'.join(PONTOS))
    if logo and not (5 <= logo_pct <= 22): raise ValueError('logo_pct entre 5 e 22 (maior que isso quebra a leitura)')
    os.makedirs(os.path.dirname(os.path.abspath(saida)) or '.', exist_ok=True)
    M = _matriz(conteudo, logo)
    png = desenhar_png(M, lado, cor, fundo, olho, pontos, logo, logo_pct)
    arqs = {}
    if 'png' in formatos: png.save(saida + '.png'); arqs['png'] = saida + '.png'
    if 'svg' in formatos:
        open(saida + '.svg', 'w', encoding='utf-8').write(desenhar_svg(M, cor, fundo, olho, pontos, logo, logo_pct)); arqs['svg'] = saida + '.svg'
    if 'pdf' in formatos:
        import fitz
        doc = fitz.open(); pg = doc.new_page(width=300, height=300)
        pg.insert_image(pg.rect, stream=_png_bytes(png.resize((1200, 1200), Image.LANCZOS))); doc.save(saida + '.pdf'); arqs['pdf'] = saida + '.pdf'
    testes = {t: ler(png.resize((t, t), Image.LANCZOS)) == conteudo for t in (250, 600, lado)}
    return {'arquivos': arqs, 'legivel': all(testes.values()), 'leitura_por_tamanho': testes,
            'aviso': None if all(testes.values()) else 'Não leu em todos os tamanhos: aumente o contraste, reduza o logo ou use pontos quadrados.'}


def _png_bytes(im):
    import io; b = io.BytesIO(); im.save(b, 'PNG'); return b.getvalue()


if __name__ == '__main__':
    a = argparse.ArgumentParser()
    a.add_argument('texto'); a.add_argument('--saida', required=True); a.add_argument('--tipo', default='url')
    a.add_argument('--cor', default='#0D4048'); a.add_argument('--fundo', default='#FDF1E0'); a.add_argument('--olho')
    a.add_argument('--pontos', default='arredondado'); a.add_argument('--logo'); a.add_argument('--logo-pct', type=int, default=17)
    a.add_argument('--formatos', default='png,svg,pdf'); a.add_argument('--lado', type=int, default=2400)
    a.add_argument('--senha', default=''); a.add_argument('--mensagem', default='')
    x = a.parse_args()
    c = montar_conteudo(x.tipo, x.texto, {'senha': x.senha, 'mensagem': x.mensagem})
    r = gerar(c, x.saida, x.cor, x.fundo, x.olho, x.pontos, x.logo, x.logo_pct, tuple(x.formatos.split(',')), x.lado)
    print(json.dumps(r, ensure_ascii=False, indent=1))
    sys.exit(0 if r['legivel'] else 2)
