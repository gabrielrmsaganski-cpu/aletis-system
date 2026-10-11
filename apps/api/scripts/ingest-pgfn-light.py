#!/usr/bin/env python3
"""
Lightweight PGFN ingest for large quarterly dumps.

Outputs the same storage/prospeccao/leads-agro.json shape consumed by
PGFNSource, but keeps only a capped representative debt list per lead while
preserving aggregate totals, dates, counts and judicial flags.
"""

from __future__ import annotations

import argparse
import csv
from datetime import UTC, datetime
import json
import os
import re
from pathlib import Path
from typing import Any


AGRO_PATTERNS = [
    r"\bFAZENDA\b",
    r"\bAGROPECUARIA\b",
    r"\bAGROPEC[ÁA]RIA\b",
    r"\bAGRO\s?NEG[OÓ]CIOS?\b",
    r"\bAGRONEG[OÓ]CIOS?\b",
    r"\bAGR[IÍ]COLA\b",
    r"\bAGROINDUSTRI[AL]+\b",
    r"\bRURAL\b",
    r"\bS[IÍ]TIO\b",
    r"\bCH[ÁA]CARA\b",
    r"\bGR[AÃ]OS\b",
    r"\bPLANTA[CÇ][AÃ]O\b",
    r"\bPRODUTOR\s+RURAL\b",
    r"\bPECU[ÁA]RIA\b",
    r"\bSEMENTES\b",
    r"\bCEREALISTA\b",
    r"\bGADO\b",
    r"\bSOJA\b",
    r"\bCAFE\b",
    r"\bMILHO\b",
    r"\bALGOD[AÃ]O\b",
    r"\bEST[ÂA]NCIA\b",
    r"\bHARAS\b",
    r"\bGRANJA\b",
    r"\bLAVOURA\b",
    r"\bPLANTIO\b",
    r"\bCOLHEITA\b",
    r"\bCULTIVO\b",
    r"\bBOVINOCULTURA\b",
    r"\bSUINOCULTURA\b",
    r"\bAVICULTURA\b",
    r"\bPISCICULTURA\b",
    r"\bFRIGOR[IÍ]FICO\b",
    r"\bCANA\b",
    r"\bARROZ\b",
    r"\bFEIJ[AÃ]O\b",
    r"\bTRIGO\b",
    r"\bLARANJA\b",
    r"\bCACAU\b",
    r"\bUVA\b",
    r"\bCOOPERATIV[AO]\s+AGR",
    r"\bINSUMOS?\s+AGR",
    r"\bFERTILIZANT",
    r"\bIRRIGA[CÇ][AÃ]O\b",
    r"\bMAQUIN[ÁA]RI[AO]\s+AGR",
    r"\bSILO",
]

NEGATIVE_PATTERNS = [
    r"\bIGREJA\b",
    r"\bASSOCIA[CÇ][AÃ]O\b.*\b(MORADOR|BAIRRO|PROFESSOR|SERVIDOR)",
    r"\bCOND[OÓ]M[IÍ]NIO\b",
    r"\bLOTEAMENTO\b",
    r"\bINCORPORADORA\b",
]

AGRO_RE = [re.compile(p, re.I) for p in AGRO_PATTERNS]
NEG_RE = [re.compile(p, re.I) for p in NEGATIVE_PATTERNS]
AGRO_HINTS = (
    "FAZENDA",
    "AGRO",
    "AGRIC",
    "RURAL",
    "SITIO",
    "SÍTIO",
    "CHAC",
    "GRÃO",
    "GRAO",
    "PLANT",
    "PECU",
    "SEMENTE",
    "CEREAL",
    "GADO",
    "SOJA",
    "CAFE",
    "CAFÉ",
    "MILHO",
    "ALGOD",
    "ESTANC",
    "ESTÂNC",
    "HARAS",
    "GRANJA",
    "LAVOUR",
    "COLHEITA",
    "BOVINO",
    "SUINO",
    "AVIC",
    "PISCIC",
    "FRIGOR",
    "CANA",
    "ARROZ",
    "FEIJA",
    "FEIJÃ",
    "TRIGO",
    "LARANJA",
    "CACAU",
    "UVA",
    "COOPERATIV",
    "INSUM",
    "FERTILIZ",
    "IRRIG",
    "MAQUIN",
    "SILO",
)


def parse_money(value: str | None) -> float:
    if not value:
        return 0.0
    try:
        return float(value.strip().replace(".", "").replace(",", "."))
    except ValueError:
        return 0.0


def clean_doc(value: str | None) -> str:
    return re.sub(r"\D", "", value or "")


def kind_for(path: Path) -> str:
    name = path.name.upper()
    if "PREV" in name:
        return "PREV"
    if "FGTS" in name:
        return "FGTS"
    return "NAOPREV"


def signals_for(name: str) -> list[str]:
    if not name:
        return []
    upper = name.upper()
    if not any(h in upper for h in AGRO_HINTS):
        return []
    if any(p.search(upper) for p in NEG_RE):
        return []
    found: list[str] = []
    for pat in AGRO_RE:
        m = pat.search(upper)
        if m:
            token = m.group(0).upper()
            if token not in found:
                found.append(token)
    return found


def debt_score(debt: dict[str, Any]) -> float:
    return (1_000_000_000 if debt.get("ajuizado") else 0) + float(debt.get("valor") or 0)


