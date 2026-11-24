# Motions avançados: catálogo com nome e gatilho
Técnicas de ponto alto (After Effects feito à mão pelo Pailer). Usar POUCAS por vídeo (1 a 2 por teaser), só em momento marcante: abertura, virada, clímax, final. Têm de sair visivelmente bonitas e profissionais; se não der para fazer limpo, não usar.
Fonte: Pailer, 2026-11-24, teaser ExpoCatadores (`estudo-teaser-expocatadores.md`). Status: 🔒 = descrita, ainda não executada e aprovada no app; 🔓 = executada e aprovada. Ao executar, mudar o status e anotar a nota do Pailer.

## 1. PLACA QUE ABRE (revelação por vazado) 🔒
**Gatilhos:** abertura de evento, marca no palco, placa/painel/letreiro redondo, "abrir o vídeo por dentro da marca", intro de teaser, revelação de cena.
**O que é:** uma imagem fixa (placa) com o miolo transparente e a marca no centro. A placa desce e abre o buraco; por trás aparece o vídeo de abertura. Depois um zoom de passagem entra no vídeo e o vídeo segue dali.
**Como o Pailer fez:** recorte perfeito do miolo no Photoshop (PNG com alfa), máscara no After Effects, placa descendo, vídeo atrás, zoom.
**Como montar no KANIVETE:**
1. Camada de cima: PNG da placa, alfa limpo (miolo vazado, marca opaca ou separada em camada própria).
2. Camada de baixo: o vídeo de abertura.
3. Quadros-chave: posição Y da placa descendo com aceleração; escala da placa e do vídeo crescendo juntos até o vídeo ocupar o quadro (zoom de passagem). Zoom só em camada de ajuste (`fx zoom`).
4. Som de impacto ou swoosh na batida em que a placa solta; corte seguinte na semicolcheia.
**Qualidade:** borda do alfa sem serrilhado nem halo (conferir por número e em 1 quadro ampliado); sem pulo na troca placa→vídeo; duração curta (0,8 a 1,5 s).

## 2. POR TRÁS DA SILHUETA (logo, imagem ou texto atrás da pessoa) 🔓 parcial
**Gatilhos:** texto atrás da pessoa, logo atrás do personagem, título que passa atrás, gancho com frase atrás, ponto alto de teaser com pessoa em destaque.
**O que é:** logo, imagem ou texto passa por trás do personagem: o recorte da pessoa fica por cima do elemento.
**Receita pronta:** `receita-gancho-texto-atras.md` (Pincel Roto, uma cópia do clipe por pessoa, máscara conferida por número: alfa da cabeça ≥ 0,6 e da outra pessoa 0). Também `pincel-roto.md`.
**Ordem de trilhas:** vídeo → elemento atrás → cópia recortada da pessoa → ajustes.
**Qualidade:** borda do recorte limpa em movimento, sem tremer; elemento grande e legível; entra e sai com easing e no ritmo da música; usar só em momento marcante.

## Como escolher e combinar
- Teaser com palco ou marca forte → PLACA QUE ABRE na abertura; POR TRÁS DA SILHUETA num ponto alto no meio ou no clímax.
- Nunca os dois seguidos nem em todo plano. O resto do vídeo segue o método de corte e ritmo.
- Antes de executar: plano curto (qual técnica, onde, por quê) e 1 teste de 3 s; só depois a peça inteira.
- Ideias novas do Pailer entram aqui com nome, gatilhos, como foi feito e como montar.
