# GC-LAB

**Version:** v0.3.0 – Single-Mode-Ausbau und zeitlich wachsendes Chromatogramm  
**Projekt:** CHEMIE mit KI – Digitales Analytiklabor

Browserbasiertes virtuelles Gaschromatographie-Labor ohne Build-Prozess und ohne Backend.

## v0.1.0

Der erste Stand konzentriert sich bewusst auf die fachliche Basis:

- isotherme GC-Simulation mit kuratierten Retentionsparametern
- zwei stationäre Phasen (unpolar / polar)
- Kapillarsäulenlängen 15 / 30 / 60 m
- Ofentemperatur 70–140 °C in 10-°C-Schritten
- Trägergasstrom niedrig / mittel / hoch
- Grundmodus und Methodenentwicklungsmodus
- Gauß-Peaks und echte Peaküberlagerung
- Retentionszeiten, Peakflächen, Basisbreiten
- Berechnung der chromatographischen Auflösung `R_s`
- Zielschwelle `R_s ≥ 1,5`
- Run-Historie und adaptive Methodenhinweise
- drei kuratierte Startproben

## Noch nicht enthalten

- Referenzstandards / Aufstockung
- Strukturaufklärungs-Lab
- Temperaturprogramm
- quantitative GC-Kalibration

## Lokaler Test

Im Repo-Ordner:

```powershell
py -m http.server 8000
```

Dann im Browser:

```text
http://localhost:8000/
```

## Architektur

```text
GC_LAB/
├── index.html
├── app.js
├── styles.css
├── data/
│   ├── gc-substances.json
│   ├── gc-columns.json
│   └── gc-samples.json
├── GC_LAB_SPEC_v0.1.md
└── README.md
```

Die Stoff-IDs entsprechen von Beginn an den CORE-IDs des Digitalen Analytiklabors.


## v0.1.1 – Historienvergleich

- Einträge der Versuchshistorie sind anklickbar.
- Beim Anklicken werden Chromatogramm, Messwerte und Methodenfeedback des gewählten Runs erneut dargestellt.
- Die damals verwendeten Parameter werden zugleich wieder in die Methodenauswahl übernommen.
- Der aktuell angezeigte Run wird in der Historie markiert.
- Ein neuer Lauf wird automatisch zum aktuell ausgewählten Historieneintrag.

Für spätere Versionen vorgemerkt: zeitlich entstehendes Chromatogramm mit wählbarer Beobachtungsgeschwindigkeit sowie behutsam realistischere Signalform/Basislinie.


## v0.1.2 – Analytik-Hub und Runtime-Fraktionen

Der direkte Single-Mode bleibt erhalten. Nur ein Aufruf mit `?bridge=1&run=...` aktiviert den Hub-Modus.

Im Hub-Modus:

- wird F1, F2 oder F3 aus dem zuvor akzeptierten Destillations-Run übernommen,
- wird die tatsächliche Runtime-Zusammensetzung intern für die Peakflächen verwendet,
- bleiben Stoffidentitäten und Zusammensetzung im SchülerInnen-UI verborgen,
- sind alle vier Methodenparameter der Methodenentwicklung verfügbar,
- bleiben unzureichende Runs in der Versuchshistorie sichtbar,
- kann ein sauberer Einzelpeak direkt übernommen werden (`R_s` ist dann nicht anwendbar); bei mehreren Peaks wird `Run an Hub übernehmen` erst ab `R_s ≥ 1,5` aktiviert,
- enthält das RESULT Retentionszeiten, Peakflächen, Peakbreiten und minimale Auflösung,
- bleiben die Peaks als P1/P2/... fachlich zunächst unidentifiziert,
- wird eine interne Peak→CORE-ID-Zuordnung nur für die spätere Strukturaufklärungs-Kopplung transportiert.

Das Fraktionsvolumen beeinflusst die GC-Peakfläche nicht direkt; jede GC-Messung verwendet eine standardisierte kleine Injektionsmenge.


### Einzelpeak-Regel

