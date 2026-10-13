# GC-LAB

**Version:** v0.5.0 – Lernaufgaben für Einstieg und unbekannte Proben  
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

- frei erweiterbarer Referenzstandard-Pool für zusätzliche Hub-Substanzen
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


## v0.3.1 – Chromatogramm entziffern

Nach einem ausreichend getrennten Single-Mode-Lauf (`R_s ≥ 1,5`) erscheint der Arbeitsbereich **Chromatogramm entziffern**.

### Referenzstandard-Läufe

- Die erfolgreiche GC-Methode des Probenlaufs wird für die Identifikation eingefroren.
- Referenzstandards werden unter exakt denselben Bedingungen simuliert.
- Die Standardläufe entstehen im Vergleichsfenster zeitlich im Schnellmodus (60×).
- Das Probenchromatogramm bleibt grau gestrichelt als Referenz sichtbar; der Standard wird violett darübergelegt.
- Die Retentionszeit des Standards wird erst nach dem Standardlauf angezeigt.
- SchülerInnen wählen selbst, welcher Probenpeak zur Standard-Retentionszeit passt.
- Die Zuordnung wird anhand der Retentionszeit geprüft.
- Erst nach korrekter Zuordnung erscheint der Stoffname beim betreffenden Peak.

Für spätere unbekannte Proben ist auch die Option **kein passender Peak** vorgesehen. Damit können Referenzpools künftig gezielt Stoffe enthalten, die nicht in der Probe vorkommen.

### Kandidatenpool statt fest verdrahteter Zusammensetzung

Jede Single-Mode-Probe besitzt ab v0.3.1 ein Feld `candidate_pool`.

Bei den derzeitigen Lernproben entspricht dieser Pool noch den tatsächlich enthaltenen Komponenten. Die Identifikationslogik verwendet jedoch bewusst den Kandidatenpool und nicht die interne Probenzusammensetzung als Auswahlquelle.

Dadurch ist der nächste Ausbau vorbereitet:

- Proben können später neutrale Bezeichnungen wie `GC-U01` erhalten.
- Die Zusammensetzung kann im UI vollständig verborgen bleiben.
- Der Kandidatenpool kann mehr Stoffe als die Probe enthalten.
- Zusätzliche kuratierte Einzelsubstanzen können ergänzt werden, wenn neue Proben aus dem Analytik-Hub sie benötigen.

### Fachliche Trennung der Rollen

Der Single-Mode nutzt Referenzstandards zum systematischen Entziffern eines Chromatogramms.

Der Hub-Bestätigungsmodus bleibt davon getrennt: Dort folgt der gezielte Standard- und Aufstockungsversuch erst auf eine bereits spektroskopisch begründete Strukturhypothese.


## v0.3.2 – erste unbekannte Mischprobe GC-U01

Mit `GC-U01` steht erstmals eine echte unbekannte Mischprobe im Single-Mode zur Verfügung.

### Sichtbare Aufgabenstellung

Im UI werden weder Stoffnamen noch Zusammensetzung der Probe angezeigt. Die Probe erscheint nur als:

- **GC-U01 · unbekannte Mischprobe**
- neutrale Aufgabenbeschreibung ohne Angabe der enthaltenen Komponenten

Die bekannte Zusammensetzung bleibt ausschließlich Teil des internen Simulationsmodells.

### Arbeitsablauf

1. GC-Methode entwickeln
2. mindestens `R_s ≥ 1,5` erreichen
3. Chromatogramm mit getrennten Peaks auswerten
4. Referenzstandards aus einem Kandidatenpool messen
5. Standards anhand der Retentionszeiten Peaks zuordnen
6. nicht passende Standards als **kein passender Peak** erkennen
7. nach vollständiger Zuordnung die enthaltenen Komponenten anzeigen

### Kandidatenpool von GC-U01

Der Referenzpool umfasst fünf kuratierte Stoffe, von denen nur drei tatsächlich in der Probe enthalten sind. Zwei Kandidaten dienen als echte Negativkontrollen.

Die Negativkandidaten wurden über alle Methoden geprüft, mit denen GC-U01 im aktuellen Modell `R_s ≥ 1,5` erreicht. Ihre Retentionszeiten überlappen dabei nicht mit den drei Probenpeaks innerhalb der verwendeten Zuordnungstoleranz.

Damit entsteht keine künstliche Mehrdeutigkeit durch das Simulationsmodell.

### Erweiterbarkeit

GC-U01 ist als erster Prototyp für die weitere Serie `GC-Uxx` gedacht. Der Referenzpool bleibt von der internen Zusammensetzung getrennt. Neue kuratierte Einzelsubstanzen können später ergänzt werden, wenn weitere Single-Mode- oder Analytik-Hub-Proben sie benötigen.


## v0.4.0 – Trainingsserie und Trennprozess-Animation

### Unbekannte Proben GC-U01 bis GC-U05

Der Single-Mode enthält jetzt fünf unbekannte Dreikomponentenproben. Jede Probe:

- zeigt im UI nur einen neutralen Probencode,
- enthält intern drei Komponenten,
- bietet fünf Referenzstandards an,
- enthält davon zwei geprüfte Negativkandidaten,
- erfordert zuerst eine chromatographisch brauchbare Trennung und danach eine studentische Peakzuordnung.

Die Proben sind bewusst unterschiedlich anspruchsvoll:

- **GC-U02**: breiter Methodenraum, gut als Einstieg
- **GC-U03 / GC-U04**: mittlerer Methodenanspruch
- **GC-U05**: engerer Methodenraum und systematischere Optimierung
- **GC-U01** bleibt als anspruchsvoller Pilotfall erhalten

