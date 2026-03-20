const fs = require('fs');
const env = Object.fromEntries(
  fs
    .readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const idx = line.indexOf('=');
      return [line.slice(0, idx), line.slice(idx + 1)];
    })
);

async function main() {
  const id = 'ac94b504-b5fa-483c-8234-ce0da6b4d58c';
  const jobRes = await fetch('http://127.0.0.1:3001/jobs/' + id);
  const job = (await jobRes.json()).job;

  const prompt = [
    'Score this job for shortlist triage.',
    '',
    'Company: ' + job.companyName,
    'Title: ' + job.title,
    'Location: ' + (job.location || 'Unspecified'),
    'Remote type: ' + job.remoteType,
    'Employment type: ' + (job.employmentType ?? 'Unspecified'),
    'Compensation: ' + (job.compensationText ?? 'Unspecified'),
    'Existing review notes: ' + (job.reviewNotes || 'None'),
    '',
    'Description:',
    job.descriptionText || 'No description provided.'
  ].join('\n');

  const body = {
    model: env.OPENROUTER_JOB_SUMMARY_MODEL,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'job_summary',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            summary: { type: 'string', minLength: 1, maxLength: 600 },
            score: { type: 'integer', minimum: 0, maximum: 100 },
            reasoning: { type: 'string', minLength: 1, maxLength: 1200 }
          },
          required: ['summary', 'score', 'reasoning']
        }
      }
    },
    messages: [
      {
        role: 'system',
        content: 'You summarize discovered jobs for shortlist triage. Return only the requested JSON object.'
      },
      {
        role: 'user',
        content: prompt
      }
    ]
  };

  console.log('promptChars', prompt.length);
  try {
    const res = await fetch(env.OPENROUTER_API_BASE_URL.replace(/\/$/, '') + '/chat/completions', {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + env.OPENROUTER_API_KEY,
        'content-type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    console.log('status', res.status);
    const text = await res.text();
    console.log(text.slice(0, 1000));
  } catch (error) {
    console.error('ERR', error && error.message ? error.message : String(error));
    if (error && error.cause) {
      console.error('CAUSE', error.cause);
    }
  }
}

main();
