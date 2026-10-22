# Al Sajaa Resident Service Guide

A part of the Al Sajaa 3D twin. Click a civic building on the map to open a step-by-step guide for that service.

## Run

```
npm install
npm run dev      # then open http://localhost:5179/#twin
```

## What it does

- **Service guides** (click a place): Tasheel Centre, Al Sajaa Hospital (medical centre), Al Sajaa Court, Sharjah Police Station.
  Each guide covers what the service is, a one-question-at-a-time eligibility check, a document checklist
  the resident ticks, draft answers to review, and the official route to verify before going.
- **48-hour outlook** (press +48H): simulated issues and who they affect.
- **Emergency bar**: 999 police, 998 ambulance, always visible.

## Simulated data (not real)

- The 48-hour outlook: every item in `src/data/forecast48.ts`.
- The sensor readings and the incident story: `src/data/incident.ts` and the simulation.
- The Court and Police station buildings: added to the expansion map for the demo (`scripts/build-expansion.py`).
  Their positions are not real.

## Official sources to check before you go

These were not verified against live pages while building this demo. Confirm each one on the official site.

- Tasheel typing and government transactions: the official Tasheel or Sharjah government services site.
- Medical centre booking: Al Sajaa Hospital's official page.
- Court: the Sharjah courts official website and help desk.
- Police non-emergency reports: the official Sharjah Police website.
- Emergency: 999 (police), 998 (ambulance).

## Not included

Heat-stress layer, the "what's under my street" explainer, community reporting, simple mode, Arabic labels and the scripted demo update.
