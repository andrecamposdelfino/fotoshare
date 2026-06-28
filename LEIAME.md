# 📸 FotoShare — React Native (Expo)

Tire uma foto no celular e ela aparece na pasta do seu PC. Versão Expo: sem Android Studio, sem compilação!

---

## O que você vai precisar

- **Node.js** → https://nodejs.org (baixe a versão LTS)
- **Python 3** → já vem no Mac/Linux; no Windows: https://python.org
- **Expo Go** no celular → busque na Play Store: *"Expo Go"*
- PC e celular na **mesma rede Wi-Fi**

---

## PARTE 1 — Servidor no PC

Abra o terminal na pasta do projeto e rode:

```bash
python3 servidor.py
```

*(No Windows use `python servidor.py`)*

Vai aparecer algo assim:

```
==================================================
   📸 FotoShare - Servidor PC
==================================================
   IP do seu PC:  192.168.1.105
   Porta:         8765
==================================================

   No app, coloque este endereço:
   👉  192.168.1.105:8765
```

**Anote esse endereço** — você vai digitar no app.

---

## PARTE 2 — App no celular

### 1. Instale as dependências

No terminal, dentro da pasta do projeto:

```bash
npm install
```

### 2. Inicie o Expo

```bash
npx expo start
```

Vai abrir um QR code no terminal.

### 3. Abra no celular

- Abra o app **Expo Go** no celular
- Escaneie o QR code
- O app FotoShare abre na hora! ✅

---

## PARTE 3 — Usar

1. No app, digite o endereço do servidor (ex: `192.168.1.105:8765`)
2. Toque em **Testar Conexão** → aparece ✅
3. Toque em **Tirar Foto e Enviar**
4. A foto aparece em segundos em `~/FotoShare/` no PC! 🎉

---

## Problemas comuns

| Problema | Solução |
|---|---|
| QR code não funciona | Certifique que celular e PC estão no mesmo Wi-Fi |
| "Não foi possível conectar" | Verifique o IP; no Windows libere o Python no Firewall |
| `npm install` falhou | Verifique se o Node.js está instalado (`node --version`) |
| Expo Go não acha o servidor | Tente digitar o IP manualmente no Expo Go |

---

## Estrutura do projeto

```
fotoshare-rn/
├── App.js          ← Todo o app React Native
├── app.json        ← Configurações do Expo
├── package.json    ← Dependências
└── servidor.py     ← Rode no PC para receber as fotos
```
