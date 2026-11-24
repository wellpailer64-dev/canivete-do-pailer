"""Corrige maiúsculas e erros mecânicos de um SRT (regra universal de legenda do Pailer).

Regra: maiúscula só no começo de frase (depois de . ? ! ...) ou de cena nova (pausa > --pausa s);
continuação de frase em minúscula; nomes próprios sempre com maiúscula.
Também: remove bloco duplicado seguido, palavra repetida (da da, no no), maiúscula depois de ponto
no meio do bloco, ordena por tempo e aponta sobreposições.

Uso: py -3.13 tools/agente/legenda_caixa.py entrada.srt saida.srt [--nomes "Igor,Bogotá"] [--trocas trocas.json]
Saída: o SRT novo + relatório no stdout (o que mudou e o que conferir no áudio).
"""
import argparse, json, re, sys

# palavra solta que é sempre nome; nome de várias palavras vai em EXPRESSOES (São, Serra, Doce sozinhos são comuns)
NOMES = """Brasil América Colômbia Chile Bolívia Argentina Bogotá Valparaíso Perus Guarulhos Taboão Pirajuçara
Recife Nordeste Bahia Pernambuco Deus""".split()
EXPRESSOES = ["América Latina", "Costa Rica", "Capão Redondo", "São Paulo", "São José dos Campos", "Morro Doce",
              "Taboão da Serra", "Câmara Municipal", "Embu das Artes", "Jardim Silvio Sampaio", "Festival Internacional"]

def ms(t):
    h, m, r = t.split(':'); s, f = r.split(','); return ((int(h)*60+int(m))*60+int(s))*1000+int(f)

def ler(p):
    blocos = []
    for b in re.split(r'\n\s*\n', open(p, encoding='utf-8-sig').read().strip()):
        ln = b.strip().splitlines()
        if len(ln) >= 3 and '-->' in ln[1]:
            a, z = [x.strip() for x in ln[1].split('-->')]
            blocos.append({'a': ms(a), 'z': ms(z), 'ta': a, 'tz': z, 'txt': ' '.join(ln[2:]).strip()})
    return blocos

def cap(s): return s[:1].upper() + s[1:]
def low(s): return s[:1].lower() + s[1:]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('entrada'); ap.add_argument('saida')
    ap.add_argument('--nomes', default='', help='nomes próprios extras, separados por vírgula')
    ap.add_argument('--trocas', help='JSON {"errado": "certo"} aplicado antes da caixa')
    ap.add_argument('--pausa', type=float, default=0.7)
    ap.add_argument('--expressoes', default='', help='nomes de várias palavras: "Graffiti Contra Enchente,Arte Mídia Cultural"')
    a = ap.parse_args()
    nomes = {n.lower(): n for n in NOMES + [x.strip() for x in a.nomes.split(',') if x.strip()]}
    trocas = json.load(open(a.trocas, encoding='utf-8-sig')) if a.trocas else {}
    bl = sorted(ler(a.entrada), key=lambda b: b['a'])
    log, conferir = [], []
    # duplicado seguido
    limpo = []
    for b in bl:
        if limpo and b['txt'] == limpo[-1]['txt']:
            limpo[-1]['z'], limpo[-1]['tz'] = b['z'], b['tz']; log.append(f"{b['ta']} bloco repetido juntado"); continue
        limpo.append(b)
    bl = limpo
    for i, b in enumerate(bl):
        t0 = t = b['txt']
        for e, c in trocas.items(): t = t.replace(e, c)
        t = re.sub(r'\b(\w+) \1\b', r'\1', t, flags=re.I)                      # da da -> da
        t = re.sub(r'((?<!\.)[.!?]\s+)(\w)', lambda m: m.group(1) + m.group(2).upper(), t)  # depois de ponto (não reticências)
        # nomes próprios em qualquer posição
        t = ' '.join(nomes.get(re.sub(r'\W', '', w).lower(), None) and re.sub(r'\w+', nomes[re.sub(r'\W', '', w).lower()], w, 1) or w for w in t.split(' '))
        # anterior = último bloco que terminou antes deste começar (com duas falas sobrepostas, segue a mesma voz)
        antes = [x for x in bl[:i] if x['z'] <= b['a'] + 50]
        ant = max(antes, key=lambda x: x['z']) if antes else None
        novo = ant is None or (b['a'] - ant['z']) / 1000 > a.pausa or re.search(r'[.!?…]$|\.\.\.$', ant['txt'])
        w1 = re.sub(r'\W', '', t.split(' ')[0]).lower()
        if novo: t = cap(t)
        elif w1 not in nomes and not (w1.isupper() and len(w1) > 1): t = low(t)
        if t != t0: log.append(f"{b['ta']}  {t0}  ->  {t}")
        b['txt'] = t
        if i and b['a'] < bl[i-1]['z'] - 50: conferir.append(f"{b['ta']} sobrepõe o bloco anterior (duas falas juntas?): '{bl[i-1]['txt']}' / '{t}'")
    # expressões com várias palavras (nome de evento, empresa), mesmo quebradas entre blocos
    SEP = '\x00'
    junto = SEP.join(b['txt'] for b in bl)
    for ex in EXPRESSOES + [x.strip() for x in a.expressoes.split(',') if x.strip()]:
        pal = ex.split()
        pat = r'\b' + r'(\s|\x00)+'.join(re.escape(p) for p in pal) + r'\b'
        def rep(m, pal=pal):
            seps = re.findall(r'(?:\s|\x00)+', m.group(0)); out = pal[0]
            for s, p in zip(seps, pal[1:]): out += s + p
            return out
        junto = re.sub(pat, rep, junto, flags=re.I)
    for b, t in zip(bl, junto.split(SEP)):
        if t != b['txt']: log.append(f"{b['ta']}  {b['txt']}  ->  {t}  (expressão)"); b['txt'] = t
    with open(a.saida, 'w', encoding='utf-8') as f:
        for n, b in enumerate(bl, 1): f.write(f"{n}\n{b['ta']} --> {b['tz']}\n{b['txt']}\n\n")
    print(f"{len(bl)} blocos; {len(log)} mudanças"); print('\n'.join(log))
    if conferir: print('\nCONFERIR:'); print('\n'.join(conferir))

if __name__ == '__main__':
    sys.exit(main())
