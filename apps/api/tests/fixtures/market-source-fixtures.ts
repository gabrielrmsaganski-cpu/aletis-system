/** Layouts mínimos das páginas públicas observadas em 06/09/2026; valores são cenários de teste. */
export const CONAB_HEADER = 'produto;classificao_produto;id_produto;uf;regiao;ano;mes;data_inicial_final_semana;semana;dsc_nivel_comercializacao;valor_produto_kg'
export const CONAB_ROWS = [
  'SOJA;EM GRÃOS;4744;PR;SUL;2026;8;17-08-2026 - 21-08-2026;3;PREÇO RECEBIDO P/ PR;2,00',
  'SOJA;EM GRÃOS;4744;MT;CENTRO-OESTE;2026;8;17-08-2026 - 21-08-2026;3;PREÇO RECEBIDO P/ PR;1,00',
  'SOJA;EM GRÃOS;4744;PR;SUL;2026;8;24-08-2026 - 28-08-2026;4;PREÇO RECEBIDO P/ PR;2,20',
  'SOJA;EM GRÃOS;4744;MT;CENTRO-OESTE;2026;8;24-08-2026 - 28-08-2026;4;PREÇO RECEBIDO P/ PR;1,10',
  'MILHO;EM GRÃOS;4742;PR;SUL;2026;8;24-08-2026 - 28-08-2026;4;PREÇO RECEBIDO P/ PR;1,2',
  'CAFE;ARÁBICA TIPO 7;11232;ES;SUDESTE;2026;8;24-08-2026 - 28-08-2026;4;ATACADO;22,12',
  'ALGODAO EM PLUMA;TIPO BÁSICO - SLM 41;11182;MT;CENTRO-OESTE;2026;8;24-08-2026 - 28-08-2026;4;PREÇO RECEBIDO P/ PR;9,0',
  'TRIGO;MELHORADOR, PH 78, T;11152;SP;SUDESTE;2026;8;24-08-2026 - 28-08-2026;4;PREÇO RECEBIDO P/ PR;1,45',
  'ARROZ;LONGO FINO EM CASCA;4685;TO;NORTE;2026;8;24-08-2026 - 28-08-2026;4;PREÇO RECEBIDO P/ PR;1,7',
  'FEIJAO;COMUM CORES TIPO 1;8779;TO;NORTE;2026;8;24-08-2026 - 28-08-2026;4;PREÇO RECEBIDO P/ PR;6,5',
  'FEIJAO;CAUPI TIPO 1;9000;TO;NORTE;2026;8;24-08-2026 - 28-08-2026;4;PREÇO RECEBIDO P/ PR;99,00',
  'SOJA;EM GRÃOS;4744;PR;SUL;2026;8;24-08-2026 - 28-08-2026;4;ATACADO;100,00',
]

export const NA_SOJA = `<!doctype html><title>Cotação e Preço da Soja - Notícias Agrícolas</title>
<div class="cotacao">
  <div class="info"><div class="text-infos"><div class="title-descricao"><h2>Indicador da Soja ESALQ/B3 - Paranaguá</h2></div><div class="fonte">Fonte: Cepea/Esalq</div></div></div>
  <div class="table-content"><table class="cot-fisicas"><thead><tr><th>Data</th><th>Valor R$/ Saca de 60 kg</th><th>Variação (%)</th></tr></thead><tbody><tr><td>04/09/2026</td><td>160,87</td><td>+0,46</td></tr></tbody></table></div>
</div>
<div class="cotacao">
  <div class="info"><div class="text-infos"><div class="title-descricao"><h2>Indicador da Soja Cepea/Esalq - Paraná</h2></div><div class="fonte">Fonte: Cepea/Esalq</div></div></div>
  <div class="table-content"><table class="cot-fisicas"><thead><tr><th>Data</th><th>Valor R$/ Saca de 60 kg</th><th>Variação (%)</th></tr></thead><tbody><tr><td>04/09/2026</td><td>152,10</td><td>+0,28</td></tr></tbody><tfoot><tr><td>Atualizado em: 04/09/2026</td></tr></tfoot></table></div>
</div>`

