# GC-LAB v0.1 – Fachliche und technische Spezifikation

**Projekt:** CHEMIE mit KI – Digitales Analytiklabor  
**Status:** Arbeits-Spezifikation v0.1  
**Zielplattform:** Browser / GitHub Pages  
**Architektur:** Single-Mode vollständig eigenständig; optionaler Hub-Modus über CHEMIE_ANALYTIK_BRIDGE

## 1. Didaktische Rolle

GC-LAB soll zunächst beantworten:

> Wie viele chromatographisch unterscheidbare flüchtige Komponenten enthält eine Probe, und ist die gewählte Methode gut genug, um sie analytisch brauchbar zu trennen?

Die GC-App identifiziert unbekannte Stoffe **nicht automatisch**. Für unbekannte Hub-Proben gilt verbindlich:

`GC → Peaks P1/P2/... → Strukturaufklärung → Stoffhypothese → gezielter Referenzstandard → Bestätigung`

Referenzstandards dienen im unbekannten Hub-Fall erst zur Überprüfung einer begründeten Hypothese. Im unabhängigen Single-Mode dürfen Aufgaben mit bekannten Kandidaten, Referenzvergleich und Aufstockung/Beaufschlagung vorgesehen werden.

## 2. Betriebsarten

### 2.1 Single-Mode

Direkter Aufruf von GC-LAB ohne Bridge-Parameter. Vollständig unabhängig vom Analytik-Hub.

V0.1 enthält zwei Bedienniveaus:

- **Grundmodus:** Säulentyp und Ofentemperatur veränderbar; Säulenlänge 30 m und Trägergasstrom mittel fixiert.
- **Methodenentwicklung:** Säulentyp, Säulenlänge, Temperatur und Trägergasstrom veränderbar.

### 2.2 Hub-Mode (ab v0.1.1)

Aufruf mit `?bridge=1&run=RUN_...`.

Für VCÖ-01 werden Runtime-Samples `VCOE01_F1`, `VCOE01_F2`, `VCOE01_F3` übernommen. Die interne Zusammensetzung aus der zuvor akzeptierten Destillation bestimmt die relativen Peakflächen. Stoffidentitäten bleiben im SchülerInnen-UI verborgen.

## 3. Methodenparameter

Vier Einflussgrößen bleiben erhalten, aber nur die Temperatur ist fein abgestuft.

| Parameter | Optionen in v0.1 |
|---|---|
| Stationäre Phase | unpolar / polar |
| Kapillarsäulenlänge | 15 / 30 / 60 m |
| Ofentemperatur | 70 bis 140 °C in 10-°C-Schritten |
| Trägergasstrom | niedrig 0,8 / mittel 1,2 / hoch 1,8 mL min⁻¹ |

Didaktische Hinweise im UI erklären die erwarteten Folgen jeder Veränderung.

### Wirkung der Parameter

- **Temperatur erhöhen:** kürzere Retentionszeiten; häufig schlechtere Trennung.
- **Säule verlängern:** höhere Effizienz/Auflösung; längere Analysezeit; näherungsweise `N ∝ L`, daher Auflösung ungefähr `∝ √L`.
- **Trägergasstrom:** mittlerer Bereich als Effizienzoptimum; zu niedriger oder zu hoher Strom verschlechtert die Effizienz, hohe Ströme verkürzen die Laufzeit.
- **Stationäre Phase:** verändert Selektivität und relative Retention; Retentionszeit ist daher keine reine Stoffkonstante und nicht nur vom Siedepunkt abhängig.

## 4. Säulentypen

### COLUMN_NP

Schwach/unpolar, polysiloxanartig. Flüchtigkeit/Siedepunkt haben starken Einfluss.

### COLUMN_POLAR

Polar, PEG-artig. Polare Analyten werden relativ stärker zurückgehalten.

Keine kommerziellen Markenbezeichnungen.

## 5. Stoffdatenmodell

GC-LAB verwendet von Beginn an die CORE-IDs direkt. Keine app-spezifische Mapping-ID als Primärschlüssel.

Grundbestand v0.1:

- ACETONE
- METHANOL
- ETHANOL
- ETHYL_ACETATE
- HEXANE
- CYCLOHEXANE
- TOLUENE
- BUTAN_1_OL

Jeder Stoff enthält kuratierte GC-Parameter je Säulentyp sowie einen relativen Detektor-Response-Faktor.

