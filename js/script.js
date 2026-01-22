
// Heurística + IA (OpenAI via endpoint) para comparar currículo x vaga.

const CONFIG = {
  minChars: 800,
  maxChars: 8000,
  longLineLimit: 150,
  maxTags: 22,
  maxReqItems: 12,
  aiTimeoutMs: 120000,
  // Pesos da heurística (somam 1.0)
  weights: {
    matchAllTerms: 0.28,
    matchRequired: 0.26,
    impactMetrics: 0.12,
    structure: 0.10,
    clarity: 0.10,
    size: 0.06,
    language: 0.08
  }
};

const STOPWORDS = new Set([
  'de','da','do','das','dos','e','a','o','os','as','para','por','em','no','na','nos','nas','com','sem',
  'um','uma','uns','umas','que','se','ser','ter','como','sobre','pela','pelas','pelos','ou','ao','à','às',
  'até','entre','também','mais','menos','muito','pouco','sua','seu','suas','seus','minha','meu','meus','minhas',
  'é','são','foi','será','tem','terá','terão','vaga','empresa','responsabilidades','atividades','requisitos',
  'necessário','necessária','necessários','necessárias','desejável','diferencial','perfil','área','time'
]);

const $ = (id) => document.getElementById(id);

const resumeEl = $('resume');
const jobEl = $('job');
const keywordsEl = $('keywords');
const charCountEl = $('charCount');
const resumeFileEl = $('resumeFile');
const resumeFileInfoEl = $('resumeFileInfo');
const jobUrlEl = $('jobUrl');
const aiEndpointEl = $('aiEndpoint');

const btnFetchJob = $('btnFetchJob');
const btnAiTest = $('btnAiTest');

const btnEvaluate = $('btnEvaluate');
const btnEvaluateAi = $('btnEvaluateAi');
const btnExample = $('btnExample');
const btnClear = $('btnClear');
const btnNew = $('btnNew');
const btnCopy = $('btnCopy');
const btnCopyAi = $('btnCopyAi');

const formSec = $('form');
const resultsSec = $('results');
const loadingEl = $('loading');

const scoreEl = $('score');
const scoreLabelEl = $('scoreLabel');
const ringFg = $('ringFg');
const summaryTextEl = $('summaryText');

const statCharsEl = $('statChars');
const statJobCharsEl = $('statJobChars');
const statMatchEl = $('statMatch');

const detailsEl = $('details');
const commentsEl = $('comments');
const strengthsEl = $('strengths');
const weaknessesEl = $('weaknesses');
const criticalMissingEl = $('criticalMissing');
const niceMissingEl = $('niceMissing');

const aiReportEl = $('aiReport');

const EXAMPLE_RESUME = `JOAO DA SILVA
Desenvolvedor Full Stack | Sao Paulo, SP
Email: joao.silva@email.com | LinkedIn: linkedin.com/in/joaosilva | GitHub: github.com/joaosilva

RESUMO PROFISSIONAL
Desenvolvedor com 5 anos de experiencia em aplicacoes web. Especializado em Python, Django, FastAPI, React e PostgreSQL.

EXPERIENCIA PROFISSIONAL
- Desenvolvedor Full Stack Senior (2021-Atual): APIs REST, React, Django, Docker. Reduzi tempo de deploy em 35% com CI/CD.
- Desenvolvedor Backend (2019-2020): FastAPI, testes automatizados, observabilidade. Aumentei cobertura de testes de 20% para 65%.

FORMACAO
Bacharelado em Ciencia da Computacao

HABILIDADES
Python, Django, FastAPI, React, PostgreSQL, Docker, Git, CI/CD
INGLES: intermediario
`;

const EXAMPLE_JOB = `Desenvolvedor Full Stack Pleno

Responsabilidades:
- Desenvolver e manter aplicacoes web em ambiente agil
- Colaborar com times de produto e design
- Escrever codigo limpo, testavel e bem documentado

Requisitos obrigatorios:
- Experiencia com Python e frameworks web (Django ou FastAPI)
- Experiencia com desenvolvimento front-end (React ou similar)
- Conhecimentos em bancos de dados relacionais (PostgreSQL ou MySQL)
- Git e praticas de versionamento
- Inglês intermediario

Diferenciais:
- Experiencia com Docker e CI/CD
- Conhecimento em arquitetura de microsservicos
- Experiencia com observabilidade (logs, metricas, tracing)
`;

