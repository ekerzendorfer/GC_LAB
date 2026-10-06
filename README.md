# GC-LAB

**Version:** v0.1.0 – erster Single-Mode-Prototyp  
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

- Analytik-Hub/Bridge
- Runtime-Samples F1/F2/F3
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
