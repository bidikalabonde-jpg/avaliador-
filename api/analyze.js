export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      return res.status(204).end();
    }

    if (req.method !== 'POST') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.status(405).json({ error: 'Method not allowed' });
    }

    res.setHeader('Access-Control-Allow-Origin', '*');

    const body = req.body || {};
    if (body.ping) {
      return res.status(200).json({ ok: true });
    }

    const resumeText = String(body.resumeText || '').trim();
    const jobText = String(body.jobText || '').trim();
    const extraKeywords = Array.isArray(body.extraKeywords) ? body.extraKeywords : [];

    if (!resumeText || !jobText) {
      return res.status(400).json({ error: 'resumeText e jobText sao obrigatorios' });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'OPENAI_API_KEY nao configurada no servidor' });
    }

    const prompt = [
      'Voce e um recrutador tecnico e um especialista em ATS.',
      'Tarefa: comparar um curriculo com uma descricao de vaga e gerar um relatorio em pt-BR, em texto simples.',
      'Regras importantes:',
      '- Nao invente experiencias, empresas, projetos, certificacoes ou ferramentas que nao estejam no curriculo.',
      '- Se algo nao estiver no curriculo, trate como lacuna e sugira como evidenciar (sem mentir).',
      '- Seja especifico, cite evidencias do curriculo (trechos curtos) quando possivel.',
      '- Produza uma resposta objetiva e acionavel.',
      '',
      'Formato da resposta (texto puro, com titulos):',
      '1) Resumo (3-6 linhas)',
      '2) Pontos fortes (bullet points)',
      '3) Lacunas e riscos (bullet points) - priorize requisitos obrigatorios',
      '4) Sugestoes de melhorias no curriculo (bullet points) - reescrever 3 bullets com melhor impacto',
      '5) Palavras-chave recomendadas (lista separada por virgula)',
      '6) Perguntas que eu deveria estar pronto para responder na entrevista (5-8 itens)',
      '',
      'Palavras-chave extras informadas pelo usuario (pode considerar como alvo, sem inventar): ' + (extraKeywords.length ? extraKeywords.join(', ') : '(nenhuma)'),
      '',
      'CURRICULO:',
      resumeText,
      '',
      'VAGA:',
      jobText
    ].join('\n');

    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

    const r = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        input: prompt,
        temperature: 0.2
      })
    });

    const data = await r.json();
    if (!r.ok) {
      return res.status(r.status).json({ error: data });
    }

    // Extrai texto
    let reportText = '';
    if (data.output_text) {
      reportText = data.output_text;
    } else {
      // Fallback: tenta navegar outputs
      reportText = JSON.stringify(data);
    }

    return res.status(200).json({ reportText });

  } catch (err) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(500).json({ error: String(err?.message || err) });
  }
}