function showLoading(show, text){
  loadingEl.style.display = show ? 'flex' : 'none';
  if (text) loadingEl.querySelector('.loading-text').textContent = text;
}

function normalize(s){
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9ç\s]/g, ' ');
}

function splitKeywords(s){
  if (!s) return [];
  return s.split(',').map(x => x.trim()).filter(Boolean);
}

function tokenizeImportant(textNorm){
  const words = textNorm.split(/\s+/).filter(Boolean);
  const set = new Set();
  for (const w of words){
    if (w.length < 4) continue;
    if (STOPWORDS.has(w)) continue;
    set.add(w);
  }
  return Array.from(set);
}

function setRing(scorePct){
  const circumference = 2 * Math.PI * 74;
  ringFg.style.strokeDasharray = String(circumference);
  ringFg.style.strokeDashoffset = String(circumference * (1 - scorePct/100));
}

function animateNumber(el, start, end, ms){
  const t0 = performance.now();
  function tick(t){
    const p = Math.min(1, (t - t0) / ms);
    const eased = 1 - Math.pow(1 - p, 4);
    const val = Math.round(start + (end - start) * eased);
    el.textContent = String(val);
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function overallLabel(scorePct){
  if (scorePct >= 85) return 'Excelente aderencia';
  if (scorePct >= 70) return 'Boa aderencia';
  if (scorePct >= 50) return 'Aderencia media';
  return 'Baixa aderencia';
}

function renderDetails(details){
  detailsEl.innerHTML = '';
  for (const item of details){
    const div = document.createElement('div');
    div.className = 'detail';
    div.innerHTML = `
      <div class="detail-top">
        <div class="detail-name">${item.name}</div>
        <div class="detail-score">${item.pct}%</div>
      </div>
      <div class="bar"><div style="width:${item.pct}%"></div></div>
    `;
    detailsEl.appendChild(div);
  }
}

function renderComments(comments){
  commentsEl.innerHTML = '';
  for (const c of comments){
    const li = document.createElement('li');
    li.textContent = c;
    commentsEl.appendChild(li);
  }
}

function renderTags(container, tags){
  container.innerHTML = '';
  const list = (tags || []).filter(Boolean);
  if (!list.length){
    const span = document.createElement('span');
    span.className = 'tag';
    span.textContent = 'Nada especifico encontrado.';
    container.appendChild(span);
    return;
  }
  for (const t of list){
    const span = document.createElement('span');
    span.className = 'tag';
    span.textContent = t;
    container.appendChild(span);
  }
}

function scoreSize(len){
  if (len <= 0) return 0;
  if (len < CONFIG.minChars) return Math.max(0.2, len / CONFIG.minChars);
  if (len > CONFIG.maxChars) return Math.max(0.25, 1 - (len - CONFIG.maxChars) / CONFIG.maxChars);
  return 1;
}

function scoreClarity(text){
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return 0;
  const longLines = lines.filter(l => l.length > CONFIG.longLineLimit).length;
  const linePenalty = longLines / lines.length;

  const sentences = text.replace(/\r?\n/g, ' ').split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
  let avgSentenceLen = 0;
  if (sentences.length) avgSentenceLen = sentences.reduce((a,s)=>a+s.length,0) / sentences.length;
  const sentencePenalty = Math.min(1, Math.max(0, (avgSentenceLen - 140) / 220));

  const clarity = 1 - (0.65 * linePenalty + 0.35 * sentencePenalty);
  return Math.max(0.25, Math.min(1, clarity));
}

function scoreSections(textNorm){
  const families = [
    ['experiencia','experiencia profissional'],
    ['formacao','educacao'],
    ['habilidades','skills','competencias'],
    ['projetos','portfolio']
  ];
  let found = 0;
  const missing = [];
  for (const fam of families){
    const has = fam.some(t => textNorm.includes(t));
    if (has) found++;
    else missing.push(fam[0]);
  }
  return { score: found / families.length, missing };
}

function detectImpactMetrics(text){
  const t = text || '';
  const numbers = (t.match(/\b\d{1,3}(?:[\.,]\d{1,3})?\b/g) || []).length;
  const perc = (t.match(/\b\d{1,3}\s?%/g) || []).length;
  const money = (t.match(/\b(r\$|us\$|€|£)\s?\d+/gi) || []).length;
  const kpis = (t.match(/\b(sla|kpi|okrs?|okr|nps|roi|cvr|cac|ltv|maus?|daus?)\b/gi) || []).length;

  const raw = numbers + 2*perc + 2*money + 2*kpis;
  const score = Math.max(0, Math.min(1, raw / 14));
  return { score, numbers, perc, money, kpis };
}

function detectLanguageRequirement(jobNorm){
  const hasEnglish = jobNorm.includes('ingles') || jobNorm.includes('english');
  if (!hasEnglish) return { required: false, level: null };
  let level = null;
  const map = [
    {k:'basico', v:'basico'},
    {k:'intermediario', v:'intermediario'},
    {k:'avancado', v:'avancado'},
    {k:'fluente', v:'fluente'}
  ];
  for (const m of map){
    if (jobNorm.includes(m.k)) { level = m.v; break; }
  }
  return { required: true, level };
}

function detectLanguageInResume(resumeNorm){
  const hasEnglish = resumeNorm.includes('ingles') || resumeNorm.includes('english');
  if (!hasEnglish) return { present: false, level: null };
  let level = null;
  const map = [
    {k:'basico', v:'basico'},
    {k:'intermediario', v:'intermediario'},
    {k:'avancado', v:'avancado'},
    {k:'fluente', v:'fluente'}
  ];
  for (const m of map){
    if (resumeNorm.includes(m.k)) { level = m.v; break; }
  }
  return { present: true, level };
}

function levelRank(level){
  if (!level) return 0;
  if (level === 'basico') return 1;
  if (level === 'intermediario') return 2;
  if (level === 'avancado') return 3;
  if (level === 'fluente') return 4;
  return 0;
}

function scoreLanguage(jobNorm, resumeNorm){
  const req = detectLanguageRequirement(jobNorm);
  if (!req.required) return { score: 1, comment: 'Idioma nao exigido explicitamente na vaga.' };

  const res = detectLanguageInResume(resumeNorm);
  if (!res.present) return { score: 0.2, comment: 'A vaga menciona ingles, mas o curriculo nao informa nivel.' };

  if (!req.level) return { score: 1, comment: 'A vaga menciona ingles e o curriculo tambem.' };

  const ok = levelRank(res.level) >= levelRank(req.level);
  return {
    score: ok ? 1 : 0.45,
    comment: ok
      ? `Ingles no curriculo atende ao nivel pedido (${req.level}).`
      : `A vaga pede ingles ${req.level}, mas o curriculo indica ${res.level || 'nivel nao claro'}.`
  };
}

function extractRequirementItems(jobText){
  // Heurística simples: pega linhas/bullets e classifica por palavras-chave.
  const lines = (jobText || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const req = [];
  const nice = [];
  let mode = 'unknown';

  for (const line of lines){
    const ln = normalize(line);

    if (/\brequisitos\b/.test(ln) || /\bobrigatori/.test(ln)) mode = 'req';
    if (/\bdiferencia/.test(ln) || /\bdesej/.test(ln)) mode = 'nice';

    const isBullet = /^[-•*]/.test(line) || line.length < 140;
    if (!isBullet) continue;

    if (mode === 'req') req.push(line.replace(/^[-•*]\s?/, ''));
    else if (mode === 'nice') nice.push(line.replace(/^[-•*]\s?/, ''));
  }

  // Fallback: se não achou nada, usa tokens gerais.
  return {
    requiredItems: req.slice(0, CONFIG.maxReqItems),
    niceItems: nice.slice(0, CONFIG.maxReqItems)
  };
}

function matchItemsToResume(items, resumeNorm){
  const present = [];
  const missing = [];
  for (const it of (items || [])){
    const t = normalize(it);
    // Extrai termos importantes do item e verifica se ao menos alguns aparecem.
    const tokens = tokenizeImportant(t);
    if (!tokens.length){
      if (resumeNorm.includes(t)) present.push(it); else missing.push(it);
      continue;
    }
    const hits = tokens.filter(tok => resumeNorm.includes(tok)).length;
    const ratio = hits / tokens.length;
    if (ratio >= 0.34) present.push(it);
    else missing.push(it);
  }
  const total = present.length + missing.length;
  return { present, missing, score: total ? present.length/total : 0 };
}

function computeTokenMatch(jobTokens, resumeNorm){
  const present = [];
  const missing = [];
  for (const tok of jobTokens){
    if (!tok) continue;
    if (resumeNorm.includes(tok)) present.push(tok);
    else missing.push(tok);
  }
  const total = present.length + missing.length;
  return { present, missing, score: total ? present.length/total : 0 };
}

function weightedOverall(scores){
  const w = CONFIG.weights;
  const v =
    (scores.matchAllTerms * w.matchAllTerms) +
    (scores.matchRequired * w.matchRequired) +
    (scores.impactMetrics * w.impactMetrics) +
    (scores.structure * w.structure) +
    (scores.clarity * w.clarity) +
    (scores.size * w.size) +
    (scores.language * w.language);
  return Math.max(0, Math.min(1, v));
}

function buildHeuristicReport(resumeText, jobText, extraKw){
  const resumeLen = resumeText.length;
  const jobLen = jobText.length;

  const resumeNorm = normalize(resumeText);
  const jobNorm = normalize(jobText);

  const jobTokens = tokenizeImportant(jobNorm);
  const tokenMatch = computeTokenMatch(jobTokens, resumeNorm);

  // requisitos vs diferenciais
  const reqParts = extractRequirementItems(jobText);
  const reqMatch = matchItemsToResume(reqParts.requiredItems, resumeNorm);
  const niceMatch = matchItemsToResume(reqParts.niceItems, resumeNorm);

  // palavras-chave extras
  let extraMatch = { score: 1, present: [], missing: [] };
  if (extraKw.length){
    const present = [];
    const missing = [];
    for (const kw of extraKw){
      const kwn = normalize(kw);
      if (!kwn) continue;
      if (resumeNorm.includes(kwn)) present.push(kw);
      else missing.push(kw);
    }
    const total = present.length + missing.length;
    extraMatch = { score: total ? present.length/total : 0, present, missing };
  }

  const sizeScore = scoreSize(resumeLen);
  const clarityScore = scoreClarity(resumeText);
  const sectionScore = scoreSections(resumeNorm);
  const impact = detectImpactMetrics(resumeText);
  const lang = scoreLanguage(jobNorm, resumeNorm);

  const scores = {
    matchAllTerms: tokenMatch.score,
    matchRequired: reqMatch.score,
    impactMetrics: impact.score,
    structure: sectionScore.score,
    clarity: clarityScore,
    size: sizeScore,
    language: lang.score
  };

  // pequena bonificação por keywords extras (sem distorcer)
  let overall = weightedOverall(scores);
  if (extraKw.length) overall = Math.max(0, Math.min(1, overall * 0.95 + extraMatch.score * 0.05));

  const scorePct = Math.round(overall * 100);
  const matchPct = Math.round(tokenMatch.score * 100);

  const comments = [];

  // tamanho
  if (resumeLen < CONFIG.minChars) comments.push(`Curriculo curto (${resumeLen} caracteres). Adicione detalhes (responsabilidades, escopo, resultados).`);
  else if (resumeLen > CONFIG.maxChars) comments.push(`Curriculo longo (${resumeLen} caracteres). Priorize o que e mais relevante para esta vaga.`);
  else comments.push('Tamanho do curriculo dentro da faixa recomendada.');

  // estrutura
  if (sectionScore.missing.length){
    comments.push(`Secoes nao detectadas: ${sectionScore.missing.join(', ')}. Isso pode reduzir clareza para recrutadores/ATS.`);
  } else {
    comments.push('Estrutura basica detectada (experiencia, formacao, habilidades, projetos).');
  }

  // clareza
  if (clarityScore < 0.7) comments.push('Clareza: ha linhas ou frases longas. Use bullet points e frases mais diretas.');
  else comments.push('Clareza textual boa/aceitavel.');

  // impacto
  if (impact.score < 0.45){
    comments.push('Poucas evidencias de impacto (numeros/KPIs). Inclua resultados quantificados quando possivel.');
  } else {
    comments.push(`Evidencias de impacto detectadas (numeros: ${impact.numbers}, percentuais: ${impact.perc}, KPIs: ${impact.kpis}).`);
  }

  // idioma
  comments.push(lang.comment);

  // aderencia por termos
  if (matchPct >= 80) comments.push(`Boa aderencia geral aos termos da vaga (${matchPct}%).`);
  else if (matchPct >= 50) comments.push(`Aderencia media aos termos da vaga (${matchPct}%). Ha termos importantes ausentes.`);
  else comments.push(`Baixa aderencia aos termos da vaga (${matchPct}%). Vale alinhar melhor o curriculo.`);

  // requisitos
  if (reqParts.requiredItems.length){
    const missingReqCount = reqMatch.missing.length;
    if (missingReqCount) comments.push(`Ausencias criticas: ${missingReqCount} requisitos parecem nao aparecer no curriculo. Priorize ajustar isso.`);
    else comments.push('Requisitos obrigatorios parecem cobertos (pela heuristica).');
  } else {
    comments.push('Nao foi possivel separar claramente requisitos obrigatorios vs diferenciais na descricao; use a lista de ausencias como guia geral.');
  }

  // keywords extras
  if (extraKw.length){
    if (extraMatch.missing.length) comments.push(`Palavras-chave extras ausentes: ${extraMatch.missing.join(', ')}.`);
    else comments.push('Todas as palavras-chave extras informadas aparecem no curriculo.');
  }

  // links
  if (!/linkedin\.com|github\.com|portfolio|portfoli|site/.test(resumeNorm)){
    comments.push('Sugestao: inclua links relevantes (LinkedIn, GitHub, portfolio) se fizer sentido para sua area.');
  }

  const details = [
    { name: 'aderencia (termos gerais)', pct: Math.round(scores.matchAllTerms*100) },
    { name: 'cobertura de requisitos', pct: Math.round(scores.matchRequired*100) },
    { name: 'impacto (metricas)', pct: Math.round(scores.impactMetrics*100) },
    { name: 'estrutura (secoes)', pct: Math.round(scores.structure*100) },
    { name: 'clareza', pct: Math.round(scores.clarity*100) },
    { name: 'tamanho', pct: Math.round(scores.size*100) },
    { name: 'idioma', pct: Math.round(scores.language*100) },
  ];

  return {
    scorePct,
    matchPct,
    resumeLen,
    jobLen,
    label: overallLabel(scorePct),
    details,
    comments,
    strengths: tokenMatch.present.slice(0, CONFIG.maxTags),
    weaknesses: tokenMatch.missing.slice(0, CONFIG.maxTags),
    criticalMissing: reqMatch.missing.slice(0, CONFIG.maxTags),
    niceMissing: niceMatch.missing.slice(0, CONFIG.maxTags)
  };
}

function showResultsUI(report){
  formSec.style.display = 'none';
  resultsSec.style.display = 'block';

  summaryTextEl.textContent = 'Score geral (heuristica) ponderado por aderencia, requisitos, impacto, estrutura, clareza, tamanho e idioma.';
  scoreLabelEl.textContent = report.label;

  animateNumber(scoreEl, 0, report.scorePct, 900);
  setRing(report.scorePct);

  statCharsEl.textContent = String(report.resumeLen);
  statJobCharsEl.textContent = String(report.jobLen);
  statMatchEl.textContent = report.matchPct + '%';

  renderDetails(report.details);
  renderTags(strengthsEl, report.strengths);
  renderTags(weaknessesEl, report.weaknesses);
  renderTags(criticalMissingEl, report.criticalMissing);
  renderTags(niceMissingEl, report.niceMissing);
  renderComments(report.comments);

  resultsSec.scrollIntoView({behavior:'smooth', block:'start'});

  window.__lastHeuristicReport = report;
}

async function readFileToText(file){
  if (!file) return '';
  const ext = file.name.split('.').pop().toLowerCase();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Erro ao ler arquivo'));

    if (ext === 'txt'){
      reader.onload = () => resolve(String(reader.result || ''));
      reader.readAsText(file, 'utf-8');
      return;
    }

    if (ext === 'pdf'){
      reader.onload = async () => {
        try{
          const uint8 = new Uint8Array(reader.result);
          if (!window.pdfjsLib) throw new Error('pdf.js nao carregado');
          pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          const pdf = await pdfjsLib.getDocument({data:uint8}).promise;
          let text = '';
          for (let i = 1; i <= pdf.numPages; i++){
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            const strings = content.items.map(it => it.str);
            text += strings.join(' ') + '\n';
          }
          resolve(text);
        } catch(err){
          reject(err);
        }
      };
      reader.readAsArrayBuffer(file);
      return;
    }

    if (ext === 'docx'){
      reader.onload = async () => {
        try{
          if (!window.mammoth) throw new Error('mammoth.js nao carregado');
          const arrayBuffer = reader.result;
          const result = await mammoth.extractRawText({arrayBuffer});
          resolve(result.value || '');
        } catch(err){
          reject(err);
        }
      };
      reader.readAsArrayBuffer(file);
      return;
    }

    reject(new Error('Formato nao suportado. Use .pdf, .docx ou .txt'));
  });
}

async function loadResumeFromFile(){
  const file = resumeFileEl.files && resumeFileEl.files[0];
  if (!file) return;
  resumeFileInfoEl.textContent = `Arquivo selecionado: ${file.name}`;
  showLoading(true, 'Lendo arquivo do curriculo...');
  try{
    const text = await readFileToText(file);
    resumeEl.value = text;
    updateCharCount();
  } catch(err){
    alert('Erro ao ler arquivo: ' + err.message);
  } finally {
    showLoading(false);
  }
}

async function fetchJobFromUrl(){
  const url = (jobUrlEl.value || '').trim();
  if (!url){
    alert('Cole o link da vaga no campo acima.');
    jobUrlEl.focus();
    return;
  }
  showLoading(true, 'Buscando descricao da vaga...');
  try{
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
    const response = await fetch(proxyUrl);
    if (!response.ok) throw new Error(`Erro HTTP: ${response.status}`);
    const data = await response.json();
    const html = data.contents;

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    doc.querySelectorAll('script, style, noscript, iframe').forEach(el => el.remove());
    let text = (doc.body && (doc.body.innerText || doc.body.textContent)) ? (doc.body.innerText || doc.body.textContent) : '';
    text = text.replace(/\s+/g, ' ').trim();

    if (!text || text.length < 200){
      throw new Error('Nao foi possivel extrair texto suficiente da pagina. Alguns sites bloqueiam esse tipo de acesso.');
    }

    jobEl.value = text;
    alert('Descricao da vaga carregada. Revise o texto e clique em Avaliar.');
  } catch(err){
    alert('Erro ao buscar vaga: ' + err.message + '\n\nSe falhar, copie e cole a descricao manualmente.');
  } finally {
    showLoading(false);
  }
}

function updateCharCount(){
  const n = (resumeEl.value || '').length;
  charCountEl.textContent = String(n);
  if (n < CONFIG.minChars) charCountEl.style.color = 'var(--warn)';
  else if (n > CONFIG.maxChars) charCountEl.style.color = 'var(--bad)';
  else charCountEl.style.color = 'var(--good)';
}

function reset(){
  resultsSec.style.display = 'none';
  formSec.style.display = 'grid';
  window.scrollTo({top:0, behavior:'smooth'});
}

function evaluateHeuristic(){
  const resumeText = resumeEl.value || '';
  const jobText = jobEl.value || '';
  const extraKw = splitKeywords(keywordsEl.value);

  if (!resumeText.trim()){
    alert('Cole o texto do curriculo ou envie um arquivo.');
    resumeEl.focus();
    return;
  }
  if (!jobText.trim()){
    alert('Cole a descricao da vaga (ou use Buscar vaga por URL).');
    jobEl.focus();
    return;
  }

  const report = buildHeuristicReport(resumeText, jobText, extraKw);
  showResultsUI(report);
}

async function testAiEndpoint(){
  const endpoint = (aiEndpointEl.value || '').trim();
  if (!endpoint){
    alert('Informe o endpoint da API de IA.');
    aiEndpointEl.focus();
    return;
  }
  showLoading(true, 'Testando endpoint...');
  try{
    const r = await fetch(endpoint, { method: 'OPTIONS' });
    // Alguns hosts nao respondem OPTIONS; entao, fazemos POST leve.
    if (r.ok){
      alert('Endpoint respondeu.');
      return;
    }
  } catch (e) {
    // ignora
  }
  try{
    const r2 = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ping: true })
    });
    const txt = await r2.text();
    if (!r2.ok) throw new Error(txt || ('HTTP ' + r2.status));
    alert('Endpoint OK.');
  } catch(err){
    alert('Falha ao testar endpoint: ' + err.message);
  } finally {
    showLoading(false);
  }
}