def push_debt(lead: dict[str, Any], debt: dict[str, Any], max_debts: int) -> None:
    debts = lead["debts"]
    if len(debts) < max_debts:
        debts.append(debt)
        return
    weakest_idx = min(range(len(debts)), key=lambda i: debt_score(debts[i]))
    if debt_score(debt) > debt_score(debts[weakest_idx]):
        debts[weakest_idx] = debt


def ingest_file(path: Path, acc: dict[str, dict[str, Any]], stats: dict[str, float], max_debts: int) -> None:
    fonte = kind_for(path)
    with path.open("r", encoding="latin1", newline="") as fh:
        reader = csv.DictReader(fh, delimiter=";")
        for row in reader:
            stats["rowsRead"] += 1
            nome = (row.get("NOME_DEVEDOR") or "").strip()
            signals = signals_for(nome)
            if not signals:
                continue
            stats["rowsAgro"] += 1

            doc_raw = row.get("CPF_CNPJ") or ""
            doc = clean_doc(doc_raw)
            if not doc:
                continue

            valor = parse_money(row.get("VALOR_CONSOLIDADO"))
            stats["totalDebt"] += valor
            data = row.get("DATA_INSCRICAO") or ""
            ajuizado = (row.get("INDICADOR_AJUIZADO") or "").strip().upper() == "SIM"
            debt = {
                "fonte": fonte,
                "inscricao": row.get("NUMERO_INSCRICAO") or "",
                "tipoSituacao": row.get("TIPO_SITUACAO_INSCRICAO") or "",
                "situacao": row.get("SITUACAO_INSCRICAO") or "",
                "tipoCredito": row.get("TIPO_CREDITO") or row.get("RECEITA_PRINCIPAL") or "",
                "dataInscricao": data,
                "ajuizado": ajuizado,
                "valor": valor,
            }

            lead = acc.get(doc)
            if lead:
                push_debt(lead, debt, max_debts)
                lead["totalDivida"] += valor
                lead["qtdInscricoes"] += 1
                lead["temAjuizada"] = bool(lead["temAjuizada"] or ajuizado)
                if data and (not lead["primeiraInscricao"] or data < lead["primeiraInscricao"]):
                    lead["primeiraInscricao"] = data
                if data and (not lead["ultimaInscricao"] or data > lead["ultimaInscricao"]):
                    lead["ultimaInscricao"] = data
                for s in signals:
                    if s not in lead["agroSignals"]:
                        lead["agroSignals"].append(s)
            else:
                tipo_raw = (row.get("TIPO_PESSOA") or "").lower()
                lead = {
                    "cpfCnpj": doc_raw,
                    "cpfCnpjClean": doc,
                    "tipoPessoa": "PJ" if "jur" in tipo_raw else "PF",
                    "nome": nome,
                    "uf": row.get("UF_DEVEDOR") or "",
                    "agroSignals": signals,
                    "debts": [debt],
                    "totalDivida": valor,
                    "qtdInscricoes": 1,
                    "primeiraInscricao": data,
                    "ultimaInscricao": data,
                    "temAjuizada": ajuizado,
                }
                acc[doc] = lead
                stats["leads"] += 1


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", action="append", default=[])
    parser.add_argument("--output", default="storage/prospeccao")
    parser.add_argument("--max-debts", type=int, default=int(os.getenv("PGFN_MAX_DEBTS_PER_LEAD", "25")))
    args = parser.parse_args()

    inputs = [Path(p) for p in (args.input or ["/tmp/pgfn/extracted"])]
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)

    acc: dict[str, dict[str, Any]] = {}
    stats: dict[str, float] = {"rowsRead": 0, "rowsAgro": 0, "leads": 0, "totalDebt": 0.0}

    files: list[Path] = []
    for input_dir in inputs:
        files.extend(sorted(input_dir.glob("*.csv")))
    print(f"[pgfn-light] {len(files)} CSV files", flush=True)

    for file in files:
        print(f"[pgfn-light] ingesting {file.name}...", flush=True)
        ingest_file(file, acc, stats, max(1, args.max_debts))
        print(
            f"  rows={int(stats['rowsRead']):,} agro={int(stats['rowsAgro']):,} leads={int(stats['leads']):,}",
            flush=True,
        )

    leads = sorted(acc.values(), key=lambda x: x["totalDivida"], reverse=True)
    manifest = {
        "generatedAt": datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        "source": "PGFN Dívida Ativa — dadosabertos.pgfn.gov.br — 2026_trimestre_01",
        "stats": {**stats, "totalDebtBRL": stats["totalDebt"], "maxDebtsPerLead": args.max_debts},
        "leadsCount": len(leads),
    }

    with (output / "leads-agro.json").open("w", encoding="utf-8") as fh:
        json.dump({"manifest": manifest, "leads": leads}, fh, ensure_ascii=False, separators=(",", ":"))

    by_uf: dict[str, dict[str, float]] = {}
    for lead in leads:
        uf = lead.get("uf") or "ND"
        item = by_uf.setdefault(uf, {"count": 0, "debt": 0.0})
        item["count"] += 1
        item["debt"] += float(lead.get("totalDivida") or 0)

    with (output / "leads-agro-summary.json").open("w", encoding="utf-8") as fh:
        json.dump({"manifest": manifest, "byUf": by_uf}, fh, ensure_ascii=False, indent=2)

    print(f"[pgfn-light] {len(leads):,} leads written to {output / 'leads-agro.json'}", flush=True)
    print(f"[pgfn-light] total debt BRL {stats['totalDebt']:,.2f}", flush=True)


if __name__ == "__main__":
    main()
