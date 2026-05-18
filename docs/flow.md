Concetto principale

TrackersLens deve avere due livelli:

1. Runtime reale
2. Visual Flow

Il runtime fa funzionare i dati.

Il Visual Flow mostra e permette di configurare:

API → boxTracker → Channel → AI Agent → boxLens → Action

Quindi non è solo una UI tipo n8n, ma una mappa viva del workspace.

Differenza con n8n

n8n lavora principalmente con:

workflow → node → node → node

TrackersLens invece lavora con:

workspace visuale + box dati + box grafici + agenti AI + canali realtime

Questa è la differenza forte.

In TL il flusso non è separato dalla dashboard.
Il flusso è il sistema nervoso dietro i box.

Struttura logica

Io lo dividerei così:

Source
↓
boxTracker
↓
Channel
↓
Processor / AI Agent
↓
Channel
↓
boxLens
↓
Action / Alert / Storage
Tipi di nodi

1. Source Node

Rappresenta la fonte esterna.

Esempi:

Binance API
CoinGecko API
RSS Feed
YouTube API
WebSocket
Webhook
Manual JSON
IndexedDB

Non è ancora un box, è solo la sorgente.

2. boxTracker Node

È il nodo che prende i dati.

Esempio:

BTC Price Tracker
News RSS Tracker
YouTube Tracker
Market Cap Tracker

Responsabilità:

fetch
websocket
polling
retry
normalize
log
emit channel 3. Channel Node

Questo è fondamentale.

Il channel è il nome del flusso dati.

Esempio:

btc.price
btc.rsi
news.crypto
youtube.btc
ai.market.analysis

Il channel permette a più box di ascoltare lo stesso dato.

Esempio:

btc.price
├─ BTC Price Lens
├─ AI Market Analyzer
└─ Alert Agent 4. Processor Node

Nodo opzionale per trasformare dati.

Esempi:

Filter
Mapper
Normalizer
Aggregator
Formula
Condition
Throttle
Merge
Split

Questo ti serve per non mandare dati sporchi direttamente alla UI.

5. AI Agent Node

Nodo intelligente.

Esempi:

Market Analyzer
News Summarizer
Sentiment Analyzer
Endpoint Debugger
Workspace Assistant
Alert Agent

Prende dati da uno o più channel e produce un output.

6. boxLens Node

È la parte grafica.

Esempi:

BTC Price Card
RSI Chart
News List
YouTube Player
AI Insight Panel
Map View

Ascolta channel e renderizza.

7. Action Node

Azioni finali.

Esempi:

Send Notification
Save to IndexedDB
Update Workspace
Trigger Alert
Export JSON
Call Webhook
Modello dati base

Io creerei uno store IndexedDB:

tl_flows
tl_channels
tl_connections
tl_events
tl_channels
{
id: "channel_btc_price",
name: "btc.price",
label: "BTC Price",
type: "number",
sourceBoxId: "tracker_binance_btc",
lastValue: null,
lastEmittedAt: null,
subscribers: [
"lens_btc_card",
"agent_market_analyzer"
],
createdAt: Date.now(),
updatedAt: Date.now()
}
tl_connections
{
id: "conn_001",
workspaceId: "workspace_crypto",
fromNodeId: "tracker_binance_btc",
fromOutput: "price",
toNodeId: "lens_btc_card",
toInput: "btc.price",
channel: "btc.price",
status: "active",
createdAt: Date.now(),
updatedAt: Date.now()
}
tl_flows
{
id: "flow_crypto_monitor",
workspaceId: "workspace_crypto",
name: "Crypto Monitoring Flow",
nodes: [
{
id: "source_binance",
type: "source",
label: "Binance WebSocket",
position: { x: 80, y: 120 }
},
{
id: "tracker_binance_btc",
type: "boxTracker",
label: "BTC Price Tracker",
position: { x: 320, y: 120 },
boxId: "box_tracker_001"
},
{
id: "channel_btc_price",
type: "channel",
label: "btc.price",
position: { x: 560, y: 120 }
},
{
id: "lens_btc_card",
type: "boxLens",
label: "BTC Price Card",
position: { x: 820, y: 80 },
boxId: "box_lens_001"
}
],
connections: [
"conn_001"
],
createdAt: Date.now(),
updatedAt: Date.now()
}
Event Bus reale

Nel codice deve esistere un EventBus vero:

