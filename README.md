# FC26 Pack Opener

Web app per l'apertura interattiva di pacchetti calciatori FC26.

## Stack
- **Backend**: Python 3.x + Flask 3.1.3
- **Frontend**: HTML / CSS / Vanilla JS (zero build steps)
- **Database**: `data/players.json` (18.405 giocatori)

## Avvio locale
```bash
pip install flask
python main.py
# → http://localhost:5000
```

## Deploy su Railway / Render (link pubblico)
1. Crea repo Git e carica tutti i file
2. Su Railway: "New Project" → "Deploy from GitHub"
   - Start command: `python main.py`
3. Su Render: "New Web Service"
   - Build command: `pip install -r requirements.txt`
   - Start command: `python main.py`
4. Il link generato è condivisibile con chiunque

## Struttura
```
fc26-pack-opener/
├── main.py              # Flask app + API endpoints
├── models.py            # Dataclasses: Player, PackConfig
├── pack_generator.py    # Logica bilanciamento pack
├── requirements.txt
├── data/
│   └── players.json     # Database 18.405 giocatori
└── static/
    ├── index.html
    ├── style.css
    └── app.js
```

## Logica bilanciamento
Range OVR es. 77-80 → pesi geometrici (base 2):
- OVR 80 → peso 8 (~52% delle estrazioni)
- OVR 79 → peso 4 (~27%)
- OVR 78 → peso 2 (~14%)
- OVR 77 → peso 1 (~7%)
