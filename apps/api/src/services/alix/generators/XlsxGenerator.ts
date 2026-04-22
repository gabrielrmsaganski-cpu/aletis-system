// ============================================================
// ALETIS — Alix XLSX Generator (Wave 9-GENERATE)
// Fluxo de caixa 12 meses — exceljs
// ============================================================

import ExcelJS from 'exceljs';
import type { FluxoCaixaInput, FluxoCaixaMes } from './types.js';

/**
 * Renders a Fluxo de Caixa workbook. Columns: Mês, Receita Produção,
 * Custo Operacional, Parcela Crédito, Saldo, Saldo Acumulado.
 */
export async function renderFluxoCaixaXlsxBuffer(
  input: FluxoCaixaInput,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ALETIS Consultoria Agro';
  workbook.company = 'ALETIS';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Fluxo de Caixa', {
    views: [{ state: 'frozen', ySplit: 4 }],
  });

  // Cabeçalho corporativo
  sheet.mergeCells('A1:F1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = 'ALETIS CONSULTORIA AGRO — Christian Kohler';
  titleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0B2942' },
  };
  sheet.getRow(1).height = 26;

  sheet.mergeCells('A2:F2');
  const subCell = sheet.getCell('A2');
  subCell.value = `Fluxo de Caixa — ${input.clienteNome} — ${input.periodoReferencia}`;
  subCell.font = { italic: true, color: { argb: 'FF2D6A4F' } };
  subCell.alignment = { horizontal: 'center' };

  sheet.getRow(3).values = [];

  // Header row
  const headers = [
    'Mês',
    'Receita Produção (R$)',
    'Custo Operacional (R$)',
    'Parcela Crédito (R$)',
    'Saldo (R$)',
    'Saldo Acumulado (R$)',
  ];
  const headerRow = sheet.getRow(4);
  headerRow.values = headers;
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
  headerRow.height = 22;
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0B2942' },
    };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      right: { style: 'thin', color: { argb: 'FFCCCCCC' } },
    };
  });

  sheet.columns = [
    { key: 'mes', width: 18 },
    { key: 'receita', width: 22 },
    { key: 'custo', width: 22 },
    { key: 'parcela', width: 22 },
    { key: 'saldo', width: 22 },
    { key: 'acumulado', width: 24 },
  ];

  const numFmt = '#,##0.00;[Red]-#,##0.00';
  let acumulado = 0;
  let totReceita = 0;
  let totCusto = 0;
  let totParcela = 0;
  let totSaldo = 0;

  const meses: FluxoCaixaMes[] =
    input.meses.length > 0 ? input.meses : defaultTwelveMonths();

  meses.forEach((m) => {
    const saldo = m.receitaProducao - m.custoOperacional - m.parcelaCredito;
    acumulado += saldo;
    totReceita += m.receitaProducao;
    totCusto += m.custoOperacional;
    totParcela += m.parcelaCredito;
    totSaldo += saldo;

    const row = sheet.addRow({
      mes: m.mes,
      receita: m.receitaProducao,
      custo: m.custoOperacional,
      parcela: m.parcelaCredito,
      saldo,
      acumulado,
    });

    row.eachCell((cell, col) => {
      if (col > 1) {
        cell.numFmt = numFmt;
        cell.alignment = { horizontal: 'right' };
      } else {
        cell.alignment = { horizontal: 'left' };
      }
      cell.border = {
        bottom: { style: 'dotted', color: { argb: 'FFDDDDDD' } },
      };
    });
    if (saldo < 0) {
      row.getCell('saldo').font = { color: { argb: 'FFA12020' } };
    }
  });

  const totalRow = sheet.addRow({
    mes: 'Total',
    receita: totReceita,
    custo: totCusto,
    parcela: totParcela,
    saldo: totSaldo,
    acumulado: acumulado,
  });
  totalRow.font = { bold: true };
  totalRow.eachCell((cell, col) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE8F1EC' },
    };
    if (col > 1) {
      cell.numFmt = numFmt;
      cell.alignment = { horizontal: 'right' };
    }
  });

  if (input.observacoes) {
    sheet.addRow([]);
    const obsRow = sheet.addRow([`Observações: ${input.observacoes}`]);
    sheet.mergeCells(`A${obsRow.number}:F${obsRow.number}`);
    obsRow.font = { italic: true, color: { argb: 'FF444444' } };
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer as ArrayBuffer);
}

function defaultTwelveMonths(): FluxoCaixaMes[] {
  const labels = [
    'Jan',
    'Fev',
    'Mar',
    'Abr',
    'Mai',
    'Jun',
    'Jul',
    'Ago',
    'Set',
    'Out',
    'Nov',
    'Dez',
  ];
  return labels.map((m) => ({
    mes: m,
    receitaProducao: 0,
    custoOperacional: 0,
    parcelaCredito: 0,
  }));
}