class TLEventBus {
constructor() {
this.channels = new Map();
this.lastValues = new Map();
this.logs = [];
}

on(channel, callback) {
if (!this.channels.has(channel)) {
this.channels.set(channel, new Set());
}

    this.channels.get(channel).add(callback);

    return () => {
      this.channels.get(channel)?.delete(callback);
    };

}

emit(channel, payload, meta = {}) {
const event = {
id: crypto.randomUUID(),
channel,
payload,
meta,
timestamp: Date.now()
};

    this.lastValues.set(channel, event);
    this.logs.push(event);

    const listeners = this.channels.get(channel);
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(payload, event);
        } catch (error) {
          console.error("[TLEventBus]", error);
        }
      });
    }

    return event;

}

getLast(channel) {
return this.lastValues.get(channel);
}
}
Visual Flow

Il Visual Flow deve mostrare:

nodi
collegamenti
stato realtime
ultimo dato
errori
latenza

Ogni linea deve poter mostrare:

attiva
in pausa
errore
ultimo evento
dati/sec
Come lo vedo graficamente
Nodo boxTracker
┌─────────────────────────┐
│ 🟢 BTC Price Tracker │
│ WebSocket • Binance │
│ Output: btc.price │
│ Last: 63,245.67 │
└─────────────────────────┘
Nodo Channel
╭────────────────╮
│ btc.price │
│ 24 events/min │
╰────────────────╯
Nodo AI
┌─────────────────────────┐
│ 🧠 Market Analyzer │
│ Input: btc.price/news │
│ Output: ai.btc.analysis │
└─────────────────────────┘
Nodo boxLens
┌─────────────────────────┐
│ 📊 BTC Price Card │
│ Listening: btc.price │
│ Rendered: active │
└─────────────────────────┘
Modalità Visual Flow

Io farei 3 modalità.

1. View Mode

Solo visualizzazione.

Serve per capire:

chi comunica con chi
dove passano i dati
quali nodi sono attivi 2. Edit Mode

Permette di:

creare connessioni
spostare nodi
aggiungere processor
collegare tracker a lens
cambiare channel 3. Debug Mode

Mostra:

eventi live
payload JSON
errori
latenza
retry
last response

Questa sarà potentissima.

Collegamento con workspace

Questa parte è cruciale.

Ogni box nel workspace deve avere un pulsante:

View Flow

Quando lo clicchi, TL mostra il flow collegato a quel box.

Esempio:

clicchi su BTC Price Card

TL mostra:

Binance API → BTC Tracker → btc.price → BTC Price Card
Collegamento con boxLens

Ogni boxLens deve dichiarare:

inputs: [
{
name: "price",
channel: "btc.price",
type: "number"
}
]
Collegamento con boxTracker

Ogni boxTracker deve dichiarare:

outputs: [
{
name: "price",
channel: "btc.price",
type: "number"
},
{
name: "volume",
channel: "btc.volume",
type: "number"
}
]
Manifest evoluto boxTracker
{
id: "tracker_binance_btc",
type: "boxTracker",
name: "Binance BTC Tracker",
runtime: {
mode: "websocket",
endpoint: "wss://stream.binance.com:9443/ws/btcusdt@ticker",
reconnect: true
},
outputs: [
{
key: "price",
channel: "btc.price",
label: "BTC Price",
type: "number"
},
{
key: "change24h",
channel: "btc.change24h",
label: "24h Change",
type: "number"
}
]
}
Manifest evoluto boxLens
{
id: "lens_btc_card",
type: "boxLens",
name: "BTC Price Card",
inputs: [
{
key: "price",
channel: "btc.price",
required: true,
type: "number"
},
{
key: "change24h",
channel: "btc.change24h",
required: false,
type: "number"
}
],
render: {
html: "",
css: "",
js: ""
}
}
Data Mapping

Quando colleghi un tracker a una lens, serve una schermata mapping.

Esempio:

BTC Tracker outputs BTC Lens inputs
price → price
changePercent → change24h
volume → volume

Questo è molto importante perché non sempre i nomi coincidono.

Visual Connection Builder

Quando l’utente trascina una linea da un nodo a un altro:

TL deve chiedere:

Quale output vuoi collegare?
Quale input vuoi ricevere?
Nome channel?
Trasformazione dati?

Esempio:

Output: lastPrice
Input: price
Channel: btc.price
Transform: parseFloat(value).toFixed(2)
Processor / Transform Node

Questo secondo me è necessario.

Esempio:

Binance raw data
↓
Transform Node
↓
btc.price normalized

Transform code:

return {
price: Number(data.c),
volume: Number(data.v),
change24h: Number(data.P)
};
Flow di esempio BTC
Binance WebSocket
↓
BTC Price Tracker
↓
Transform Binance Ticker
↓
Channel: btc.price
↓
BTC Price Lens

