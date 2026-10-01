# GUIA-EDICAO :: Pocket Editor (Canivete do Pailer) — para agentes de IA
# formato: denso, para máquina. calibrar a cada feedback do usuário (seção CALIBRACAO no fim). v1 2026-09-30

## 0 ACESSO
- porta: %APPDATA%/CaniveteDoPailer/agente.json → instancias[].porta (pid vivo?) ; senão varrer 127.0.0.1:9222..9231/json
- conectar: playwright chromium.connect_over_cdp ; página certa = index.html com `typeof VE==='object'` e `window.pywebview`
- timeline/painéis podem estar em janelas soltas (outras páginas index.html sem VE): DOM lá, JS/estado na principal
- TODA ação no app do usuário: `veAgente('descrição curta', () => {...})` (aviso roxo + log; Ctrl+Z desfaz)
- ver o que o usuário viu: `veLogTexto(40)` (toasts, erros JS, resultado de exportação)
- NUNCA salvar o projeto (Ctrl+S) nem fechar o app sem pedido. criar timeline nova em vez de mexer na existente
- testes de código: outra instância `python main.py --agente=9333` (não usar a do usuário)

## 1 LER MÍDIA (barato em tokens) — Functions/agente_midia.py
- `python -m Functions.agente_midia analisar "<proj.vcnvt>" --nao-usados-em "<timeline>"` → 1 comando:
  folhas de contato (10 vídeos/img) + cena por CLIP local (rótulos em CENAS) + fala (vídeos ≤180 s) + suspeitas
  saída: resumo 1 linha/vídeo + mapa_*.json. ~40 s p/ 19 vídeos (cache depois)
- no app: `await veAgenteMidia('analisar', [proj, '--nao-usados-em', nome])` (processo à parte)
- detalhe: `storyboard <vid> --passo 1 --inicio a --fim b` (escolher trecho exato) ; `transcrever <arq>` (palavras c/ tempo)
- música: `batidas <audio>` → bpm, batidas[], fortes[] (±10 ms; se bpm>160 usa metade, ver bpm_alternativo)
- olhar imagem só quando o resumo não basta: Read na folha/storyboard (1 img ≈ 2–3k tokens). evitar prints do app
- fala com microfone ruim: `--limpo` NÃO melhora (medido); confiar no dicionário

## 2 MODELO DE DADOS (VE.clips[i])
- {tr: trilha 0=V1/A1, st: início na timeline s, s/e: entrada/saída na fonte s, m: id da mídia (0=vídeo aberto)}
- x:'v' só imagem | x:'a' só som | g: ganho dB | v: velocidade | p:{sc,x,y,rot,op} | k:{prop:[{t,v,i}]} quadros-chave (tempo DA FONTE)
- fx:[{id,t,on,v}] efeitos (VE_FX; constantes ca_rot/ca_wig/ca_pul = movimento em loop) | bm: modo de mesclagem
- tin/tout: transição de vídeo {t,d,speed,dir} (veTrObj(t)) ; atin/atout: áudio {t:'cp',d}
- texto: m=media kind 'texto', c.tx{t,fam,tam,cor,...} ; cor sólida kind 'cor' (m.fill) ; forma c.fm ; pincel c.br
- legendas: VE.legendas[{st,en,texto,pt:[[a,b] por palavra],estilo?}] ; estilo base VE.legEstilo ; transcrição VETX.palavras (por timeline)
- criar timeline: `veCreateTimeline({name})` (vira a ativa) ; depois `veRelayout(); veRefresh();`
- trilha livre acima de tudo: `veCeTrilhaAcima('v'|'a')`
- trocar o arquivo de uma mídia mantendo todos os clipes (ex.: versão com som melhorado): `veTrocarArquivo(VE.media[id], path)`
- mover legenda: SEMPRE `veLegMover(l, d)` (leva l.pt junto) ; tirar trecho de todas as trilhas: `veLegRipple(a, b)`
- legendas a partir de palavras: VETX.palavras=[[ini,fim,txt]...] ; `VE.legendas = veTxMontarLegendas({max,linhas,minDur,gap})`