Beispiel:

```json
{
  "id": "ETHYL_ACETATE",
  "name_de": "Ethylacetat",
  "boiling_point_c": 77.1,
  "detector_response": 1.0,
  "gc": {
    "COLUMN_NP": {"k_ref": 0.85, "temp_coeff": 0.025},
    "COLUMN_POLAR": {"k_ref": 1.00, "temp_coeff": 0.027}
  }
}
```

Die Parameter sind **didaktisch kuratierte Modellparameter** und keine universellen Vorhersagewerte.

## 6. Retentionsmodell

Referenztemperatur `T_ref = 100 °C`.

Retentionsfaktor:

`k(T) = k_ref · exp[a · (T_ref − T)]`

Totzeit:

`t_M = t_M,ref · (L / 30 m) · (1.2 mL min⁻¹ / flow)`

Retentionszeit:

`t_R = t_M · (1 + k)`

Damit führt höhere Temperatur zu kleinerem `k` und damit kürzeren Retentionszeiten.

## 7. Säuleneffizienz und Peakbreite

Effektive Bodenzahl:

`N = N_ref · (L / 30 m) · f_flow · f_column`

Für den Gasstrom wird eine diskrete Effizienzfunktion verwendet:

- niedrig: 0,82
- mittel: 1,00
- hoch: 0,78

Die Standardabweichung des Gaußpeaks wird modelliert als:

`σ = t_R / √N`

Basisbreite näherungsweise:

`w = 4σ`

## 8. Peakmodell

Das Chromatogramm ist die Summe echter Gaußfunktionen:

`y(t) = Σ A_i/(σ_i√(2π)) · exp[-(t−t_R,i)²/(2σ_i²)]`

Dadurch entstehen ohne künstliche Fallunterscheidung:

- vollständig überlagerte Peaks,
- Schultern,
- teilweise getrennte Peaks,
- basisliniengetrennte Peaks.

## 9. Auflösung

Für zwei benachbarte Peaks:

`R_s = 2(t_R,2 − t_R,1) / (w_1 + w_2)`

Rückmeldung:

| R_s | Bewertung |
|---:|---|
| < 1,0 | unzureichend getrennt |
| 1,0 bis < 1,5 | teilweise getrennt – Methode optimieren |
| ≥ 1,5 | analytisch brauchbar – Übernahme möglich |

Nur Läufe mit `R_s ≥ 1,5` für alle benachbarten relevanten Peaks dürfen im Hub als offizielles Result übernommen werden. Schlechte Läufe bleiben lediglich in der GC-Versuchshistorie.

Sehr große Auflösung bei unnötig langer Laufzeit erhält den Zusatzhinweis, dass die Methode möglicherweise ineffizient ist.

## 10. Detektor und Peakflächen

V0.1 verwendet einen vereinfachten FID-artigen Detektor.

`Peakfläche ∝ Stoffanteil × relativer Response-Faktor`

Daher ist `area %` **nicht automatisch Stoffmengen-%**. Quantitative GC-Kalibration ist nicht Bestandteil von v0.1.

Fraktionsvolumen aus der Destillation beeinflusst die Peakfläche nicht direkt, da für jede GC-Messung eine standardisierte kleine Probenmenge injiziert wird.

Virtuelle relative Nachweisgrenze für den Start: ca. 1 % relative Responsefläche.

## 11. Single-Mode v0.1

### Freies Labor

Bekannte kuratierte Probe auswählen, Methode verändern, Chromatogramm und Messwerte vergleichen.

### Methodenentwicklung

Ziel: alle relevanten Peaks mit `R_s ≥ 1,5` trennen.

Run-Historie enthält:

- Säule
- Länge
- Temperatur
- Gasstrom
- Laufzeit
- minimale Auflösung
- Bewertung

### Späterer Single-Mode-Ausbau

- Referenzvergleich bei bekannten Kandidaten
- Aufstockung/Beaufschlagung zur gezielten Peakzuordnung
- Aufgabenmodus

## 12. Hub-Mode und VCÖ-01

Hub-Aufruf:

`GC_LAB/?bridge=1&run=RUN_...`

Der Run übergibt ein Runtime-Sample, z. B. `VCOE01_F2`, inklusive interner Zusammensetzung. Im UI erscheint ausschließlich „Unbekannte Destillationsfraktion F2“.