Für alle Negativkandidaten wurde der komplette Methodenraum geprüft, in dem die jeweilige Probe `R_s ≥ 1,5` erreicht. Innerhalb der verwendeten Zuordnungstoleranz entsteht kein falscher Treffer an einem echten Probenpeak.

### Einblendbares Prinzipmodell der GC-Trennung

Unterhalb des Chromatogramms kann **Trennprozess anzeigen** bereits vor dem ersten Single-Mode-Lauf aktiviert werden. Vor der Injektion ist nur der leere GC-Aufbau sichtbar; mit dem ersten Lauf startet die Prozessdarstellung synchron mit dem entstehenden Chromatogramm.

Das Prinzipmodell zeigt:

- einen symbolischen Injektor,
- Trägergas und mobile Phase,
- ein stark vergrößertes gerades Säulenstück,
- bis zu drei farblich getrennte Komponenten,
- wiederholte Wechselwirkungs-/Retentionsphasen an der stationären Phase,
- einen symbolischen Detektor,
- das daraus entstehende elektrische Signal,
- eine A/D-Stufe und die Weiterleitung zum Chromatogramm.

Die Darstellung vermeidet bewusst die Aussage, dass jede GC-Trennung ausschließlich durch Oberflächenadsorption entsteht. Wechselwirkung bzw. Verteilung an der stationären Phase wird didaktisch als wiederholte Anlagerung und Ablösung symbolisiert.

### Kopplung an den aktuellen Lauf

Die Animation ist bereits qualitativ mit dem GC-Modell verbunden:

- Retentionsreihenfolge und Laufzeiten stammen aus dem aktuellen Run,
- die relative Wechselwirkungsstärke wird aus den Retentionsfaktoren abgeleitet,
- die Bandenbreite orientiert sich an der simulierten Peakbreite,
- am Detektor wird das aktuelle simulierte Signal verwendet.

Bei unbekannten Proben zeigt die vorab geöffnete Innenansicht zunächst nur den leeren Aufbau. Erst mit der Injektion werden die neutral bezeichneten Komponenten A/B/C sichtbar. Die Ansicht ist damit bewusst als Lernhilfe nutzbar; Stoffidentitäten werden nicht verraten. Nach dem Lauf kann die Animation wiederholt werden oder bei einem weiteren Methodenlauf synchron mit dem entstehenden Chromatogramm mitlaufen.

Die Komponentennamen werden in der Innenansicht nicht gezeigt; A/B/C sind reine Symbolbezeichnungen.

### Darstellungsgeschwindigkeiten ab v0.4

Für eine besser beobachtbare Prozessdarstellung wurden die Bildschirmgeschwindigkeiten reduziert:

- **Beobachten · 8×** – Standard für Unterricht und Prozessanimation
- **Schnell · 40×** – zügige Methodenentwicklung
- **Sofort · Ergebnisansicht** – ohne zeitliche Darstellung

Auch Referenzstandard-Läufe verwenden jetzt 40×. Die Funktion **Animation wiederholen** nutzt 8×.



## v0.5.0 – Zwei integrierte Lernaufgaben

Der eigenständige Single-Mode enthält jetzt einen Aufgabenbereich oberhalb des freien Labors. Die Hub- und Bestätigungsmodi bleiben unverändert.

### GC-01 · Wie entsteht eine gute Trennung?

Geführter Einstieg mit Ethylacetat / 1-Butanol (50 : 50).

Ausgangspunkt ist bewusst eine ungeeignete Methode:
- unpolare Säule
- 15 m
- 140 °C
- hoher Gasstrom

Die Aufgabe führt anschließend durch klar getrennte Parametervergleiche:
1. Ausgangslauf und Trennprozess beobachten
2. ausschließlich die Temperatur verändern, bis die Trennung deutlich verbessert ist
3. bei gleicher Temperatur den Gasstrom auf mittel ändern
4. bei sonst gleicher Methode 15 m und 30 m Säulenlänge vergleichen
5. Versuchshistorie auswerten und eine Methodenbilanz formulieren

Die jeweils nicht untersuchten Parameter sind gesperrt. Am Ende zeigt die App die vier Vergleichsläufe und die kürzeste im eigenen Versuch analytisch brauchbare Methode. Die SchülerInnen müssen zusätzlich begründen, warum sie eine Methode als geeigneten Kompromiss aus Auflösung und Laufzeit beurteilen.

### GC-02 · Eine unbekannte Mischprobe untersuchen

Offenere Aufgabe mit der bereits kuratierten leichten unbekannten Probe GC-U02.

Arbeitsweg:
1. selbstständig eine GC-Methode mit min. R_s >= 1,5 entwickeln
2. Methode für die Identifikation fixieren
3. alle fünf angebotenen Referenzstandards unter unveränderten Bedingungen messen
4. passende Standards den drei Peaks zuordnen
5. die zwei nicht enthaltenen Kandidaten ausdrücklich als "kein passender Peak" erkennen

Die Aufgabe ist erst abgeschlossen, wenn nicht nur alle Probenpeaks identifiziert, sondern auch alle Referenzkandidaten geprüft wurden. Damit werden positive und negative Referenzbefunde gleichwertig als analytische Evidenz behandelt.

### Direktlinks

Die Aufgaben können auch direkt über URL-Parameter gestartet werden:

- `?task=GC01`
- `?task=GC02`

Dies ist für spätere direkte Verlinkungen aus dem Online-Begleitkurs vorgesehen.