## 3 RECEITA: REEL A PARTIR DE TIMELINE MODELO
1. ler a timeline modelo (seção 2) → extrair padrão: ritmo de cortes, trilhas de apoio, gráficos fixos, música, legenda
2. `analisar` (seção 1) → escolher: falas (transcrição) + takes de apoio (rótulo CLIP ≈ palavra falada)
3. plano em python (fora do app): trechos [mídia, de, até] por PALAVRAS (w[0] in [a,b)); corte seco na pausa:
   > 0.30 s depois de pontuação (.,?!;:), > 0.60 s no meio da frase (respiração curta fica);
   FIM do corte = quando a VOZ acaba (energia em quadros de 10 ms > limiar; aceita vales < 60 ms; até +0.7 s;
   nunca até a próxima palavra − 0.04 s) + 0.08 s — o fim de palavra do modelo é estimado e corta sílaba;
   COMEÇO: volta até 0.21 s enquanto há voz ; cortes contíguos do mesmo vídeo (gap < 0.08 s) = 1 corte só
   aplicar dicionário ; conferir `suspeitas` antes de gerar legenda ; script modelo: ver histórico (plano_v2b)
4. apoio: entra em `tempo_da_palavra − 0.1..0.15 s`, dura 1.5–2.5 s, só imagem (x:'v'), tela cheia, trilha acima da fala
5. gráficos/música: COPIAR os clipes da modelo (JSON.parse(JSON.stringify(c))) e só ajustar st/s/e/tr
6. montar via veAgente em passos visíveis (1 aviso por etapa) ; no fim: 1 print do monitor num ponto com apoio+legenda
7. relatar: estrutura em tabela tempo→fala→apoio ; o que não tinha imagem ; pedir para o usuário assistir

## 4 ESTILO PADRÃO (cliente imobiliário Helo Ribeiro; confirmar lendo a modelo)
- 1080x1920 30 qps ; fala em V1 voz +2 dB, cortes ~3 s ; apoio V2 1.4–4 s sem som
- GC "GC HELO RIBEIRO.mov" + Luma Key no início ; logo BRANDBOOK-02 sc≈9 canto sup.dir. + ca_rot ; ajuste Luz e Cor no topo
- camada PINCEL (kind 'pincel') sob o logo = fundo de apoio de leitura ; logo e pincel vão de 0 até o fim da fala (não na assinatura)
- assinatura .mov (alfa) no fim ; música −17 dB na fala → −4 dB na assinatura com fade
- legenda: SF Pro Display ~50 px, 2 linhas ~18 car, sem caixa, sombra, entrada pop, py 8, destaque palavra #385641

## 5 TRANSIÇÕES NOS TAKES DE APOIO (dinâmica)
- não em todos: ~1 a cada 3 takes de apoio ; os demais corte seco
- entrada do nada (clipe sem vizinho antes na trilha): `c.tin = veTrObj('push'|'slide'|'chicote'|'pop'|'pull')` ; saída: c.tout
- velocidade 'fast' (0.45 s) ; direção acompanhando o movimento da câmera no take (dir: r/l/u/d)
- se houver música: alinhar o MEIO da transição (ou o corte) a uma batida de `batidas` (fortes p/ momentos-chave)
- evitar transição sobre o GC e na assinatura ; nunca dissolve longo em reel dinâmico
- novas transições do painel Animação: ler VE_TR (editor-trans.js) para nomes/opções

## 6 LEGENDAS: QUALIDADE
- dicionário de nomes: %APPDATA%/CaniveteDoPailer/dicionario_fala.json {"errado":"certo"} (vale p/ painel Texto e ferramentas)
- `suspeitas` = nomes próprios duvidosos → corrigir palavra no plano ou perguntar ao usuário ; acrescentar ao dicionário
- conhecidos (já no dicionário): Elon→Helo ; Brooklyn→Brooklin (bairro SP) ; lisão→Lisonda (marca da quadra de tênis)

## CALIBRACAO (feedback do usuário, mais novo em cima)
- 2026-09-30 correção de diagnóstico: manchas/traços ROSA na imagem vinham das CURVAS do Luz e Cor (vermelho puxado
  para baixo) na camada de ajuste copiada da modelo — NÃO da camada de pincel. ao ver cor estranha: checar fx 'lc'
  (curvas/rodas) das camadas de ajuste antes de culpar outra camada; ao copiar a camada de ajuste, avisar o usuário.
- 2026-09-30 V2 MENOR refeita: pedido = transições em takes de apoio, não cortar antes do fim da frase, legenda certa,
  manter a camada de PINCEL da V1 (forma no canto sup.dir. atrás do logo = apoio de leitura; copiar junto com o logo,
  st 0 → fim da fala). feito: chicote + push na batida (2/5 apoios), fim de corte pela energia da voz. aguardando nota.
- 2026-09-30 V2 MENOR (lazer, 45 s, Portugal): nota 9/10. acertos: apoio no momento certo, música, legenda.
  erros: palavras erradas na legenda (mic ruim). ação: dicionário + suspeitas + guia. pediu: transições em parte dos apoios.