Channel: btc.price
↓
Market Analyzer AI
↓
Channel: ai.btc.analysis
↓
AI Insight Lens
Flow di esempio News
RSS Feed
↓
News RSS Tracker
↓
Channel: news.crypto
↓
News Summarizer AI
↓
Channel: ai.news.summary
↓
News Lens
Flow di esempio Alert
BTC Price Tracker
↓
Condition Node: price > 100000
↓
Alert Agent
↓
Notification Action
La parte veramente potente

Il workspace può restare bellissimo e libero.

Ma dietro ogni workspace esiste:

Flow Layer

Quindi hai:

Visual Workspace = ciò che vede l’utente
Flow Workspace = ciò che fa funzionare i dati

Questa separazione è potentissima.

UI che ti consiglio

Aggiungi una pagina o modalità:

Flow Map

Accessibile dal menu sinistro.

Oppure nel workspace:

Workspace
Flow
Debug
Struttura schermata Flow Map
┌──────────────────────────────────────────────┐
│ Topbar: Flow Map • Workspace Crypto Monitor │
├───────────────┬──────────────────────────────┤
│ Node Library │ Canvas Flow │
│ │ │
│ Source │ API → Tracker → AI → Lens │
│ Tracker │ │
│ Processor │ │
│ AI Agent │ │
│ Lens │ │
│ Action │ │
├───────────────┴──────────────────────────────┤
│ Event Inspector / Payload / Logs │
└──────────────────────────────────────────────┘
Node Library

A sinistra:

Sources

- REST API
- WebSocket
- RSS
- YouTube
- Manual JSON

Trackers

- Existing boxTrackers

Processors

- Filter
- Transform
- Merge
- Split
- Condition

AI

- Analyzer
- Summarizer
- Sentiment
- Debugger

Outputs

- boxLens
- Notification
- IndexedDB
  Inspector destro

Quando clicchi su un nodo:

Node settings
Inputs
Outputs
Channels
Last payload
Errors
Performance

Quando clicchi su una linea:

Connection settings
Channel
Mapping
Transform
Last event
Latency
Event Inspector sotto

Mostra gli eventi live:

12:32:14 btc.price emitted 63,245.67
12:32:15 btc.price received by BTC Lens
12:32:15 btc.price sent to Market Analyzer
12:32:18 ai.btc.analysis emitted
Runtime Status

Ogni nodo deve avere stato:

idle
running
online
paused
error
warning

E ogni stato deve apparire nel Flow:

verde = online
viola = AI running
oro = warning
rosso = error
grigio = idle
Primo MVP dell’Event Bus Visivo

Non fare tutto subito.

Io inizierei così:

MVP 1

1. EventBus reale
2. Channel registry
3. boxTracker outputs
4. boxLens inputs
5. connections salvate in IndexedDB
6. Flow Map read-only

Prima solo visualizza.

MVP 2

1. drag connection
2. mapping output/input
3. transform node semplice
4. event inspector live
   MVP 3
5. AI Agent node
6. condition node
7. action node
8. debug mode
   File da creare
   core/event-bus.js
   core/channel-registry.js
   core/connection-manager.js
   core/flow-runtime.js
   core/flow-debugger.js

ui/flow-map.js
ui/flow-node.js
ui/flow-connection.js
ui/flow-inspector.js
ui/event-inspector.js
IndexedDB stores

Aggiungerei:

tl_channels
tl_connections
tl_flows
tl_events
tl_flow_logs
API interna finale
TL.channels.create({
name: "btc.price",
type: "number"
});

TL.bus.emit("btc.price", {
price: 63245.67
});

TL.bus.on("btc.price", data => {
console.log(data);
});

TL.connections.create({
from: "tracker_btc",
output: "price",
to: "lens_btc",
input: "price",
channel: "btc.price"
});
Nome feature

Io la chiamerei:

Flow Map

oppure:

Runtime Flow

o ancora più forte:

DataFlow Lens

Secondo me:

Flow Map

è semplice e chiaro.

La frase chiave
Flow Map mostra il sistema nervoso del workspace.

Questa è la definizione perfetta.

Conclusione

La struttura vincente è questa:

boxTracker produce dati
Channel trasporta dati
Processor trasforma dati
AI Agent interpreta dati
boxLens visualizza dati
Action reagisce ai dati
Flow Map mostra tutto

Questa è la parte che può trasformare TrackersLens da dashboard builder a:

AI Data Runtime Operating Environment