async function evaluateWithAi(){
  const endpoint = (aiEndpointEl.value || '').trim();
  if (!endpoint){
    alert('Para usar IA, preencha o endpoint (ex.: Vercel).');
    aiEndpointEl.focus();
    return;
  }

  const resumeText = resumeEl.value || '';
  const jobText = jobEl.value || '';
  const extraKw = splitKeywords(keywordsEl.value);

  if (!resumeText.trim()){
    alert('Cole o texto do curriculo ou envie um arquivo.');
    resumeEl.focus();
    return;
  }
  if (!jobText.trim()){
    alert('Cole a descricao da vaga (ou use Buscar vaga por URL).');
    jobEl.focus();
    return;
  }

  // Mostra heuristica também, para ter algo imediato na tela
  const report = buildHeuristicReport(resumeText, jobText, extraKw);
  showResultsUI(report);

  showLoading(true, 'Gerando relatorio com IA...');
  aiReportEl.textContent = 'Gerando relatorio com IA...';

  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), CONFIG.aiTimeoutMs);

  try{
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resumeText, jobText, extraKeywords: extraKw }),
      signal: ctrl.signal
    });
    clearTimeout(id);

    if (!resp.ok){
      const errTxt = await resp.text();
      throw new Error(errTxt || ('HTTP ' + resp.status));
    }

    const data = await resp.json();
    if (!data || !data.reportText) throw new Error('Resposta invalida do endpoint (faltando reportText).');

    aiReportEl.textContent = data.reportText;
    window.__lastAiReport = data.reportText;

  } catch(err){
    aiReportEl.textContent = 'Falha ao gerar relatorio com IA.\n\n' + String(err.message || err);
  } finally {
    showLoading(false);
  }
}