Erwartetes didaktisches Verhalten:

- F1: großer P1 + kleiner P2
- F2: zwei deutlich sichtbare Peaks
- F3: kleiner P1 + großer P2

Die Peakflächen hängen direkt von der zuvor erzielten Destillationsqualität ab.

## 13. RESULT-Struktur

Öffentlicher RESULT-Teil:

```json
{
  "analysis_type": "GC",
  "measurement": {
    "column": "COLUMN_NP",
    "column_length_m": 30,
    "temperature_c": 100,
    "flow_ml_min": 1.2,
    "peaks": [
      {
        "peak_id": "P1",
        "retention_time_min": 2.43,
        "area": 1842,
        "area_percent": 52.1,
        "width_min": 0.18
      }
    ],
    "minimum_resolution": 1.72
  },
  "student_interpretation": {
    "P1": {"identity_status": "unknown"}
  }
}
```

Interner Payload für spätere Strukturaufklärung:

```json
{
  "internal_payload": {
    "peak_map": {
      "P1": "ETHYL_ACETATE",
      "P2": "BUTAN_1_OL"
    }
  }
}
```

Die Stoff-ID wird nicht in der URL und nicht im normalen SchülerInnen-UI transportiert.

## 14. Strukturaufklärung und Standards

Verbindliche Leitlogik für unbekannte Hub-Proben:

1. GC liefert P1/P2/... ohne Stoffnamen.
2. Ein ausreichend getrennter Peak kann an das Strukturaufklärungs-Lab übergeben werden.
3. MS/IR/¹H-NMR führen zu einer Strukturhypothese.
4. Erst danach wird ein gezielter GC-Referenzstandard bzw. eine gezielte Aufstockung angeboten.
5. Passende Retention/Aufstockung bestätigt die Hypothese zusätzlich.

## 15. Nicht Bestandteil von v0.1

- Temperaturprogramm
- quantitative GC-Kalibration
- GC-MS als eingebautes Modul
- Peak-Deconvolution
- Derivatisierung
- universelle Retentionsvorhersage
- sehr große Stoffbibliothek

## 16. Repo-Struktur

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

Keine Build-Tools, kein Backend, keine Installation.

## 17. Entwicklungsfolge

1. v0.1.0 – Single-Mode, kuratierte Stoffdaten, isotherme GC-Engine, Chromatogramm, Rs, Run-Historie.
2. v0.1.1 – Bridge/Hub-Modus und Runtime-Samples F1/F2/F3.
3. v0.1.2 – Hub-Result, Akzeptanzschwelle und Methodenfeedback.
4. v0.2 – Referenzstandards, Aufstockung und Aufgabenmodus.
5. v0.3 – Peak → Strukturaufklärungs-Lab.

## 18. Designgrundsätze

- Single-Mode bleibt vollständig unabhängig.
- Keine automatische Stoffidentifikation aus Retentionszeit.
- Methodenparameter sind begrenzt und didaktisch erklärbar.
- Nur analytisch brauchbare Läufe werden im Hub akzeptiert.
- Die App modelliert Zusammenhänge und Entscheidungen; sie erhebt keinen Anspruch auf universelle reale Retentionsvorhersage.
- Datenmodell und IDs sind von Beginn an CORE-/Bridge-kompatibel.


## Nachtrag v0.2.0 – gezielte Identitätsbestätigung

Nach einer spektroskopisch gestützten Hypothese kann GC-LAB im Hub-Modus mit mode = targeted_confirmation gestartet werden.

Beweisschritte:
1. ursprüngliche GC-Methode unverändert übernehmen und sperren,
2. gezielten Referenzstandard messen und Retentionszeit vergleichen,
3. Ausgangsprobe mit demselben Standard aufstocken,
4. bestätigen, dass derselbe Peak wächst und kein neuer Peak entsteht,
5. erst dann GC_CONFIRMATION mit identity_status = confirmed an den Hub zurückgeben.

Die Aufstockung verwendet eine kuratierte relative Zusatzmenge. Für den Nachweis des Peakwachstums wird die absolute modellierte Detektorantwort verwendet; dadurch bleibt der Test auch bei einem 100-%-Einzelpeak aussagekräftig.

Kein Blind-Screening mehrerer Standards: Der Standard wird ausschließlich aus der zuvor spektroskopisch begründeten Strukturhypothese gewählt.
