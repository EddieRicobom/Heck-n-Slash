# Eddie Wolfunny: Presas da Noite

Hack 'n' slash 3D em cel shading que roda no navegador (three.js), estrelado pelo Eddie Wolfunny, um híbrido de lobo e coelho.

## Como jogar

**Jogue no navegador:** https://eddiericobom.github.io/Heck-n-Slash/

Para rodar localmente, dê dois cliques em `jogar.bat` (precisa do Python ou do Node.js). Ele inicia um servidor local e abre o jogo em `http://localhost:8765/`.

Também dá para rodar manualmente:

```bash
python tools/serve.py 8765
```

## Personagens

Troque de personagem no menu inicial.

- **Eddie Wolfunny**: Garras, Katana e Martelo. Melhorias permanentes no Altar das Almas.
- **Tigresa de Titânio** (opcional): ciborgue com Manoplas elétricas, Glaive de longo alcance e Canhão de plasma. Ela tem técnicas próprias, o golpe final Protocolo Ômega e a Árvore de Titânio, uma árvore de habilidades comprada com almas que libera combos e fortalece cada arma.

## Modos

- **Explorar o Mundo**: mapa aberto de 380 m com 7 regiões, 34 acampamentos, baús, santuários e 3 guardiões.
- **Arena**: 10 ondas com chefes e modo infinito.
- **Treino**: boneco imortal e medidor de DPS.

## Controles

| Ação | Teclado e mouse | Controle |
|---|---|---|
| Mover / mirar | WASD / mouse | Analógico esquerdo / direito |
| Ataque leve / pesado | Botão esquerdo / direito (ou J / K) | X / Y |
| Pular (duplo) | Espaço | A |
| Esquiva | Shift | B |
| Técnicas | E / R | LT / LB |
| Lua Cheia (ultimate) | F | RT |
| Trocar estilo | 1 2 3 / Q | RB / D-pad |
| Pausa e combos | Esc | Start |

Três estilos (Garras, Katana e Martelo), cada um com dezenas de combos: pausas no combo, ataques após a esquiva, golpe de troca, lançador segurando para trás, combos aéreos e mergulhos.

## Estrutura

- `src/`: código do jogo (ES modules, sem build)
- `assets/`: modelos GLB e animações
- `vendor/three/`: three.js r170 (licença MIT)
- `tools/`: scripts de geração e empacotamento dos assets via Meshy. A chave da API fica em `.env`, que não é versionado.

## Créditos

- Personagem Eddie Wolfunny: arte original do dono do personagem.
- Modelos, rig e animações gerados com [Meshy](https://www.meshy.ai).
- Engine: [three.js](https://threejs.org) (MIT).
- Trilha sonora e efeitos sonoros sintetizados em tempo real pelo próprio jogo.