export const NA_MILHO = `<div class="cotacao">
  <div class="info"><div class="text-infos"><div class="title-descricao"><h2>Indicador do Milho Esalq/B3</h2></div><div class="fonte">Fonte: Cepea</div></div></div>
  <div class="table-content"><table class="cot-fisicas"><thead><tr><th>Data</th><th>Valor (R$/sc 60 kg)</th><th>Variação (%)</th></tr></thead><tbody><tr><td>04/09/2026</td><td>70,93</td><td>-0,18</td></tr></tbody></table></div>
</div>`

export const NA_ALGODAO = `<div class="cotacao">
  <div class="info"><div class="text-infos"><div class="title-descricao"><h2>Algodão - Indicador Cepea/Esalq</h2></div><div class="fonte">Fonte: Cepea/Esalq</div></div></div>
  <div class="table-content"><table class="cot-fisicas"><thead><tr><th>Data</th><th>Valor (8 dias) Cent/R$/lb</th><th>Variação Diária (%)</th></tr></thead><tbody><tr><td>04/09/2026</td><td>439,98</td><td>+0,44</td></tr></tbody></table></div>
</div>`

export const CEPEA_SOJA = `<!doctype html><title>Soja - CEPEA-Esalq/USP</title>
<div class="imagenet-col-12">
  <div>INDICADOR DA SOJA CEPEA/ESALQ - PARANAGUÁ</div>
  <div class="imagenet-col-8"><div class="imagenet-table-responsiva"><table id="imagenet-indicador1" class="imagenet-col-12"><thead><tr><th></th><th>Valor R$*</th><th>Var./Dia</th><th>Var./Mês</th><th>Valor US$*</th></tr></thead><tbody><tr><td>04/09/2026</td><td>160,87</td><td>0,46%</td><td>0,90%</td><td>31,36</td></tr></tbody></table></div><p>Fonte: CEPEA</p></div>
</div><div>* Nota 1: Reais por saca de 60 kg.</div>
<div class="imagenet-col-12">
  <div>INDICADOR DA SOJA CEPEA/ESALQ - PARANÁ</div>
  <div class="imagenet-col-8"><div class="imagenet-table-responsiva"><table id="imagenet-indicador2" class="imagenet-col-12"><thead><tr><th></th><th>Valor R$*</th><th>Var./Dia</th><th>Var./Mês</th><th>Valor US$*</th></tr></thead><tbody><tr><td>03/09/2026</td><td>151,68</td><td>-0,61%</td><td>0,24%</td><td>29,72</td></tr><tr><td>04/09/2026</td><td>152,10</td><td>0,28%</td><td>0,52%</td><td>29,65</td></tr></tbody></table></div><p>Fonte: CEPEA</p></div>
  <div>Nota 1: Reais por saca de 60 kg.</div>
</div>`

export const CEPEA_BOI = `<!doctype html><title>Boi gordo - CEPEA-Esalq/USP</title>
<div class="imagenet-col-12">
  <div>INDICADOR DO BOI GORDO CEPEA/ESALQ</div>
  <div class="imagenet-col-8"><div class="imagenet-table-responsiva"><table id="imagenet-indicador1" class="imagenet-col-12"><thead><tr><th></th><th>Valor R$*</th><th>Var./Dia</th><th>Var./Mês</th><th>Valor US$*</th></tr></thead><tbody><tr><td>04/09/2026</td><td>347,70</td><td>0,03%</td><td>0,96%</td><td>67,78</td></tr></tbody></table></div><p>Fonte: CEPEA</p></div>
</div><div>Nota 1: Valor à vista por arroba de 15 kg, sem Funrural (preço “livre”).</div>`

export const CEPEA_CAFE = `<!doctype html><title>Café - CEPEA-Esalq/USP</title>
<div class="imagenet-col-12">
  <div>INDICADOR DO CAFÉ ARÁBICA CEPEA/ESALQ</div>
  <div class="imagenet-col-8"><div class="imagenet-table-responsiva"><table id="imagenet-indicador1" class="imagenet-col-12"><thead><tr><th></th><th>Valor R$*</th><th>Var./Dia</th><th>Var./Mês</th><th>Valor US$*</th></tr></thead><tbody><tr><td>04/09/2026</td><td>1.659,93</td><td>-0,74%</td><td>-2,21%</td><td>323,73</td></tr></tbody></table></div><p>Fonte: CEPEA</p></div>
</div><div>* Nota: Reais por saca de 60 kg líquido, bica corrida, tipo 6, bebida dura para melhor, valor descontado o Prazo de Pagamento pela taxa CDI, posto na cidade de São Paulo.</div>`