btnFetchJob.addEventListener('click', fetchJobFromUrl);
btnAiTest.addEventListener('click', testAiEndpoint);
resumeFileEl.addEventListener('change', loadResumeFromFile);
resumeEl.addEventListener('input', updateCharCount);

btnEvaluate.addEventListener('click', evaluateHeuristic);
btnEvaluateAi.addEventListener('click', evaluateWithAi);

btnExample.addEventListener('click', () => {
  resumeEl.value = EXAMPLE_RESUME;
  jobEl.value = EXAMPLE_JOB;
  updateCharCount();
  resumeEl.focus();
});

btnClear.addEventListener('click', () => {
  resumeEl.value = '';
  jobEl.value = '';
  keywordsEl.value = '';
  jobUrlEl.value = '';
  aiEndpointEl.value = '';
  resumeFileEl.value = '';
  resumeFileInfoEl.textContent = 'Nenhum arquivo selecionado.';
  aiReportEl.textContent = 'Nenhum relatorio de IA gerado ainda.';
  window.__lastAiReport = null;
  updateCharCount();
  resumeEl.focus();
});

btnNew?.addEventListener('click', reset);

btnCopy?.addEventListener('click', async () => {
  const r = window.__lastHeuristicReport;
  if (!r) return;
  const lines = [];
  lines.push('Relatorio (heuristica) - Curriculo x Vaga');
  lines.push(`Score geral: ${r.scorePct}/100`);
  lines.push(`Aderencia (termos): ${r.matchPct}%`);
  lines.push('');
  lines.push('Detalhes:');
  for (const d of r.details) lines.push(`- ${d.name}: ${d.pct}%`);
  lines.push('');
  lines.push('Pontos fortes (termos presentes):');
  lines.push(r.strengths.length ? '  ' + r.strengths.join(', ') : '  (nenhum)');
  lines.push('');
  lines.push('Pontos a melhorar (termos ausentes):');
  lines.push(r.weaknesses.length ? '  ' + r.weaknesses.join(', ') : '  (nenhum)');
  lines.push('');
  lines.push('Ausencias criticas (requisitos):');
  lines.push(r.criticalMissing.length ? '  ' + r.criticalMissing.join(' | ') : '  (nenhuma)');
  lines.push('');
  lines.push('Comentarios:');
  for (const c of r.comments) lines.push('- ' + c);

  const text = lines.join('\n');
  try{
    await navigator.clipboard.writeText(text);
    btnCopy.textContent = 'Copiado!';
    setTimeout(()=>btnCopy.textContent='Copiar relatorio (heuristica)', 1200);
  }catch(e){
    alert('Nao foi possivel copiar automaticamente.');
  }
});

btnCopyAi?.addEventListener('click', async () => {
  const t = window.__lastAiReport;
  if (!t) return;
  try{
    await navigator.clipboard.writeText(t);
    btnCopyAi.textContent = 'Copiado!';
    setTimeout(()=>btnCopyAi.textContent='Copiar relatorio (IA)', 1200);
  }catch(e){
    alert('Nao foi possivel copiar automaticamente.');
  }
});

window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter'){
    if (formSec.style.display !== 'none') evaluateHeuristic();
  }
});

updateCharCount();