Die Auflösung `R_s` ist nur zwischen mindestens zwei Peaks definiert. Eine nahezu reine Destillationsfraktion kann daher einen einzigen detektierbaren Peak liefern. Ein solcher Lauf ist als GC-Messung gültig und darf an den Hub zurückgegeben werden; die Stoffidentität bleibt dennoch unbekannt. Bei zwei oder mehr Peaks gilt weiterhin die Mindestauflösung `R_s ≥ 1,5`.


## v0.2.0 – Referenzstandard und Aufstockung

Nach einer spektroskopisch gestützten Strukturhypothese kann GC-LAB in einem gezielten Bestätigungsmodus erneut aus dem Analytik-Hub gestartet werden.

Der Bestätigungsmodus:
- übernimmt exakt die Methode des ursprünglichen GC-Laufs und sperrt deren Parameter
- rekonstruiert den Ausgangslauf als Bezug
- misst nur den bereits begründeten Referenzstandard; kein Trial-and-Error mit Standards
- prüft die Übereinstimmung der Retentionszeit
- führt anschließend eine modellierte Aufstockung derselben Probe mit diesem Standard durch
- bestätigt, dass derselbe Peak an derselben Retentionszeit wächst und kein zusätzlicher Peak entsteht
- verwendet für das Peakwachstum die absolute modellierte Detektorantwort, sodass auch ein 100-%-Einzelpeak sinnvoll geprüft werden kann
- gibt erst nach beiden Belegen ein GC_CONFIRMATION-RESULT mit identity_status: confirmed an den Hub zurück

Die Aufstockung ist ein didaktisches Modell und keine quantitative Standardadditionsmethode.


## v0.3.0 – eigenständiges Methodenlabor

Der nach der Hub-Entwicklung fachlich stabile GC-Kern wurde für den direkten Unterrichtseinsatz erweitert.

### Sechs kuratierte Mischproben

Bestehend:
- Ethylacetat / 1-Butanol (50 : 50)
- n-Hexan / Toluol (50 : 50)
- Aceton / Ethanol / Toluol (35 : 35 : 30)

Neu:
- Methanol / Ethanol / 1-Butanol (33 : 34 : 33) – homologe Alkoholreihe
- Aceton / Ethanol / Ethylacetat (34 : 33 : 33) – Selektivität und mögliche Änderung der Elutionsreihenfolge
- n-Hexan / Cyclohexan / Toluol (34 : 33 : 33) – unpolares Dreikomponentengemisch

Im Grundmodus werden bewusst nur Zweikomponentenproben angeboten. Im Modus Methodenentwicklung stehen alle sechs Proben zur Verfügung.

### Zeitlich wachsendes Chromatogramm

Ein GC-Lauf erscheint nicht mehr zwingend sofort vollständig. Drei Darstellungsmodi sind verfügbar:

- **Beobachten · 12×** – Standard; ein typischer Lauf entsteht über mehrere Bildschirmsekunden
- **Schnell · 60×** – für wiederholte Methodenoptimierung
- **Sofort · Ergebnisansicht** – für gezielte Vergleiche ohne Wartezeit

Wichtig: Die x-Achse zeigt immer die chromatographische Modellzeit. 12× bzw. 60× beschleunigt ausschließlich die Bildschirmdarstellung und verändert weder Retentionszeiten noch Auflösung oder Peakflächen.

Während des laufenden Chromatogramms:
- wächst nur das Detektorsignal bis zur aktuellen chromatographischen Zeit,
- zeigt ein Zeitcursor die aktuelle Position,
- bleiben Peakzahl, Rₛ, Qualitätsbewertung und Peak-Tabelle zunächst verborgen.

Erst nach Erreichen der vollständigen Laufzeit erscheint die Auswertung. Damit wird sichtbar, dass GC eine zeitabhängige Trenn- und Messmethode ist und kein sofortiger „Knopfdruck-Test“.

### Betriebsmodi

Die Hub-Anbindung und die gezielte Bestätigung mit Referenzstandard/Aufstockung bleiben fachlich unverändert. Die neue Messdarstellung ändert keine Simulationsparameter und keine RESULT-Struktur.

Leichte Basislinienunruhe oder Peak-Asymmetrie sind bewusst noch nicht Bestandteil von v0.3.0. Die idealisierten Gaußpeaks bleiben für die quantitative und didaktische Auswertung zunächst erhalten.
